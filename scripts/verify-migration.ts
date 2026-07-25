/**
 * Verifies Module 3 migration objects are reachable via Supabase.
 * Usage: npx tsx scripts/verify-migration.ts
 *
 * Does not print secrets. Requires .env with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('[verify-migration] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main(): Promise<void> {
  console.log('[verify-migration] Checking tables and RPCs...');

  const itemsProbe = await supabase.from('items').select('id').limit(1);
  if (itemsProbe.error) {
    console.error('[verify-migration] items table check failed:', itemsProbe.error.message);
    console.error(
      '[verify-migration] Run supabase/migrations/001_initial_schema.sql in the Supabase SQL Editor.',
    );
    process.exit(1);
  }
  console.log('[verify-migration] items table OK');

  const reservationsProbe = await supabase.from('reservations').select('id').limit(1);
  if (reservationsProbe.error) {
    console.error(
      '[verify-migration] reservations table check failed:',
      reservationsProbe.error.message,
    );
    process.exit(1);
  }
  console.log('[verify-migration] reservations table OK');

  const expireProbe = await supabase.rpc('expire_inventory_reservations');
  if (expireProbe.error) {
    console.error(
      '[verify-migration] expire_inventory_reservations RPC failed:',
      expireProbe.error.message,
    );
    process.exit(1);
  }
  console.log('[verify-migration] expire_inventory_reservations RPC OK', {
    expiredCount: expireProbe.data,
  });

  // Smoke-test create/confirm/cancel with a temporary item
  const insertItem = await supabase
    .from('items')
    .insert({ name: 'migration-verify-item', total_quantity: 3 })
    .select('*')
    .single();

  if (insertItem.error || !insertItem.data) {
    console.error('[verify-migration] insert item failed:', insertItem.error?.message);
    process.exit(1);
  }

  const itemId = insertItem.data.id as string;
  console.log('[verify-migration] created temp item', { itemId });

  const createRpc = await supabase.rpc('create_inventory_reservation', {
    p_item_id: itemId,
    p_customer_id: 'verify-customer',
    p_quantity: 1,
    p_ttl_minutes: 10,
  });

  if (createRpc.error || !createRpc.data) {
    console.error('[verify-migration] create_inventory_reservation failed:', createRpc.error?.message);
    process.exit(1);
  }

  const reservationId = (createRpc.data as { id: string }).id;
  console.log('[verify-migration] create_inventory_reservation OK', { reservationId });

  const confirmRpc = await supabase.rpc('confirm_inventory_reservation', {
    p_reservation_id: reservationId,
  });
  if (confirmRpc.error) {
    console.error(
      '[verify-migration] confirm_inventory_reservation failed:',
      confirmRpc.error.message,
    );
    process.exit(1);
  }
  console.log('[verify-migration] confirm_inventory_reservation OK');

  // Second confirm must be idempotent
  const confirmAgain = await supabase.rpc('confirm_inventory_reservation', {
    p_reservation_id: reservationId,
  });
  if (confirmAgain.error) {
    console.error(
      '[verify-migration] idempotent confirm failed:',
      confirmAgain.error.message,
    );
    process.exit(1);
  }
  console.log('[verify-migration] idempotent confirm OK');

  const itemAfter = await supabase
    .from('items')
    .select('confirmed_quantity')
    .eq('id', itemId)
    .single();

  if (itemAfter.error || itemAfter.data?.confirmed_quantity !== 1) {
    console.error('[verify-migration] confirmed_quantity expected 1, got', itemAfter.data);
    process.exit(1);
  }
  console.log('[verify-migration] confirmed_quantity OK');

  // Insufficient inventory should fail
  const oversell = await supabase.rpc('create_inventory_reservation', {
    p_item_id: itemId,
    p_customer_id: 'verify-customer',
    p_quantity: 99,
    p_ttl_minutes: 10,
  });
  if (!oversell.error) {
    console.error('[verify-migration] expected INSUFFICIENT_INVENTORY error, got success');
    process.exit(1);
  }
  console.log('[verify-migration] insufficient inventory rejected OK', {
    message: oversell.error.message,
  });

  console.log('[verify-migration] All checks passed');
}

main().catch((err: unknown) => {
  console.error('[verify-migration] Unexpected error', err);
  process.exit(1);
});
