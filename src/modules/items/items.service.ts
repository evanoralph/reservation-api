import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';
import { supabase } from '../../config/supabase';
import type { CreateItemInput, ItemRow, ItemStatus } from './items.types';

function toDatabaseError(error: { message: string; code?: string }, context: string): AppError {
  console.error('[items.service] Database error', { context, code: error.code, message: error.message });
  return new AppError(ErrorCodes.DATABASE_ERROR, 'A database error occurred', {
    details: { context, message: error.message, code: error.code ?? null },
    cause: error,
  });
}

async function getActiveHeldQuantity(itemId: string): Promise<number> {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('reservations')
    .select('quantity')
    .eq('item_id', itemId)
    .eq('status', 'PENDING')
    .gt('expires_at', nowIso);

  if (error) {
    throw toDatabaseError(error, 'getActiveHeldQuantity');
  }

  const held = (data ?? []).reduce((sum, row) => sum + (row.quantity as number), 0);
  console.log('[items.service] Active held quantity', { itemId, held });
  return held;
}

function buildItemStatus(item: ItemRow, heldQuantity: number): ItemStatus {
  const available = item.total_quantity - item.confirmed_quantity - heldQuantity;

  const status: ItemStatus = {
    id: item.id,
    name: item.name,
    total_quantity: item.total_quantity,
    available_quantity: available,
    held_quantity: heldQuantity,
    confirmed_quantity: item.confirmed_quantity,
  };

  console.log('[items.service] Built item status', status);
  return status;
}

export async function createItem(input: CreateItemInput): Promise<ItemStatus> {
  console.log('[items.service] createItem', {
    name: input.name,
    initial_quantity: input.initial_quantity,
  });

  const { data, error } = await supabase
    .from('items')
    .insert({
      name: input.name,
      total_quantity: input.initial_quantity,
      confirmed_quantity: 0,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw toDatabaseError(error ?? { message: 'Insert returned no data' }, 'createItem');
  }

  const item = data as ItemRow;
  return buildItemStatus(item, 0);
}

export async function getItemStatus(itemId: string): Promise<ItemStatus> {
  console.log('[items.service] getItemStatus', { itemId });

  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('id', itemId)
    .maybeSingle();

  if (error) {
    throw toDatabaseError(error, 'getItemStatus');
  }

  if (!data) {
    throw new AppError(ErrorCodes.ITEM_NOT_FOUND, 'Item not found');
  }

  const item = data as ItemRow;
  const heldQuantity = await getActiveHeldQuantity(item.id);
  return buildItemStatus(item, heldQuantity);
}
