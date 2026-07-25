import { Router } from 'express';
import { successResponse } from '../../common/types/api-response';
import { asyncHandler } from '../../common/utils/async-handler';

const healthRouter = Router();

/**
 * GET /health
 * Liveness check (no DB dependency).
 */
healthRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    console.log('[health] GET /health — ok');
    res.status(200).json(
      successResponse({
        status: 'ok',
      }),
    );
  }),
);

export { healthRouter };
