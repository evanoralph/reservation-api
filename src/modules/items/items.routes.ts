import { Router } from 'express';
import { validateRequest } from '../../common/middleware/validate-request';
import { asyncHandler } from '../../common/utils/async-handler';
import * as itemsController from './items.controller';
import { createItemBodySchema, itemIdParamsSchema } from './items.schema';

const itemsRouter = Router();

console.log('[items.routes] Registering item routes');

itemsRouter.post(
  '/',
  validateRequest({ body: createItemBodySchema }),
  asyncHandler(itemsController.createItem),
);

itemsRouter.get(
  '/:id',
  validateRequest({ params: itemIdParamsSchema }),
  asyncHandler(itemsController.getItem),
);

export { itemsRouter };
