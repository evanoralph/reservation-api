import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Must run before any .openapi() schema construction.
extendZodWithOpenApi(z);

console.log('[openapi] Building OpenAPI registry');

const registry = new OpenAPIRegistry();

// ---------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------

const ErrorBodySchema = registry.register(
  'ErrorBody',
  z.object({
    code: z.string().openapi({
      example: 'INSUFFICIENT_INVENTORY',
      description: 'Machine-readable error code',
    }),
    message: z.string().openapi({
      example: 'The requested quantity is not available.',
    }),
    details: z.any().nullable().openapi({
      example: null,
      description: 'Optional validation or debug details',
    }),
  }),
);

const ErrorResponseSchema = registry.register(
  'ErrorResponse',
  z.object({
    success: z.literal(false),
    error: ErrorBodySchema,
  }),
);

const HealthDataSchema = registry.register(
  'HealthData',
  z.object({
    status: z.literal('ok').openapi({ example: 'ok' }),
  }),
);

const ItemStatusSchema = registry.register(
  'ItemStatus',
  z.object({
    id: z.uuid().openapi({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }),
    name: z.string().openapi({ example: 'White T-Shirt' }),
    total_quantity: z.number().int().openapi({ example: 5 }),
    available_quantity: z.number().int().openapi({
      example: 3,
      description: 'total - confirmed - held (active pending only)',
    }),
    held_quantity: z.number().int().openapi({
      example: 2,
      description: 'Quantity held by non-expired PENDING reservations',
    }),
    confirmed_quantity: z.number().int().openapi({ example: 0 }),
  }),
);

const CreateItemBodySchema = registry.register(
  'CreateItemBody',
  z.object({
    name: z.string().min(1).openapi({ example: 'White T-Shirt' }),
    initial_quantity: z.number().int().positive().openapi({ example: 5 }),
  }),
);

const CreateReservationBodySchema = registry.register(
  'CreateReservationBody',
  z.object({
    item_id: z.uuid().openapi({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }),
    customer_id: z.string().min(1).openapi({ example: 'customer-001' }),
    quantity: z.number().int().positive().openapi({ example: 2 }),
  }),
);

const ReservationSchema = registry.register(
  'Reservation',
  z.object({
    id: z.uuid().openapi({ example: '7c9e6679-7425-40de-944b-e07fc1f90ae7' }),
    item_id: z.uuid().openapi({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }),
    customer_id: z.string().openapi({ example: 'customer-001' }),
    quantity: z.number().int().openapi({ example: 2 }),
    status: z
      .enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED'])
      .openapi({ example: 'PENDING' }),
    created_at: z.string().datetime().openapi({ example: '2026-07-25T12:00:00.000Z' }),
    expires_at: z.string().datetime().openapi({ example: '2026-07-25T12:10:00.000Z' }),
  }),
);

const ExpireResultSchema = registry.register(
  'ExpireReservationsResult',
  z.object({
    expired_count: z.number().int().nonnegative().openapi({ example: 3 }),
  }),
);

function successOf<T extends z.ZodTypeAny>(name: string, dataSchema: T) {
  return registry.register(
    name,
    z.object({
      success: z.literal(true),
      data: dataSchema,
    }),
  );
}

const HealthResponseSchema = successOf('HealthResponse', HealthDataSchema);
const ItemStatusResponseSchema = successOf('ItemStatusResponse', ItemStatusSchema);
const ReservationResponseSchema = successOf('ReservationResponse', ReservationSchema);
const ExpireResponseSchema = successOf('ExpireReservationsResponse', ExpireResultSchema);

const UuidParam = z.object({
  id: z.uuid().openapi({
    param: { name: 'id', in: 'path' },
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  }),
});

