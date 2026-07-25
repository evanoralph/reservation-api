import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { supabase } from '../src/config/supabase';

const createdItemIds: string[] = [];

afterAll(async () => {
  // Best-effort cleanup of reservations then items created by these tests
  for (const itemId of createdItemIds) {
    await supabase.from('reservations').delete().eq('item_id', itemId);
    await supabase.from('items').delete().eq('id', itemId);
  }
  console.log('[items.test] Cleanup complete', { count: createdItemIds.length });
});

describe('Items module', () => {
  it('creates a valid item', async () => {
    const res = await request(app).post('/v1/items').send({
      name: 'White T-Shirt',
      initial_quantity: 5,
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      name: 'White T-Shirt',
      total_quantity: 5,
      available_quantity: 5,
      held_quantity: 0,
      confirmed_quantity: 0,
    });
    expect(res.body.data.id).toBeTruthy();

    createdItemIds.push(res.body.data.id as string);
  });

  it('rejects zero quantity', async () => {
    const res = await request(app).post('/v1/items').send({
      name: 'Zero Qty',
      initial_quantity: 0,
    });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects negative quantity', async () => {
    const res = await request(app).post('/v1/items').send({
      name: 'Negative Qty',
      initial_quantity: -3,
    });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects empty name', async () => {
    const res = await request(app).post('/v1/items').send({
      name: '   ',
      initial_quantity: 2,
    });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('gets an existing item', async () => {
    const created = await request(app).post('/v1/items').send({
      name: 'Get Existing',
      initial_quantity: 4,
    });
    const itemId = created.body.data.id as string;
    createdItemIds.push(itemId);

    const res = await request(app).get(`/v1/items/${itemId}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      id: itemId,
      name: 'Get Existing',
      total_quantity: 4,
      available_quantity: 4,
      held_quantity: 0,
      confirmed_quantity: 0,
    });
  });

  it('returns 404 for an unknown item', async () => {
    const res = await request(app).get(
      '/v1/items/00000000-0000-4000-8000-000000000099',
    );

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('ITEM_NOT_FOUND');
  });

  it('returns correct total, held, confirmed, and available values', async () => {
    const created = await request(app).post('/v1/items').send({
      name: 'Status Mix',
      initial_quantity: 5,
    });
    expect(created.status).toBe(201);
    const itemId = created.body.data.id as string;
    createdItemIds.push(itemId);

    // Hold 2 units (PENDING)
    const hold = await supabase.rpc('create_inventory_reservation', {
      p_item_id: itemId,
      p_customer_id: 'test-customer-held',
      p_quantity: 2,
      p_ttl_minutes: 10,
    });
    expect(hold.error).toBeNull();

    // Confirm 1 unit
    const toConfirm = await supabase.rpc('create_inventory_reservation', {
      p_item_id: itemId,
      p_customer_id: 'test-customer-confirm',
      p_quantity: 1,
      p_ttl_minutes: 10,
    });
    expect(toConfirm.error).toBeNull();
    const reservationId = (toConfirm.data as { id: string }).id;

    const confirmed = await supabase.rpc('confirm_inventory_reservation', {
      p_reservation_id: reservationId,
    });
    expect(confirmed.error).toBeNull();

    const res = await request(app).get(`/v1/items/${itemId}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: itemId,
      total_quantity: 5,
      held_quantity: 2,
      confirmed_quantity: 1,
      available_quantity: 2, // 5 - 1 - 2
    });
  });
});
