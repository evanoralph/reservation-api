-- =============================================================================
-- Inventory Reservation API — Initial schema + atomic reservation functions
-- Run this entire file in the Supabase SQL Editor (no manual edits required).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- Enum
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reservation_status') THEN
    CREATE TYPE reservation_status AS ENUM (
      'PENDING',
      'CONFIRMED',
      'CANCELLED',
      'EXPIRED'
    );
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- updated_at helper
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- Items
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  total_quantity INTEGER NOT NULL,
  confirmed_quantity INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT items_name_not_empty CHECK (length(trim(name)) > 0),
  CONSTRAINT items_total_quantity_positive CHECK (total_quantity > 0),
  CONSTRAINT items_confirmed_quantity_non_negative CHECK (confirmed_quantity >= 0),
  CONSTRAINT items_confirmed_lte_total CHECK (confirmed_quantity <= total_quantity)
);

DROP TRIGGER IF EXISTS trg_items_set_updated_at ON items;
CREATE TRIGGER trg_items_set_updated_at
  BEFORE UPDATE ON items
  FOR EACH ROW
  EXECUTE PROCEDURE set_updated_at();

-- -----------------------------------------------------------------------------
-- Reservations
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES items (id) ON DELETE RESTRICT,
  customer_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  status reservation_status NOT NULL DEFAULT 'PENDING',
  expires_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,
  expired_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT reservations_quantity_positive CHECK (quantity > 0),
  CONSTRAINT reservations_customer_id_not_empty CHECK (length(trim(customer_id)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_reservations_item_id
  ON reservations (item_id);

CREATE INDEX IF NOT EXISTS idx_reservations_status
  ON reservations (status);

CREATE INDEX IF NOT EXISTS idx_reservations_expires_at
  ON reservations (expires_at);

CREATE INDEX IF NOT EXISTS idx_reservations_item_id_status
  ON reservations (item_id, status);

CREATE INDEX IF NOT EXISTS idx_reservations_status_expires_at
  ON reservations (status, expires_at);

CREATE INDEX IF NOT EXISTS idx_active_reservations
  ON reservations (item_id, expires_at)
  WHERE status = 'PENDING';

DROP TRIGGER IF EXISTS trg_reservations_set_updated_at ON reservations;
CREATE TRIGGER trg_reservations_set_updated_at
  BEFORE UPDATE ON reservations
  FOR EACH ROW
  EXECUTE PROCEDURE set_updated_at();

-- -----------------------------------------------------------------------------
-- create_inventory_reservation
-- Locks the item, expires stale holds, checks availability, inserts PENDING.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION create_inventory_reservation(
  p_item_id UUID,
  p_customer_id TEXT,
  p_quantity INTEGER,
  p_ttl_minutes INTEGER DEFAULT 10
)
RETURNS reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item items%ROWTYPE;
  v_held INTEGER;
  v_available INTEGER;
  v_reservation reservations%ROWTYPE;
BEGIN
  RAISE NOTICE '[rpc] create_inventory_reservation item_id=% quantity=% ttl=%',
    p_item_id, p_quantity, p_ttl_minutes;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: quantity must be greater than zero'
      USING ERRCODE = '22023';
  END IF;

  IF p_customer_id IS NULL OR length(trim(p_customer_id)) = 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: customer_id cannot be empty'
      USING ERRCODE = '22023';
  END IF;

  IF p_ttl_minutes IS NULL OR p_ttl_minutes <= 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: ttl_minutes must be greater than zero'
      USING ERRCODE = '22023';
  END IF;

  -- 1) Lock target item (prevents concurrent oversell)
  SELECT *
  INTO v_item
  FROM items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND: item does not exist'
      USING ERRCODE = 'P0002';
  END IF;

  -- 2) Mark expired pending reservations for this item
  UPDATE reservations
  SET
    status = 'EXPIRED',
    expired_at = NOW(),
    updated_at = NOW()
  WHERE item_id = p_item_id
    AND status = 'PENDING'
    AND expires_at <= NOW();

  -- 3) Active held quantity (pending and not expired)
  SELECT COALESCE(SUM(quantity), 0)
  INTO v_held
  FROM reservations
  WHERE item_id = p_item_id
    AND status = 'PENDING'
    AND expires_at > NOW();

  -- 4) Available quantity
  v_available := v_item.total_quantity - v_item.confirmed_quantity - v_held;

  RAISE NOTICE '[rpc] create_inventory_reservation available=% held=% confirmed=%',
    v_available, v_held, v_item.confirmed_quantity;

  -- 5) Reject insufficient inventory
  IF p_quantity > v_available THEN
    RAISE EXCEPTION 'INSUFFICIENT_INVENTORY: requested quantity is not available'
      USING ERRCODE = 'P0001';
  END IF;

  -- 6) Insert pending reservation
  INSERT INTO reservations (
    item_id,
    customer_id,
    quantity,
    status,
    expires_at
  ) VALUES (
    p_item_id,
    trim(p_customer_id),
    p_quantity,
    'PENDING',
    NOW() + make_interval(mins => p_ttl_minutes)
  )
  RETURNING * INTO v_reservation;

  RETURN v_reservation;
END;
$$;

