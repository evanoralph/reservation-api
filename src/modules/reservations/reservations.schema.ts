import { z } from 'zod';

export const createReservationBodySchema = z.object({
  item_id: z.uuid('item_id must be a valid UUID'),
  customer_id: z
    .string()
    .trim()
    .min(1, 'customer_id must be a non-empty string'),
  quantity: z
    .number({ error: 'quantity must be an integer greater than zero' })
    .int('quantity must be an integer greater than zero')
    .positive('quantity must be an integer greater than zero'),
});

export const reservationIdParamsSchema = z.object({
  id: z.uuid('id must be a valid UUID'),
});

export type CreateReservationBody = z.infer<typeof createReservationBodySchema>;
export type ReservationIdParams = z.infer<typeof reservationIdParamsSchema>;