const commonErrorResponses = {
  400: {
    description: 'Bad request',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  422: {
    description: 'Validation error',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  404: {
    description: 'Resource not found',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  409: {
    description: 'Conflict (inventory or reservation state)',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  500: {
    description: 'Internal server error',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
};

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'get',
  path: '/health',
  tags: ['Health'],
  summary: 'Health check',
  description: 'Liveness probe. Does not check database connectivity.',
  responses: {
    200: {
      description: 'Service is healthy',
      content: { 'application/json': { schema: HealthResponseSchema } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/v1/items',
  tags: ['Items'],
  summary: 'Create inventory item',
  description: 'Creates an item with an initial total quantity. Confirmed and held start at 0.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateItemBodySchema,
          example: { name: 'White T-Shirt', initial_quantity: 5 },
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      description: 'Item created',
      content: { 'application/json': { schema: ItemStatusResponseSchema } },
    },
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'get',
  path: '/v1/items/{id}',
  tags: ['Items'],
  summary: 'Get item inventory status',
  description:
    'Returns total, held (active pending), confirmed, and available quantities. ' +
    'available = total - confirmed - held.',
  request: {
    params: UuidParam,
  },
  responses: {
    200: {
      description: 'Item status',
      content: { 'application/json': { schema: ItemStatusResponseSchema } },
    },
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'post',
  path: '/v1/reservations',
  tags: ['Reservations'],
  summary: 'Create inventory reservation',
  description:
    'Atomically creates a PENDING reservation via PostgreSQL RPC with row-level locking. ' +
    'Expires after RESERVATION_TTL_MINUTES (default 10).',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateReservationBodySchema,
          example: {
            item_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
            customer_id: 'customer-001',
            quantity: 2,
          },
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      description: 'Reservation created',
      content: { 'application/json': { schema: ReservationResponseSchema } },
    },
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'post',
  path: '/v1/reservations/{id}/confirm',
  tags: ['Reservations'],
  summary: 'Confirm reservation',
  description:
    'Confirms a PENDING reservation. Retry-safe: repeated confirms do not deduct twice. ' +
    'Expired or cancelled reservations cannot be confirmed.',
  request: {
    params: UuidParam,
  },
  responses: {
    200: {
      description: 'Reservation confirmed (or already confirmed)',
      content: { 'application/json': { schema: ReservationResponseSchema } },
    },
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'post',
  path: '/v1/reservations/{id}/cancel',
  tags: ['Reservations'],
  summary: 'Cancel reservation',
  description:
    'Cancels a PENDING reservation and releases its hold. Retry-safe. ' +
    'Confirmed reservations cannot be cancelled.',
  request: {
    params: UuidParam,
  },
  responses: {
    200: {
      description: 'Reservation cancelled (or already cancelled)',
      content: { 'application/json': { schema: ReservationResponseSchema } },
    },
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'post',
  path: '/v1/maintenance/expire-reservations',
  tags: ['Maintenance'],
  summary: 'Expire stale pending reservations',
  description:
    'Marks PENDING reservations with expires_at <= NOW() as EXPIRED. ' +
    'Safe to call repeatedly. Manually invoked (no background worker).',
  responses: {
    200: {
      description: 'Expiration run complete',
      content: { 'application/json': { schema: ExpireResponseSchema } },
    },
    ...commonErrorResponses,
  },
});

export function generateOpenApiDocument() {
  console.log('[openapi] Generating OpenAPI 3.0 document');

  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'Inventory Reservation API',
      version: '1.0.0',
      description:
        'Backend API for managing inventory items and temporary inventory reservations. ' +
        'Concurrency-critical operations use PostgreSQL functions with row-level locks.',
    },
    servers: [
      {
        url: 'https://inventory-reservation-api-one.vercel.app',
        description: 'Vercel production',
      },
      {
        url: 'http://localhost:3000',
        description: 'Local development',
      },
    ],
    tags: [
      { name: 'Health', description: 'Service health' },
      { name: 'Items', description: 'Inventory items' },
      { name: 'Reservations', description: 'Temporary inventory holds' },
      { name: 'Maintenance', description: 'Operational maintenance endpoints' },
    ],
  });
}

export type OpenApiDocument = ReturnType<typeof generateOpenApiDocument>;
