import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { supabase } from '../src/config/supabase';

const createdItemIds: string[] = [];

async function createItem(name: string, initialQuantity: number): Promise<string> {
  const res = await request(app).post('/v1/items').send({
    name,
    initial_quantity: initialQuantity,
  });
  expect(res.status).toBe(201);
  const itemId = res.body.data.id as string;
  createdItemIds.push(itemId);
  return itemId;
}

afterAll(async () => {
  for (const itemId of createdItemIds) {
    await supabase.from('reservations').delete().eq('item_id', itemId);
    await supabase.from('items').delete().eq('id', itemId);
  }
  console.log('[concurrency.test] Cleanup complete', { count: createdItemIds.length });
});

describe('Concurrency (Module 11)', () => {
  it(
    'prevents overselling: 10 concurrent reservations of 1 against quantity 5',
    async () => {
      const itemId = await createItem('Concurrency Oversell', 5);

      console.log('[concurrency.test] Firing 10 concurrent reserve requests', { itemId });

      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          request(app)
            .post('/v1/reservations')
            .send({
              item_id: itemId,
              customer_id: `concurrent-customer-${i}`,
              quantity: 1,
            }),
        ),
      );

      const successes = results.filter((r) => r.status === 201);
      const conflicts = results.filter((r) => r.status === 409);

      console.log('[concurrency.test] Reserve results', {
        successes: successes.length,
        conflicts: conflicts.length,
        other: results.length - successes.length - conflicts.length,
      });

      expect(successes).toHaveLength(5);
      expect(conflicts).toHaveLength(5);
      expect(
        conflicts.every((r) => r.body.error?.code === 'INSUFFICIENT_INVENTORY'),
      ).toBe(true);

      const status = await request(app).get(`/v1/items/${itemId}`);
      expect(status.status).toBe(200);
      expect(status.body.data).toMatchObject({
        total_quantity: 5,
        held_quantity: 5,
        available_quantity: 0,
        confirmed_quantity: 0,
      });
      expect(status.body.data.available_quantity).toBeGreaterThanOrEqual(0);
      expect(
        status.body.data.held_quantity + status.body.data.confirmed_quantity,
      ).toBeLessThanOrEqual(status.body.data.total_quantity);
    },
    60_000,
  );

  it(
    'confirming the same reservation concurrently never deducts twice',
    async () => {
      const itemId = await createItem('Concurrency Confirm', 5);
      const created = await request(app).post('/v1/reservations').send({
        item_id: itemId,
        customer_id: 'concurrent-confirm',
        quantity: 2,
      });
      expect(created.status).toBe(201);
      const reservationId = created.body.data.id as string;

      console.log('[concurrency.test] Firing 10 concurrent confirms', { reservationId });

      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          request(app).post(`/v1/reservations/${reservationId}/confirm`),
        ),
      );

      expect(results.every((r) => r.status === 200)).toBe(true);
      expect(results.every((r) => r.body.data.status === 'CONFIRMED')).toBe(true);

      const status = await request(app).get(`/v1/items/${itemId}`);
      expect(status.body.data.confirmed_quantity).toBe(2);
      expect(status.body.data.held_quantity).toBe(0);
      expect(status.body.data.available_quantity).toBe(3);
    },
    60_000,
  );

  it(
    'cancelling the same reservation concurrently never releases twice',
    async () => {
      const itemId = await createItem('Concurrency Cancel', 5);
      const created = await request(app).post('/v1/reservations').send({
        item_id: itemId,
        customer_id: 'concurrent-cancel',
        quantity: 2,
      });
      expect(created.status).toBe(201);
      const reservationId = created.body.data.id as string;

      console.log('[concurrency.test] Firing 10 concurrent cancels', { reservationId });

      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          request(app).post(`/v1/reservations/${reservationId}/cancel`),
        ),
      );

      expect(results.every((r) => r.status === 200)).toBe(true);
      expect(results.every((r) => r.body.data.status === 'CANCELLED')).toBe(true);

      const status = await request(app).get(`/v1/items/${itemId}`);
      expect(status.body.data).toMatchObject({
        held_quantity: 0,
        confirmed_quantity: 0,
        available_quantity: 5,
      });
    },
    60_000,
  );

  it(
    'concurrent confirm and cancel yield exactly one valid terminal state',
    async () => {
      const itemId = await createItem('Concurrency ConfirmCancel', 5);
      const created = await request(app).post('/v1/reservations').send({
        item_id: itemId,
        customer_id: 'concurrent-confirm-cancel',
        quantity: 2,
      });
      expect(created.status).toBe(201);
      const reservationId = created.body.data.id as string;

      console.log('[concurrency.test] Racing confirm vs cancel', { reservationId });

      const [confirmRes, cancelRes] = await Promise.all([
        request(app).post(`/v1/reservations/${reservationId}/confirm`),
        request(app).post(`/v1/reservations/${reservationId}/cancel`),
      ]);

      console.log('[concurrency.test] Confirm/cancel race outcomes', {
        confirmStatus: confirmRes.status,
        confirmBody: confirmRes.body,
        cancelStatus: cancelRes.status,
        cancelBody: cancelRes.body,
      });

      const row = await supabase
        .from('reservations')
        .select('status, confirmed_at, cancelled_at')
        .eq('id', reservationId)
        .single();

      expect(row.error).toBeNull();
      const finalStatus = row.data?.status;
      expect(['CONFIRMED', 'CANCELLED']).toContain(finalStatus);

      // Never both terminal timestamps in conflicting way / never invalid combo
      if (finalStatus === 'CONFIRMED') {
        expect(row.data?.confirmed_at).toBeTruthy();
        expect(confirmRes.status).toBe(200);
        expect(cancelRes.status).toBe(409);
        expect(cancelRes.body.error.code).toBe('RESERVATION_ALREADY_CONFIRMED');

        const status = await request(app).get(`/v1/items/${itemId}`);
        expect(status.body.data.confirmed_quantity).toBe(2);
        expect(status.body.data.held_quantity).toBe(0);
        expect(status.body.data.available_quantity).toBe(3);
      } else {
        expect(row.data?.cancelled_at).toBeTruthy();
        expect(cancelRes.status).toBe(200);
        expect(confirmRes.status).toBe(409);
        expect(confirmRes.body.error.code).toBe('INVALID_RESERVATION_STATE');

        const status = await request(app).get(`/v1/items/${itemId}`);
        expect(status.body.data.confirmed_quantity).toBe(0);
        expect(status.body.data.held_quantity).toBe(0);
        expect(status.body.data.available_quantity).toBe(5);
      }
    },
    60_000,
  );

  it(
    'expiration racing with confirm does not double-apply inventory changes',
    async () => {
      const itemId = await createItem('Concurrency ExpireConfirm', 5);
      const created = await request(app).post('/v1/reservations').send({
        item_id: itemId,
        customer_id: 'concurrent-expire-confirm',
        quantity: 2,
      });
      expect(created.status).toBe(201);
      const reservationId = created.body.data.id as string;

      // Make reservation eligible for expiration immediately
      const past = new Date(Date.now() - 5_000).toISOString();
      const updated = await supabase
        .from('reservations')
        .update({ expires_at: past })
        .eq('id', reservationId)
        .select('id')
        .single();
      expect(updated.error).toBeNull();

      console.log('[concurrency.test] Racing expire vs confirm', { reservationId });

      const [confirmRes, expireRes] = await Promise.all([
        request(app).post(`/v1/reservations/${reservationId}/confirm`),
        request(app).post('/v1/maintenance/expire-reservations'),
      ]);

      expect(expireRes.status).toBe(200);
      // Confirm must not succeed against an expired hold
      expect(confirmRes.status).toBe(409);
      expect(confirmRes.body.error.code).toBe('RESERVATION_EXPIRED');

      const row = await supabase
        .from('reservations')
        .select('status')
        .eq('id', reservationId)
        .single();
      expect(row.data?.status).toBe('EXPIRED');

      const status = await request(app).get(`/v1/items/${itemId}`);
      expect(status.body.data).toMatchObject({
        confirmed_quantity: 0,
        held_quantity: 0,
        available_quantity: 5,
      });
      expect(status.body.data.available_quantity).toBeGreaterThanOrEqual(0);
    },
    60_000,
  );
});
