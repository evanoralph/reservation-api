import { Router } from 'express';
import { validateRequest } from '../../common/middleware/validate-request';
import { asyncHandler } from '../../common/utils/async-handler';
import * as reservationsController from './reservations.controller';
import {
  createReservationBodySchema,
  reservationIdParamsSchema,
} from './reservations.schema';

const reservationsRouter = Router();

console.log('[reservations.routes] Registering reservation routes');

reservationsRouter.post(
  '/',
  validateRequest({ body: createReservationBodySchema }),
  asyncHandler(reservationsController.createReservation),
);

reservationsRouter.post(
  '/:id/confirm',
  validateRequest({ params: reservationIdParamsSchema }),
  asyncHandler(reservationsController.confirmReservation),
);

reservationsRouter.post(
  '/:id/cancel',
  validateRequest({ params: reservationIdParamsSchema }),
  asyncHandler(reservationsController.cancelReservation),
);

export { reservationsRouter };