-- -----------------------------------------------------------------------------
-- confirm_inventory_reservation
-- Retry-safe: already CONFIRMED returns unchanged; deducts confirmed qty once.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION confirm_inventory_reservation(
  p_reservation_id UUID
)
RETURNS reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation reservations%ROWTYPE;
  v_item items%ROWTYPE;
BEGIN
  RAISE NOTICE '[rpc] confirm_inventory_reservation id=%', p_reservation_id;

  -- 1) Lock reservation
  SELECT *
  INTO v_reservation
  FROM reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND: reservation does not exist'
      USING ERRCODE = 'P0002';
  END IF;

  -- 2) Lock related item
  SELECT *
  INTO v_item
  FROM items
  WHERE id = v_reservation.item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND: item does not exist'
      USING ERRCODE = 'P0002';
  END IF;

  -- 3) Idempotent confirm
  IF v_reservation.status = 'CONFIRMED' THEN
    RAISE NOTICE '[rpc] confirm_inventory_reservation already confirmed id=%', p_reservation_id;
    RETURN v_reservation;
  END IF;

  IF v_reservation.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'INVALID_RESERVATION_STATE: cannot confirm a cancelled reservation'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_reservation.status = 'EXPIRED' THEN
    RAISE EXCEPTION 'RESERVATION_EXPIRED: cannot confirm an expired reservation'
      USING ERRCODE = 'P0001';
  END IF;

  -- 4/5) Pending but past expiration — expire without increasing confirmed
  IF v_reservation.status = 'PENDING' AND v_reservation.expires_at <= NOW() THEN
    UPDATE reservations
    SET
      status = 'EXPIRED',
      expired_at = NOW(),
      updated_at = NOW()
    WHERE id = v_reservation.id;

    RAISE EXCEPTION 'RESERVATION_EXPIRED: cannot confirm an expired reservation'
      USING ERRCODE = 'P0001';
  END IF;

  -- 6/7/8) Confirm once and permanently increase confirmed_quantity
  UPDATE reservations
  SET
    status = 'CONFIRMED',
    confirmed_at = NOW(),
    updated_at = NOW()
  WHERE id = v_reservation.id
  RETURNING * INTO v_reservation;

  UPDATE items
  SET
    confirmed_quantity = confirmed_quantity + v_reservation.quantity,
    updated_at = NOW()
  WHERE id = v_item.id;

  RETURN v_reservation;
END;
$$;

-- -----------------------------------------------------------------------------
-- cancel_inventory_reservation
-- Retry-safe: already CANCELLED returns unchanged; releases hold via status.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION cancel_inventory_reservation(
  p_reservation_id UUID
)
RETURNS reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation reservations%ROWTYPE;
BEGIN
  RAISE NOTICE '[rpc] cancel_inventory_reservation id=%', p_reservation_id;

  -- 1) Lock reservation
  SELECT *
  INTO v_reservation
  FROM reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND: reservation does not exist'
      USING ERRCODE = 'P0002';
  END IF;

  -- 2) Idempotent cancel
  IF v_reservation.status = 'CANCELLED' THEN
    RAISE NOTICE '[rpc] cancel_inventory_reservation already cancelled id=%', p_reservation_id;
    RETURN v_reservation;
  END IF;

  -- 5) Reject cancel after confirm (must not increase availability)
  IF v_reservation.status = 'CONFIRMED' THEN
    RAISE EXCEPTION 'RESERVATION_ALREADY_CONFIRMED: cannot cancel a confirmed reservation'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_reservation.status = 'EXPIRED' THEN
    RAISE EXCEPTION 'INVALID_RESERVATION_STATE: cannot cancel an expired reservation'
      USING ERRCODE = 'P0001';
  END IF;

  -- 3/4) PENDING -> CANCELLED (held qty drops automatically)
  UPDATE reservations
  SET
    status = 'CANCELLED',
    cancelled_at = NOW(),
    updated_at = NOW()
  WHERE id = v_reservation.id
  RETURNING * INTO v_reservation;

  RETURN v_reservation;
END;
$$;

-- -----------------------------------------------------------------------------
-- expire_inventory_reservations
-- Retry-safe bulk expire of pending reservations past expires_at.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION expire_inventory_reservations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  RAISE NOTICE '[rpc] expire_inventory_reservations starting';

  UPDATE reservations
  SET
    status = 'EXPIRED',
    expired_at = NOW(),
    updated_at = NOW()
  WHERE status = 'PENDING'
    AND expires_at <= NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RAISE NOTICE '[rpc] expire_inventory_reservations expired_count=%', v_count;
  RETURN v_count;
END;
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- Auth is out of scope for this API. Disable RLS so service-role (and local
-- verification) inserts/updates are not blocked by empty policy sets.
-- -----------------------------------------------------------------------------

ALTER TABLE items DISABLE ROW LEVEL SECURITY;
ALTER TABLE reservations DISABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- Grants (Supabase roles)
-- -----------------------------------------------------------------------------

GRANT USAGE ON TYPE reservation_status TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE items TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE reservations TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION create_inventory_reservation(UUID, TEXT, INTEGER, INTEGER)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION confirm_inventory_reservation(UUID)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION cancel_inventory_reservation(UUID)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION expire_inventory_reservations()
  TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Reload PostgREST schema cache so RPCs appear immediately
-- -----------------------------------------------------------------------------

NOTIFY pgrst, 'reload schema';
