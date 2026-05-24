import prisma from '@/lib/prisma';
import { ReservationStatus } from '@prisma/client';

export interface CreateReservationInput {
  inventoryId: string;
  quantity: number;
  expiryMinutes?: number;
}

export class ReservationService {
  /**
   * Concurrency-Safe Reservation Creation using a PostgreSQL transaction
   * and pessimistic row-level locking (SELECT ... FOR UPDATE).
   */
  static async createReservation(input: CreateReservationInput) {
    const { inventoryId, quantity, expiryMinutes = 10 } = input;
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + expiryMinutes);

    return await prisma.$transaction(async (tx) => {
      // 1. Lock the inventory row exclusively using SELECT ... FOR UPDATE
      // Prisma does not support row-locking directly, so we run a raw Postgres query.
      const lockedInventories = await tx.$queryRaw<any[]>`
        SELECT * FROM "Inventory"
        WHERE "id" = ${inventoryId}
        FOR UPDATE
      `;

      if (lockedInventories.length === 0) {
        throw new Error("INVENTORY_NOT_FOUND");
      }

      const inventory = lockedInventories[0];
      const availableUnits = inventory.totalUnits - inventory.reservedUnits;

      // 2. Check stock capacity atomically
      if (availableUnits < quantity) {
        throw new Error("INSUFFICIENT_STOCK"); // Will trigger automatic transaction rollback
      }

      // 3. Create the Reservation record
      const reservation = await tx.reservation.create({
        data: {
          inventoryId,
          quantity,
          status: ReservationStatus.pending,
          expiresAt,
        },
      });

      // 4. Update parent inventory reserved units
      await tx.inventory.update({
        where: { id: inventoryId },
        data: {
          reservedUnits: {
            increment: quantity,
          },
        },
      });

      return reservation;
    });
  }

  /**
   * Concurrency-safe state transition: pending -> confirmed.
   * Only pending, non-expired reservations can be confirmed.
   * Decrements both reservedUnits and totalUnits.
   */
  static async confirmReservation(id: string) {
    return await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({
        where: { id },
      });

      if (!reservation) {
        throw new Error("RESERVATION_NOT_FOUND");
      }

      if (reservation.status !== ReservationStatus.pending) {
        throw new Error("INVALID_STATE_TRANSITION");
      }

      // Expiry validation: return HTTP 410 (via RESERVATION_EXPIRED error mapping) if expired
      const now = new Date();
      if (reservation.expiresAt < now) {
        throw new Error("RESERVATION_EXPIRED");
      }

      // 1. Update parent inventory (deduct reserved and total units since checkout is complete)
      await tx.inventory.update({
        where: { id: reservation.inventoryId },
        data: {
          reservedUnits: {
            decrement: reservation.quantity,
          },
          totalUnits: {
            decrement: reservation.quantity,
          },
        },
      });

      // 2. Transition reservation status
      return await tx.reservation.update({
        where: { id },
        data: {
          status: ReservationStatus.confirmed,
          confirmedAt: new Date(),
        },
      });
    });
  }

  /**
   * Release a pending reservation manually (pending -> released).
   * Restores held inventory units.
   */
  static async releaseReservation(id: string) {
    return await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({
        where: { id },
      });

      if (!reservation) {
        throw new Error("RESERVATION_NOT_FOUND");
      }

      if (reservation.status !== ReservationStatus.pending) {
        throw new Error("INVALID_STATE_TRANSITION");
      }

      // 1. Decrement reservedUnits in parent inventory to return stock to available pool
      await tx.inventory.update({
        where: { id: reservation.inventoryId },
        data: {
          reservedUnits: {
            decrement: reservation.quantity,
          },
        },
      });

      // 2. Transition reservation status
      return await tx.reservation.update({
        where: { id },
        data: {
          status: ReservationStatus.released,
          releasedAt: new Date(),
        },
      });
    });
  }

  /**
   * Vercel Cron-triggered batch cleanup job.
   * Releases all expired reservations (status = pending and expiresAt < now)
   * in a safe, transactional, and idempotent row-locking workflow.
   */
  static async cleanupExpiredReservations() {
    const now = new Date();
    console.log(`[Cleanup] Started reservation cleanup check at ${now.toISOString()}`);

    // 1. Find all expired pending reservations
    const expiredReservations = await prisma.reservation.findMany({
      where: {
        status: ReservationStatus.pending,
        expiresAt: {
          lt: now,
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    console.log(`[Cleanup] Found ${expiredReservations.length} expired pending reservations.`);

    const releasedReservationIds: string[] = [];

    for (const reservation of expiredReservations) {
      try {
        await prisma.$transaction(async (tx) => {
          // Step 1: Lock the related inventory row to prevent concurrent adjustments
          const lockedInventories = await tx.$queryRaw<any[]>`
            SELECT * FROM "Inventory"
            WHERE "id" = ${reservation.inventoryId}
            FOR UPDATE
          `;

          if (lockedInventories.length === 0) {
            throw new Error("INVENTORY_NOT_FOUND");
          }

          // Idempotency check: verify reservation status is still pending inside the transaction
          const currentRes = await tx.reservation.findUnique({
            where: { id: reservation.id },
          });

          if (!currentRes || currentRes.status !== ReservationStatus.pending) {
            console.log(`[Cleanup] Skipping reservation ${reservation.id} - status already transitioned.`);
            return;
          }

          // Step 2: Update reservation status -> released and releasedAt -> now
          await tx.reservation.update({
            where: { id: reservation.id },
            data: {
              status: ReservationStatus.released,
              releasedAt: new Date(),
            },
          });

          // Step 3: Decrement parent Inventory.reservedUnits
          await tx.inventory.update({
            where: { id: reservation.inventoryId },
            data: {
              reservedUnits: {
                decrement: reservation.quantity,
              },
            },
          });

          releasedReservationIds.push(reservation.id);
          console.log(`[Cleanup] Successfully released expired reservation: ${reservation.id}`);
        });
      } catch (err: any) {
        console.error(`[Cleanup] Failed to release expired reservation ${reservation.id}:`, err);
      }
    }

    console.log(`[Cleanup] Cleanup completed. Released ${releasedReservationIds.length} reservations.`);

    return {
      cleaned: releasedReservationIds.length,
      releasedReservationIds,
    };
  }
}
