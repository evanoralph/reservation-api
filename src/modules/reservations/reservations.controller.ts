import type { Request, Response } from 'express';
import { successResponse } from '../../common/types/api-response';
import type { CreateReservationBody, ReservationIdParams } from './reservations.schema';
import * as reservationsService from './reservations.service';

export async function createReservation(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateReservationBody;

  console.log('[reservations.controller] POST /v1/reservations', {
    item_id: body.item_id,
    customer_id: body.customer_id,
    quantity: body.quantity,
  });

  const reservation = await reservationsService.createReservation({
    item_id: body.item_id,
    customer_id: body.customer_id,
    quantity: body.quantity,
  });

  res.status(201).json(successResponse(reservation));
}

export async function confirmReservation(req: Request, res: Response): Promise<void> {
  const params = req.params as unknown as ReservationIdParams;

  console.log('[reservations.controller] POST /v1/reservations/:id/confirm', {
    id: params.id,
  });

  const reservation = await reservationsService.confirmReservation(params.id);
  res.status(200).json(successResponse(reservation));
}

export async function cancelReservation(req: Request, res: Response): Promise<void> {
  const params = req.params as unknown as ReservationIdParams;

  console.log('[reservations.controller] POST /v1/reservations/:id/cancel', {
    id: params.id,
  });

  const reservation = await reservationsService.cancelReservation(params.id);
  res.status(200).json(successResponse(reservation));
}
