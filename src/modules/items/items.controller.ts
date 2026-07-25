import type { Request, Response } from 'express';
import { successResponse } from '../../common/types/api-response';
import type { CreateItemBody, ItemIdParams } from './items.schema';
import * as itemsService from './items.service';

export async function createItem(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateItemBody;
  console.log('[items.controller] POST /v1/items', {
    name: body.name,
    initial_quantity: body.initial_quantity,
  });

  const item = await itemsService.createItem({
    name: body.name,
    initial_quantity: body.initial_quantity,
  });

  res.status(201).json(successResponse(item));
}

export async function getItem(req: Request, res: Response): Promise<void> {
  const params = req.params as unknown as ItemIdParams;
  console.log('[items.controller] GET /v1/items/:id', { id: params.id });

  const item = await itemsService.getItemStatus(params.id);
  res.status(200).json(successResponse(item));
}
