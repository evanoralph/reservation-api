import { supabase } from '../../config/supabase';
import { mapRpcError } from '../../common/utils/map-rpc-error';

export interface ExpireReservationsResult {
  expired_count: number;
}

/**
 * Expires PENDING reservations where expires_at <= NOW().
 * Retry-safe: repeated calls only affect remaining expired rows.
 */
export async function expireReservations(): Promise<ExpireReservationsResult> {
  console.log('[maintenance.service] expireReservations starting');

  const { data, error } = await supabase.rpc('expire_inventory_reservations');

  if (error) {
    throw mapRpcError(error, 'expireReservations');
  }

  const expiredCount = typeof data === 'number' ? data : Number(data ?? 0);

  console.log('[maintenance.service] expireReservations complete', {
    expired_count: expiredCount,
  });

  return { expired_count: expiredCount };
}
