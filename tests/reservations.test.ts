import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { env } from '../src/config/env';
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

beforeAll(() => {
  console.log('[reservations.test] Using TTL minutes', env.RESERVATION_TTL_MINUTES);
});

afterAll(async () => {
  for (const itemId of createdItemIds) {
    await supabase.from('reservations').delete().eq('item_id', itemId);
    await supabase.from('items').delete().eq('id', itemId);
  }
  console.log('[reservations.test] Cleanup complete', { count: createdItemIds.length });
});

describe('Create reservation (Module 6)', () => {
  it('reserves part of the inventory', async () => {
    const itemId = await createItem('Partial Reserve', 5);

    const res = await request(app).post('/v1/reservations').send({
      item_id: itemId,
      customer_id: 'customer-001',
      quantity: 2,
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      item_id: itemId,
      customer_id: 'customer-001',
      quantity: 2,
      status: 'PENDING',
    });
    expect(res.body.data.id).toBeTruthy();
    expect(res.body.data.created_at).toBeTruthy();
    expect(res.body.data.expires_at).toBeTruthy();

    const status = await request(app).get(`/v1/items/${itemId}`);
    expect(status.body.data).toMatchObject({
      held_quantity: 2,
      available_quantity: 3,
      confirmed_quantity: 0,
    });
  });

  it('reserves all inventory', async () => {
    const itemId = await createItem('Full Reserve', 3);

    const res = await request(app).post('/v1/reservations').send({
      item_id: itemId,
      customer_id: 'customer-full',
      quantity: 3,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.quantity).toBe(3);

    const status = await request(app).get(`/v1/items/${itemId}`);
    expect(status.body.data).toMatchObject({
      held_quantity: 3,
      available_quantity: 0,
    });
  });

  it('rejects insufficient inventory with HTTP 409', async () => {
    const itemId = await createItem('Insufficient', 2);

    const res = await request(app).post('/v1/reservations').send({
      item_id: itemId,
      customer_id: 'customer-over',
      quantity: 5,
    });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INSUFFICIENT_INVENTORY');

    const status = await request(app).get(`/v1/items/${itemId}`);
    expect(status.body.data.available_quantity).toBe(2);
    expect(status.body.data.held_quantity).toBe(0);
    expect(status.body.data.available_quantity).toBeGreaterThanOrEqual(0);
  });

  it('rejects invalid item ID', async () => {
    const res = await request(app).post('/v1/reservations').send({
      item_id: '00000000-0000-4000-8000-000000000099',
      customer_id: 'customer-missing-item',
      quantity: 1,
    });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ITEM_NOT_FOUND');
  });

  it('rejects zero quantity', async () => {
    const itemId = await createItem('Zero Qty Reserve', 2);

    const res = await request(app).post('/v1/reservations').send({
      item_id: itemId,
      customer_id: 'customer-zero',
      quantity: 0,
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects negative quantity', async () => {
    const itemId = await createItem('Neg Qty Reserve', 2);

    const res = await request(app).post('/v1/reservations').send({
      item_id: itemId,
      customer_id: 'customer-neg',
      quantity: -1,
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('verifies expiration timestamp uses configured TTL', async () => {
    const itemId = await createItem('TTL Check', 4);
    const before = Date.now();

    const res = await request(app).post('/v1/reservations').send({
      item_id: itemId,
      customer_id: 'customer-ttl',
      quantity: 1,
    });

    expect(res.status).toBe(201);

    const createdAt = new Date(res.body.data.created_at as string).getTime();
    const expiresAt = new Date(res.body.data.expires_at as string).getTime();
    const ttlMs = env.RESERVATION_TTL_MINUTES * 60 * 1000;
    const delta = expiresAt - createdAt;

    // Allow clock skew / DB rounding (~30s)
    expect(delta).toBeGreaterThan(ttlMs - 30_000);
    expect(delta).toBeLessThan(ttlMs + 30_000);
    expect(expiresAt).toBeGreaterThan(before);
  });

  it('verifies held quantity changes after reservation', async () => {
    const itemId = await createItem('Held Change', 10);

    const before = await request(app).get(`/v1/items/${itemId}`);
    expect(before.body.data.held_quantity).toBe(0);
    expect(before.body.data.available_quantity).toBe(10);

    await request(app).post('/v1/reservations').send({
      item_id: itemId,
      customer_id: 'customer-held-1',
      quantity: 4,
    });

    const after = await request(app).get(`/v1/items/${itemId}`);
    expect(after.body.data.held_quantity).toBe(4);
    expect(after.body.data.available_quantity).toBe(6);
    expect(after.body.data.available_quantity).toBeGreaterThanOrEqual(0);
  });
});

describe('Confirm reservation (Module 7)', () => {
  async function createPendingReservation(
    itemName: string,
    itemQty: number,
    reserveQty: number,
  ): Promise<{ itemId: string; reservationId: string }> {
    const itemId = await createItem(itemName, itemQty);
    const created = await request(app).post('/v1/reservations').send({
      item_id: itemId,
      customer_id: 'customer-confirm',
      quantity: reserveQty,
    });
    expect(created.status).toBe(201);
    return { itemId, reservationId: created.body.data.id as string };
  }

  it('confirms a pending reservation', async () => {
    const { itemId, reservationId } = await createPendingReservation(
      'Confirm Pending',
      5,
      2,
    );

    const res = await request(app).post(`/v1/reservations/${reservationId}/confirm`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      id: reservationId,
      status: 'CONFIRMED',
      quantity: 2,
    });

    const status = await request(app).get(`/v1/items/${itemId}`);
    expect(status.body.data).toMatchObject({
      confirmed_quantity: 2,
      held_quantity: 0,
      available_quantity: 3,
    });
  });

  it('confirming the same reservation twice does not deduct twice', async () => {
    const { itemId, reservationId } = await createPendingReservation(
      'Confirm Twice',
      5,
      2,
    );

    const first = await request(app).post(`/v1/reservations/${reservationId}/confirm`);
    expect(first.status).toBe(200);
    expect(first.body.data.status).toBe('CONFIRMED');

    const second = await request(app).post(`/v1/reservations/${reservationId}/confirm`);
    expect(second.status).toBe(200);
    expect(second.body.data.status).toBe('CONFIRMED');

    const status = await request(app).get(`/v1/items/${itemId}`);
    expect(status.body.data.confirmed_quantity).toBe(2);
    expect(status.body.data.available_quantity).toBe(3);
  });

  it('rejects confirmation after expiration', async () => {
    const { itemId, reservationId } = await createPendingReservation(
      'Confirm Expired',
      4,
      1,
    );

    const past = new Date(Date.now() - 60_000).toISOString();
    const updated = await supabase
      .from('reservations')
      .update({ expires_at: past })
      .eq('id', reservationId)
      .select('id')
      .single();
    expect(updated.error).toBeNull();

    const res = await request(app).post(`/v1/reservations/${reservationId}/confirm`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RESERVATION_EXPIRED');

    const status = await request(app).get(`/v1/items/${itemId}`);
    expect(status.body.data).toMatchObject({
      confirmed_quantity: 0,
      held_quantity: 0,
      available_quantity: 4,
    });
  });

  it('rejects confirmation of a cancelled reservation', async () => {
    const { reservationId } = await createPendingReservation('Confirm Cancelled', 4, 1);

    const cancelled = await request(app).post(`/v1/reservations/${reservationId}/cancel`);
    expect(cancelled.status).toBe(200);

    const res = await request(app).post(`/v1/reservations/${reservationId}/confirm`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_RESERVATION_STATE');
  });

  it('returns 404 for unknown reservation on confirm', async () => {
    const res = await request(app).post(
      '/v1/reservations/00000000-0000-4000-8000-000000000099/confirm',
    );

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RESERVATION_NOT_FOUND');
  });
});

describe('Cancel reservation (Module 8)', () => {
  async function createPendingReservation(
    itemName: string,
    itemQty: number,
    reserveQty: number,
  ): Promise<{ itemId: string; reservationId: string }> {
    const itemId = await createItem(itemName, itemQty);
    const created = await request(app).post('/v1/reservations').send({
      item_id: itemId,
      customer_id: 'customer-cancel',
      quantity: reserveQty,
    });
    expect(created.status).toBe(201);
    return { itemId, reservationId: created.body.data.id as string };
  }

  it('cancels a pending reservation and releases held inventory', async () => {
    const { itemId, reservationId } = await createPendingReservation(
      'Cancel Pending',
      5,
      2,
    );

    const before = await request(app).get(`/v1/items/${itemId}`);
    expect(before.body.data).toMatchObject({
      held_quantity: 2,
      available_quantity: 3,
    });

    const res = await request(app).post(`/v1/reservations/${reservationId}/cancel`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      id: reservationId,
      status: 'CANCELLED',
      quantity: 2,
    });

    const after = await request(app).get(`/v1/items/${itemId}`);
    expect(after.body.data).toMatchObject({
      held_quantity: 0,
      available_quantity: 5,
      confirmed_quantity: 0,
    });
  });

  it('cancelling the same reservation twice is safe', async () => {
    const { itemId, reservationId } = await createPendingReservation(
      'Cancel Twice',
      5,
      2,
    );

    const first = await request(app).post(`/v1/reservations/${reservationId}/cancel`);
    expect(first.status).toBe(200);
    expect(first.body.data.status).toBe('CANCELLED');

    const second = await request(app).post(`/v1/reservations/${reservationId}/cancel`);
    expect(second.status).toBe(200);
    expect(second.body.data.status).toBe('CANCELLED');

    const status = await request(app).get(`/v1/items/${itemId}`);
    expect(status.body.data).toMatchObject({
      held_quantity: 0,
      available_quantity: 5,
      confirmed_quantity: 0,
    });
  });

  it('rejects cancellation after confirmation', async () => {
    const { itemId, reservationId } = await createPendingReservation(
      'Cancel After Confirm',
      5,
      2,
    );

    const confirmed = await request(app).post(
      `/v1/reservations/${reservationId}/confirm`,
    );
    expect(confirmed.status).toBe(200);

    const res = await request(app).post(`/v1/reservations/${reservationId}/cancel`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RESERVATION_ALREADY_CONFIRMED');

    const status = await request(app).get(`/v1/items/${itemId}`);
    expect(status.body.data).toMatchObject({
      confirmed_quantity: 2,
      held_quantity: 0,
      available_quantity: 3,
    });
  });

  it('returns 404 for unknown reservation on cancel', async () => {
    const res = await request(app).post(
      '/v1/reservations/00000000-0000-4000-8000-000000000099/cancel',
    );

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RESERVATION_NOT_FOUND');
  });
});


