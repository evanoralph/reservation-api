/**
 * Standalone concurrency reproduction script.
 *
 * Usage:
 *   npm run test:concurrency
 *
 * Creates an item with quantity 5, fires 10 concurrent reservation requests
 * of quantity 1 each, and prints the outcome.
 */
import { config } from 'dotenv';
import request from 'supertest';
import { app } from '../src/app';
import { supabase } from '../src/config/supabase';

config();

async function main(): Promise<void> {
  console.log('[concurrency-script] Starting oversell reproduction');

  const createItem = await request(app).post('/v1/items').send({
    name: `Concurrency Script ${Date.now()}`,
    initial_quantity: 5,
  });

  if (createItem.status !== 201) {
    console.error('[concurrency-script] Failed to create item', createItem.body);
    process.exit(1);
  }

  const itemId = createItem.body.data.id as string;
  console.log('[concurrency-script] Created item', { itemId, total_quantity: 5 });

  const started = Date.now();
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      request(app)
        .post('/v1/reservations')
        .send({
          item_id: itemId,
          customer_id: `script-customer-${i}`,
          quantity: 1,
        }),
    ),
  );
  const elapsedMs = Date.now() - started;

  const successes = results.filter((r) => r.status === 201);
  const conflicts = results.filter((r) => r.status === 409);
  const other = results.filter((r) => r.status !== 201 && r.status !== 409);

  const status = await request(app).get(`/v1/items/${itemId}`);

  console.log('[concurrency-script] Results');
  console.log({
    elapsedMs,
    successCount: successes.length,
    conflict409Count: conflicts.length,
    otherCount: other.length,
    otherStatuses: other.map((r) => r.status),
    itemStatus: status.body.data,
  });

  const ok =
    successes.length === 5 &&
    conflicts.length === 5 &&
    status.body.data?.available_quantity === 0 &&
    status.body.data?.held_quantity === 5 &&
    status.body.data?.available_quantity >= 0;

  if (!ok) {
    console.error('[concurrency-script] FAILED expectations');
    console.error('Expected: 5 successes, 5x HTTP 409, available=0, held=5');
    process.exitCode = 1;
  } else {
    console.log('[concurrency-script] PASSED — no overselling detected');
  }

  // Best-effort cleanup
  await supabase.from('reservations').delete().eq('item_id', itemId);
  await supabase.from('items').delete().eq('id', itemId);
  console.log('[concurrency-script] Cleanup done');
}

main().catch((err: unknown) => {
  console.error('[concurrency-script] Unexpected error', err);
  process.exit(1);
});
