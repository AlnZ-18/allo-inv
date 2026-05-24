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
   * Releases all expired reservations in a safe transaction pool.
   */
  static async cleanupExpiredReservations() {
    const now = new Date();

    const expiredReservations = await prisma.reservation.findMany({
      where: {
        status: ReservationStatus.pending,
        expiresAt: {
          lt: now,
        },
      },
    });

    let releasedCount = 0;

    for (const reservation of expiredReservations) {
      try {
        await this.releaseReservation(reservation.id);
        releasedCount++;
      } catch (err) {
        console.error(`Failed to release expired reservation ${reservation.id}:`, err);
      }
    }

    return { releasedCount };
  }
}
