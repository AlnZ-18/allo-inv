import prisma from '@/lib/prisma';
import { ReservationStatus } from '@prisma/client';

export interface CreateReservationInput {
  inventoryId: string;
  units: number;
  expiryMinutes?: number;
}

export class ReservationService {
  /**
   * Concurrency-Safe Reservation Creation using a PostgreSQL transaction
   * and pessimistic row-level locking (SELECT ... FOR UPDATE).
   */
  static async createReservation(input: CreateReservationInput) {
    const { inventoryId, units, expiryMinutes = 5 } = input;
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + expiryMinutes);

    // Explicit monolithic database transaction
    return await prisma.$transaction(async (tx) => {
      // 1. Lock the inventory row using SELECT ... FOR UPDATE
      // Since Prisma doesn't support built-in row locking, we run a raw Postgres query.
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

      // 2. Check stock capacity
      if (availableUnits < units) {
        throw new Error("INSUFFICIENT_STOCK"); // Rollback automatically triggered
      }

      // 3. Create the Reservation record
      const reservation = await tx.reservation.create({
        data: {
          inventoryId,
          units,
          status: ReservationStatus.pending,
          expiresAt,
        },
      });

      // 4. Update the parent inventory's reserved units
      await tx.inventory.update({
        where: { id: inventoryId },
        data: {
          reservedUnits: {
            increment: units,
          },
        },
      });

      return reservation;
    });
  }

  /**
   * Concurrency-safe state transition: pending -> confirmed.
   * Confirmed reservations can never be released.
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
   * Restores reserved inventory units.
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

      // Decrement the held inventory reserved units
      await tx.inventory.update({
        where: { id: reservation.inventoryId },
        data: {
          reservedUnits: {
            decrement: reservation.units,
          },
        },
      });

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
   * in a safe transactional workflow.
   */
  static async cleanupExpiredReservations() {
    const now = new Date();

    // Find all expired pending reservations
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
        // Log error and continue to avoid blocking other expirations
        console.error(`Failed to release reservation ${reservation.id}:`, err);
      }
    }

    return { releasedCount };
  }
}
