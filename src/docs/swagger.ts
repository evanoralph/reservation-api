import type { Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import { generateOpenApiDocument } from './openapi';

/**
 * Mounts Swagger UI at /docs and OpenAPI JSON at /openapi.json.
 */
export function mountSwagger(app: Express): void {
  const document = generateOpenApiDocument();

  console.log('[swagger] Mounting /openapi.json and /docs');

  app.get('/openapi.json', (_req, res) => {
    console.log('[swagger] GET /openapi.json');
    res.status(200).json(document);
  });

  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(document, {
      explorer: true,
      customSiteTitle: 'Inventory Reservation API Docs',
      swaggerOptions: {
        persistAuthorization: false,
        displayRequestDuration: true,
      },
    }),
  );

  console.log('[swagger] Swagger UI ready at /docs');
}
