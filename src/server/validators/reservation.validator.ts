import { z } from 'zod';

export const createReservationSchema = z.object({
  inventoryId: z.string().uuid({ message: "Inventory ID must be a valid UUID" }),
  quantity: z
    .number({ message: "Quantity is required and must be a number" })
    .int({ message: "Quantity must be an integer" })
    .positive({ message: "Quantity must be strictly greater than 0" }),
});

export const confirmReservationSchema = z.object({
  id: z.string().uuid({ message: "Reservation ID must be a valid UUID" }),
});

export const releaseReservationSchema = z.object({
  id: z.string().uuid({ message: "Reservation ID must be a valid UUID" }),
});

export type CreateReservationInput = z.infer<typeof createReservationSchema>;
export type ConfirmReservationInput = z.infer<typeof confirmReservationSchema>;
export type ReleaseReservationInput = z.infer<typeof releaseReservationSchema>;
