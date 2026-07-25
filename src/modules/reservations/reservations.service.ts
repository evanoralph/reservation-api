import { env } from '../../config/env';
import { supabase } from '../../config/supabase';
import { mapRpcError } from '../../common/utils/map-rpc-error';
import type {
  CreateReservationInput,
  ReservationResponse,
  ReservationRow,
} from './reservations.types';

function toReservationResponse(row: ReservationRow): ReservationResponse {
  return {
    id: row.id,
    item_id: row.item_id,
    customer_id: row.customer_id,
    quantity: row.quantity,
    status: row.status,
    created_at: row.created_at,
    expires_at: row.expires_at,
  };
}

/**
 * Creates a PENDING reservation atomically via PostgreSQL RPC.
 * Do not check-then-insert in application code — that races under concurrency.
 */
export async function createReservation(
  input: CreateReservationInput,
): Promise<ReservationResponse> {
  const ttlMinutes = env.RESERVATION_TTL_MINUTES;

  console.log('[reservations.service] createReservation', {
    item_id: input.item_id,
    customer_id: input.customer_id,
    quantity: input.quantity,
    ttlMinutes,
  });

  const { data, error } = await supabase.rpc('create_inventory_reservation', {
    p_item_id: input.item_id,
    p_customer_id: input.customer_id,
    p_quantity: input.quantity,
    p_ttl_minutes: ttlMinutes,
  });

  if (error) {
    throw mapRpcError(error, 'createReservation');
  }

  if (!data) {
    throw mapRpcError({ message: 'RPC returned no data' }, 'createReservation');
  }

  // PostgREST may return an object or a single-element array depending on config.
  const row = (Array.isArray(data) ? data[0] : data) as ReservationRow;

  console.log('[reservations.service] Reservation created', {
    id: row.id,
    status: row.status,
    expires_at: row.expires_at,
  });

  return toReservationResponse(row);
}

function parseReservationRow(data: unknown): ReservationRow {
  return (Array.isArray(data) ? data[0] : data) as ReservationRow;
}

/**
 * Confirms a PENDING reservation atomically via PostgreSQL RPC.
 * Retry-safe: already CONFIRMED returns unchanged without double-deducting.
 */
export async function confirmReservation(
  reservationId: string,
): Promise<ReservationResponse> {
  console.log('[reservations.service] confirmReservation', { reservationId });

  const { data, error } = await supabase.rpc('confirm_inventory_reservation', {
    p_reservation_id: reservationId,
  });

  if (error) {
    throw mapRpcError(error, 'confirmReservation');
  }

  if (!data) {
    throw mapRpcError({ message: 'RPC returned no data' }, 'confirmReservation');
  }

  const row = parseReservationRow(data);

  console.log('[reservations.service] Reservation confirmed', {
    id: row.id,
    status: row.status,
    confirmed_at: row.confirmed_at,
  });

  return toReservationResponse(row);
}

/**
 * Cancels a PENDING reservation atomically via PostgreSQL RPC.
 * Retry-safe: already CANCELLED returns unchanged; releases hold via status change.
 */
export async function cancelReservation(
  reservationId: string,
): Promise<ReservationResponse> {
  console.log('[reservations.service] cancelReservation', { reservationId });

  const { data, error } = await supabase.rpc('cancel_inventory_reservation', {
    p_reservation_id: reservationId,
  });

  if (error) {
    throw mapRpcError(error, 'cancelReservation');
  }

  if (!data) {
    throw mapRpcError({ message: 'RPC returned no data' }, 'cancelReservation');
  }

  const row = parseReservationRow(data);

  console.log('[reservations.service] Reservation cancelled', {
    id: row.id,
    status: row.status,
    cancelled_at: row.cancelled_at,
  });

  return toReservationResponse(row);
}
