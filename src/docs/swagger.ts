import type { Express, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { generateOpenApiDocument } from './openapi';

/**
 * Swagger UI HTML that loads assets from a CDN.
 *
 * On Vercel, swagger-ui-express local files under /docs/* are caught by the
 * serverless rewrite and returned as text/html, which breaks CSS/JS loading.
 */
function buildSwaggerHtml(openApiUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Inventory Reservation API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css" />
  <style>
    body { margin: 0; background: #fafafa; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js" charset="UTF-8"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-standalone-preset.js" charset="UTF-8"></script>
  <script>
    window.onload = function () {
      window.ui = SwaggerUIBundle({
        url: ${JSON.stringify(openApiUrl)},
        dom_id: '#swagger-ui',
        deepLinking: true,
        displayRequestDuration: true,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        layout: 'StandaloneLayout',
      });
    };
  </script>
</body>
</html>`;
}

/**
 * Mounts Swagger UI at /docs and OpenAPI JSON at /openapi.json.
 */
export function mountSwagger(app: Express): void {
  const document = generateOpenApiDocument();
  const useCdnDocs = Boolean(process.env.VERCEL);

  console.log('[swagger] Mounting /openapi.json and /docs', { useCdnDocs });

  app.get('/openapi.json', (_req: Request, res: Response) => {
    console.log('[swagger] GET /openapi.json');
    res.status(200).json(document);
  });

  if (useCdnDocs) {
    const renderDocs = (req: Request, res: Response): void => {
      console.log('[swagger] GET /docs (CDN)', { path: req.path });
      // Relative URL avoids http/https proxy issues on Vercel.
      res.status(200).type('html').send(buildSwaggerHtml('/openapi.json'));
    };

    app.get('/docs', renderDocs);
    app.get('/docs/', renderDocs);
    console.log('[swagger] Swagger UI ready at /docs via CDN (Vercel)');
    return;
  }

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

  console.log('[swagger] Swagger UI ready at /docs via swagger-ui-express');
}
