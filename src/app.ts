import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { errorHandler } from './common/middleware/error-handler';
import { notFoundHandler } from './common/middleware/not-found';
import { logger } from './common/utils/logger';
import { mountSwagger } from './docs/swagger';
import { healthRouter } from './modules/health/health.routes';
import { itemsRouter } from './modules/items/items.routes';
import { reservationsRouter } from './modules/reservations/reservations.routes';
import { maintenanceRouter } from './modules/maintenance/maintenance.routes';
import { env } from './config/env';

console.log('[app] Creating Express application');

const app = express();

// CSP disabled so Swagger UI assets at /docs can load without extra directives.
app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(
  pinoHttp({
    logger,
    autoLogging: env.NODE_ENV !== 'test',
  }),
);

console.log('[app] Middleware registered: helmet, cors, json(1mb), pino-http');

mountSwagger(app);

app.use('/health', healthRouter);
app.use('/v1/items', itemsRouter);
app.use('/v1/reservations', reservationsRouter);
app.use('/v1/maintenance', maintenanceRouter);

console.log(
  '[app] Routes registered: /docs, /openapi.json, GET /health, /v1/items, /v1/reservations, /v1/maintenance',
);

app.use(notFoundHandler);
app.use(errorHandler);

console.log('[app] Error handlers registered: notFound, errorHandler');

// Named export for local imports; default export required by Vercel Express runtime.
export { app };
export default app;
