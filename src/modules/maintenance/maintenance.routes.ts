import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler';
import * as maintenanceController from './maintenance.controller';

const maintenanceRouter = Router();

console.log('[maintenance.routes] Registering maintenance routes');

maintenanceRouter.post(
  '/expire-reservations',
  asyncHandler(maintenanceController.expireReservations),
);

export { maintenanceRouter };
