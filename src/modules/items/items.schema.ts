import { z } from 'zod';

export const createItemBodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'name must be a non-empty string'),
  initial_quantity: z
    .number({ error: 'initial_quantity must be an integer greater than zero' })
    .int('initial_quantity must be an integer greater than zero')
    .positive('initial_quantity must be an integer greater than zero'),
});

export const itemIdParamsSchema = z.object({
  id: z.uuid('id must be a valid UUID'),
});

export type CreateItemBody = z.infer<typeof createItemBodySchema>;
export type ItemIdParams = z.infer<typeof itemIdParamsSchema>;
