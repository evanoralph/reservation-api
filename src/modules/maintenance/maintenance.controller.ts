import type { Request, Response } from 'express';
import { successResponse } from '../../common/types/api-response';
import * as maintenanceService from './maintenance.service';

export async function expireReservations(
  _req: Request,
  res: Response,
): Promise<void> {
  console.log('[maintenance.controller] POST /v1/maintenance/expire-reservations');

  const result = await maintenanceService.expireReservations();
  res.status(200).json(successResponse(result));
}
