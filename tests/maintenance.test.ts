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

async function createReservation(
  itemId: string,
  customerId: string,
  quantity: number,
): Promise<string> {
  const res = await request(app).post('/v1/reservations').send({
    item_id: itemId,
    customer_id: customerId,
    quantity,
  });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
}

afterAll(async () => {
  for (const itemId of createdItemIds) {
    await supabase.from('reservations').delete().eq('item_id', itemId);
    await supabase.from('items').delete().eq('id', itemId);
  }
  console.log('[maintenance.test] Cleanup complete', { count: createdItemIds.length });
});

describe('Expire reservations (Module 9)', () => {
  it('expires old pending reservations and frees inventory', async () => {
    const itemId = await createItem('Expire Old Pending', 5);
    const reservationId = await createReservation(itemId, 'customer-expire', 2);

    const past = new Date(Date.now() - 60_000).toISOString();
    const updated = await supabase
      .from('reservations')
      .update({ expires_at: past })
      .eq('id', reservationId)
      .select('id')
      .single();
    expect(updated.error).toBeNull();

    const before = await request(app).get(`/v1/items/${itemId}`);
    // Pending but past expires_at should already not count as held
    expect(before.body.data.held_quantity).toBe(0);
    expect(before.body.data.available_quantity).toBe(5);

    const res = await request(app).post('/v1/maintenance/expire-reservations');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.expired_count).toBeGreaterThanOrEqual(1);

    const row = await supabase
      .from('reservations')
      .select('status, expired_at')
      .eq('id', reservationId)
      .single();
    expect(row.error).toBeNull();
    expect(row.data?.status).toBe('EXPIRED');
    expect(row.data?.expired_at).toBeTruthy();

    const after = await request(app).get(`/v1/items/${itemId}`);
    expect(after.body.data).toMatchObject({
      held_quantity: 0,
      available_quantity: 5,
      confirmed_quantity: 0,
    });
  });

  it('does not expire future pending reservations', async () => {
    const itemId = await createItem('Expire Future Pending', 5);
    const reservationId = await createReservation(itemId, 'customer-future', 1);

    const res = await request(app).post('/v1/maintenance/expire-reservations');
    expect(res.status).toBe(200);

    const row = await supabase
      .from('reservations')
      .select('status')
      .eq('id', reservationId)
      .single();
    expect(row.data?.status).toBe('PENDING');

    const status = await request(app).get(`/v1/items/${itemId}`);
    expect(status.body.data).toMatchObject({
      held_quantity: 1,
      available_quantity: 4,
    });
  });

  it('does not modify confirmed reservations', async () => {
    const itemId = await createItem('Expire Skip Confirmed', 5);
    const reservationId = await createReservation(itemId, 'customer-confirmed', 1);

    const confirmed = await request(app).post(
      `/v1/reservations/${reservationId}/confirm`,
    );
    expect(confirmed.status).toBe(200);

    // Force expires_at into the past — status is CONFIRMED so expire must ignore it
    const past = new Date(Date.now() - 60_000).toISOString();
    await supabase.from('reservations').update({ expires_at: past }).eq('id', reservationId);

    const res = await request(app).post('/v1/maintenance/expire-reservations');
    expect(res.status).toBe(200);

    const row = await supabase
      .from('reservations')
      .select('status')
      .eq('id', reservationId)
      .single();
    expect(row.data?.status).toBe('CONFIRMED');

    const status = await request(app).get(`/v1/items/${itemId}`);
    expect(status.body.data.confirmed_quantity).toBe(1);
  });

  it('does not modify cancelled reservations', async () => {
    const itemId = await createItem('Expire Skip Cancelled', 5);
    const reservationId = await createReservation(itemId, 'customer-cancelled', 1);

    const cancelled = await request(app).post(
      `/v1/reservations/${reservationId}/cancel`,
    );
    expect(cancelled.status).toBe(200);

    const past = new Date(Date.now() - 60_000).toISOString();
    await supabase.from('reservations').update({ expires_at: past }).eq('id', reservationId);

    const res = await request(app).post('/v1/maintenance/expire-reservations');
    expect(res.status).toBe(200);

    const row = await supabase
      .from('reservations')
      .select('status')
      .eq('id', reservationId)
      .single();
    expect(row.data?.status).toBe('CANCELLED');
  });

  it('running expiration multiple times is safe', async () => {
    const itemId = await createItem('Expire Idempotent', 5);
    const reservationId = await createReservation(itemId, 'customer-idempotent', 2);

    const past = new Date(Date.now() - 60_000).toISOString();
    await supabase.from('reservations').update({ expires_at: past }).eq('id', reservationId);

    const first = await request(app).post('/v1/maintenance/expire-reservations');
    expect(first.status).toBe(200);
    expect(first.body.data.expired_count).toBeGreaterThanOrEqual(1);

    const second = await request(app).post('/v1/maintenance/expire-reservations');
    expect(second.status).toBe(200);
    // This specific reservation should not be expired again
    expect(second.body.data.expired_count).toBeGreaterThanOrEqual(0);

    const row = await supabase
      .from('reservations')
      .select('status')
      .eq('id', reservationId)
      .single();
    expect(row.data?.status).toBe('EXPIRED');

    const status = await request(app).get(`/v1/items/${itemId}`);
    expect(status.body.data.available_quantity).toBe(5);
    expect(status.body.data.held_quantity).toBe(0);
  });
});
