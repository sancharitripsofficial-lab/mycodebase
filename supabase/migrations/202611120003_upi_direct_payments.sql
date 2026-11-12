-- ============================================================================
-- Sanchari • Micro Trips — Direct UPI payments (owner's own UPI ID)
-- Migration: 202611120003_upi_direct_payments.sql
--
-- How money moves:
--   1. Customer holds seats (reserve_departure_seats) for bookingPolicy.holdMinutes.
--   2. Customer pays the exact amount to the owner's UPI ID (QR / UPI app) and types the
--      12-digit UPI reference number (UTR) on the site -> submit_upi_payment.
--      The seats stay held (no expiry) until staff check the bank/UPI app.
--   3. Owner/ops look at their bank or UPI app and decide -> review_upi_payment:
--      confirm | reject_retry | reject_cancel | refund_late.
--   Nothing here trusts the browser for the amount: the amount is always the booking's
--   amount_due_paise at the moment the UTR is sent.
--
-- Rules enforced by the database:
--   * One UTR can only ever pay once (submitted / captured / refunded), across all bookings.
--   * One booking has at most one payment waiting for a check.
--   * A paid-but-late customer is never lost: if the hold expired, seats are re-taken when
--     still free, otherwise the payment is flagged seats_lost for a refund.
--   * Only the owner can change the UPI ID money goes to; every change is audit-logged.
-- Lock order everywhere: departures row -> bookings row -> payments row.
-- Rollback: drop the functions, the trigger, upi_payment_settings, the new payment columns
-- and indexes, and restore payments_status_check to the original value list.
-- ============================================================================

-- 1. Where UPI money is received (single row, id = 1)
CREATE TABLE IF NOT EXISTS public.upi_payment_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  upi_id TEXT NOT NULL DEFAULT '' CHECK (
    upi_id = '' OR upi_id ~ '^[a-z0-9._-]{2,200}@[a-z][a-z0-9.-]{1,63}$'
  ),
  payee_name TEXT NOT NULL DEFAULT '' CHECK (char_length(payee_name) <= 60),
  support_phone TEXT NOT NULL DEFAULT '' CHECK (support_phone = '' OR support_phone ~ '^[6-9][0-9]{9}$'),
  updated_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT upi_enabled_needs_payee CHECK (NOT is_enabled OR (upi_id <> '' AND char_length(payee_name) >= 2))
);

INSERT INTO public.upi_payment_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.upi_payment_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "upi_settings_staff_read" ON public.upi_payment_settings;
CREATE POLICY "upi_settings_staff_read" ON public.upi_payment_settings
  FOR SELECT USING (public.is_staff(ARRAY['owner', 'ops']));

DROP POLICY IF EXISTS "upi_settings_owner_update" ON public.upi_payment_settings;
CREATE POLICY "upi_settings_owner_update" ON public.upi_payment_settings
  FOR UPDATE USING (public.is_staff(ARRAY['owner'])) WITH CHECK (public.is_staff(ARRAY['owner']));

CREATE OR REPLACE FUNCTION public.audit_upi_settings_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_enabled IS DISTINCT FROM OLD.is_enabled
     OR NEW.upi_id IS DISTINCT FROM OLD.upi_id
     OR NEW.payee_name IS DISTINCT FROM OLD.payee_name
     OR NEW.support_phone IS DISTINCT FROM OLD.support_phone THEN
    INSERT INTO public.audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, reason, before_state, after_state)
    VALUES (
      NEW.updated_by,
      (SELECT sr.role FROM public.staff_roles sr WHERE sr.user_id = NEW.updated_by),
      'upi_settings_changed',
      'upi_payment_settings',
      '1',
      'UPI receiving account changed',
      jsonb_build_object('is_enabled', OLD.is_enabled, 'upi_id', OLD.upi_id, 'payee_name', OLD.payee_name, 'support_phone', OLD.support_phone),
      jsonb_build_object('is_enabled', NEW.is_enabled, 'upi_id', NEW.upi_id, 'payee_name', NEW.payee_name, 'support_phone', NEW.support_phone)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_upi_settings ON public.upi_payment_settings;
CREATE TRIGGER trg_audit_upi_settings
  AFTER UPDATE ON public.upi_payment_settings
  FOR EACH ROW EXECUTE FUNCTION public.audit_upi_settings_change();

-- 2. Payments: UPI columns and statuses
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_status_check CHECK (
  status IN ('created', 'authorized', 'submitted', 'captured', 'rejected', 'failed', 'refunded')
);

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS utr TEXT NULL CHECK (utr IS NULL OR utr ~ '^[0-9]{12}$'),
  ADD COLUMN IF NOT EXISTS paid_to_upi_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS paid_to_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS late_after_hold BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS seats_lost BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS review_note TEXT NULL;

-- One UTR pays once, ever (a rejected UTR may be sent again after a correction)
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_live_utr
  ON public.payments (utr)
  WHERE utr IS NOT NULL AND status IN ('submitted', 'captured', 'refunded');

-- At most one payment waiting for a check per booking
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_one_waiting_per_booking
  ON public.payments (booking_id)
  WHERE status = 'submitted';

CREATE INDEX IF NOT EXISTS idx_payments_status_submitted_at
  ON public.payments (status, submitted_at DESC);

-- 3. Shared helper: expire unpaid holds whose time ran out (same rule as reserve_departure_seats)
CREATE OR REPLACE FUNCTION public.release_expired_holds(p_departure_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH expired_bookings AS (
    UPDATE public.bookings
    SET status = 'expired', updated_at = now()
    WHERE departure_id = p_departure_id
      AND status = 'pending_payment'
      AND hold_expires_at IS NOT NULL
      AND hold_expires_at <= now()
    RETURNING id
  )
  UPDATE public.seat_allocations sa
  SET allocation_status = 'released', updated_at = now()
  WHERE sa.departure_id = p_departure_id
    AND sa.allocation_status = 'held'
    AND (
      (sa.hold_expires_at IS NOT NULL AND sa.hold_expires_at <= now())
      OR sa.booking_id IN (SELECT id FROM expired_bookings)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.release_expired_holds(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_holds(UUID) TO service_role;

-- 4. Customer sends the UPI reference number (UTR)
CREATE OR REPLACE FUNCTION public.submit_upi_payment(p_booking_id UUID, p_utr TEXT)
RETURNS TABLE (
  payment_id UUID,
  amount_paise INTEGER,
  late_after_hold BOOLEAN,
  seats_lost BOOLEAN,
  booking_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_utr TEXT := regexp_replace(COALESCE(p_utr, ''), '\s', '', 'g');
  v_settings public.upi_payment_settings%ROWTYPE;
  v_departure_id UUID;
  v_dep public.departures%ROWTYPE;
  v_b public.bookings%ROWTYPE;
  v_late BOOLEAN := false;
  v_lost BOOLEAN := false;
  v_type TEXT;
  v_payment_id UUID;
  v_active INTEGER;
  v_free INTEGER[];
  v_seat INTEGER;
BEGIN
  IF v_utr !~ '^[0-9]{12}$' THEN
    RAISE EXCEPTION 'UTR_FORMAT: The UPI reference number must be exactly 12 digits.';
  END IF;

  SELECT * INTO v_settings FROM public.upi_payment_settings WHERE id = 1;
  IF NOT FOUND OR NOT v_settings.is_enabled THEN
    RAISE EXCEPTION 'UPI_DISABLED: UPI payments are switched off. Please contact us.';
  END IF;

  SELECT b.departure_id INTO v_departure_id FROM public.bookings b WHERE b.id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND: Booking not found.';
  END IF;

  SELECT * INTO v_dep FROM public.departures WHERE id = v_departure_id FOR UPDATE;
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;

  IF v_b.status NOT IN ('pending_payment', 'deposit_paid', 'expired') THEN
    RAISE EXCEPTION 'BOOKING_NOT_PAYABLE: This booking is % and cannot take a payment. Please contact us before paying.', replace(v_b.status, '_', ' ');
  END IF;

  IF v_b.amount_due_paise <= 0 THEN
    RAISE EXCEPTION 'NOTHING_DUE: Nothing is due on this booking.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.payments p WHERE p.booking_id = v_b.id AND p.status = 'submitted') THEN
    RAISE EXCEPTION 'ALREADY_WAITING: A payment for this booking is already waiting for our check.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payments p
    WHERE p.utr = v_utr AND p.status IN ('submitted', 'captured', 'refunded')
  ) THEN
    RAISE EXCEPTION 'UTR_USED: This UPI reference number has already been used for a payment.';
  END IF;

  IF v_b.status = 'expired'
     OR (v_b.status = 'pending_payment' AND v_b.hold_expires_at IS NOT NULL AND v_b.hold_expires_at <= now()) THEN
    -- Paid after the hold ran out: take the seats again if they are still free.
    v_late := true;

    UPDATE public.seat_allocations
    SET allocation_status = 'released', updated_at = now()
    WHERE booking_id = v_b.id AND allocation_status = 'held';

    PERFORM public.release_expired_holds(v_dep.id);

    SELECT COUNT(*)::INTEGER INTO v_active
    FROM public.seat_allocations
    WHERE departure_id = v_dep.id
      AND allocation_status IN ('held', 'confirmed', 'operator_blocked');

    IF NOT v_dep.is_published
       OR v_dep.status IN ('cancelled', 'completed')
       OR v_dep.booking_cutoff_at < now()
       OR (v_b.booking_mode = 'private_vehicle' AND v_active > 0)
       OR v_active + v_b.seats_requested > v_dep.max_capacity THEN
      v_lost := true;
      UPDATE public.bookings
      SET status = 'expired', updated_at = now()
      WHERE id = v_b.id;
    ELSE
      SELECT ARRAY_AGG(s ORDER BY s) INTO v_free
      FROM generate_series(1, v_dep.max_capacity) AS s
      WHERE NOT EXISTS (
        SELECT 1 FROM public.seat_allocations sa
        WHERE sa.departure_id = v_dep.id
          AND sa.seat_number = s
          AND sa.allocation_status IN ('held', 'confirmed', 'operator_blocked')
      );

      FOREACH v_seat IN ARRAY v_free[1:v_b.seats_requested]
      LOOP
        INSERT INTO public.seat_allocations (departure_id, booking_id, seat_number, allocation_status, hold_expires_at)
        VALUES (v_dep.id, v_b.id, v_seat, 'held', NULL);
      END LOOP;

      UPDATE public.bookings
      SET status = 'pending_payment', hold_expires_at = NULL, updated_at = now()
      WHERE id = v_b.id;
    END IF;
  ELSIF v_b.status = 'pending_payment' THEN
    -- Keep the seats until staff have checked the money (no silent expiry of a paid customer).
    UPDATE public.bookings SET hold_expires_at = NULL, updated_at = now() WHERE id = v_b.id;
    UPDATE public.seat_allocations
    SET hold_expires_at = NULL, updated_at = now()
    WHERE booking_id = v_b.id AND allocation_status = 'held';
  END IF;

  v_type := CASE
    WHEN v_b.amount_paid_paise > 0 THEN 'balance'
    WHEN v_b.amount_due_paise < v_b.total_paise THEN 'deposit'
    ELSE 'full'
  END;

  INSERT INTO public.payments (
    booking_id, provider, idempotency_key, amount_paise, currency, payment_type, status,
    utr, paid_to_upi_id, paid_to_name, submitted_at, late_after_hold, seats_lost
  ) VALUES (
    v_b.id, 'upi', 'upi:' || gen_random_uuid()::TEXT, v_b.amount_due_paise, 'INR', v_type, 'submitted',
    v_utr, v_settings.upi_id, v_settings.payee_name, now(), v_late, v_lost
  )
  RETURNING id INTO v_payment_id;

  PERFORM public.recalculate_departure_status(v_dep.id);

  INSERT INTO public.audit_logs (actor_role, action, entity_type, entity_id, reason, after_state)
  VALUES (
    'customer',
    'upi_payment_submitted',
    'booking',
    v_b.id::TEXT,
    CASE WHEN v_lost THEN 'UPI reference sent after the hold expired; seats no longer free'
         WHEN v_late THEN 'UPI reference sent after the hold expired; seats taken again'
         ELSE 'UPI reference sent; waiting for staff check' END,
    jsonb_build_object('payment_id', v_payment_id, 'amount_paise', v_b.amount_due_paise,
      'utr_last4', right(v_utr, 4), 'late', v_late, 'seats_lost', v_lost)
  );

  RETURN QUERY
    SELECT v_payment_id, v_b.amount_due_paise, v_late, v_lost, b.status
    FROM public.bookings b WHERE b.id = v_b.id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_upi_payment(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_upi_payment(UUID, TEXT) TO service_role;

-- 5. Staff decision after looking at the bank / UPI app
--    confirm        : money is in the account -> booking paid (deposit_paid / confirmed)
--    reject_retry   : not found -> payment rejected; an unpaid booking gets a fresh window
--    reject_cancel  : not found -> payment rejected and the unpaid booking cancelled
--    refund_late    : late payment whose seats were gone -> money returned to customer
CREATE OR REPLACE FUNCTION public.review_upi_payment(
  p_payment_id UUID,
  p_decision TEXT,
  p_actor_user_id UUID,
  p_actor_role TEXT,
  p_note TEXT,
  p_retry_minutes INTEGER DEFAULT 15
)
RETURNS TABLE (
  payment_status TEXT,
  booking_status TEXT,
  amount_paid_paise INTEGER,
  amount_due_paise INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_booking_id UUID;
  v_departure_id UUID;
  v_dep public.departures%ROWTYPE;
  v_b public.bookings%ROWTYPE;
  v_p public.payments%ROWTYPE;
  v_note TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_new_paid INTEGER;
  v_new_due INTEGER;
  v_next_status TEXT;
  v_held INTEGER;
  v_payment_status TEXT;
  v_retry_until TIMESTAMPTZ;
BEGIN
  IF p_decision NOT IN ('confirm', 'reject_retry', 'reject_cancel', 'refund_late') THEN
    RAISE EXCEPTION 'BAD_DECISION: Unknown decision %.', p_decision;
  END IF;

  IF p_actor_role NOT IN ('owner', 'ops') THEN
    RAISE EXCEPTION 'NOT_ALLOWED: Only owner or operations staff can review payments.';
  END IF;

  IF p_decision <> 'confirm' AND (v_note IS NULL OR char_length(v_note) < 5) THEN
    RAISE EXCEPTION 'NOTE_REQUIRED: Write what you found (at least 5 characters).';
  END IF;

  SELECT p.booking_id INTO v_booking_id FROM public.payments p WHERE p.id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND: Payment not found.';
  END IF;
  SELECT b.departure_id INTO v_departure_id FROM public.bookings b WHERE b.id = v_booking_id;

  SELECT * INTO v_dep FROM public.departures WHERE id = v_departure_id FOR UPDATE;
  SELECT * INTO v_b FROM public.bookings WHERE id = v_booking_id FOR UPDATE;
  SELECT * INTO v_p FROM public.payments WHERE id = p_payment_id FOR UPDATE;

  IF v_p.provider <> 'upi' THEN
    RAISE EXCEPTION 'NOT_UPI: Only UPI payments are reviewed here.';
  END IF;

  IF v_p.status <> 'submitted' THEN
    RAISE EXCEPTION 'ALREADY_REVIEWED: This payment was already marked %.', v_p.status;
  END IF;

  IF p_decision = 'confirm' THEN
    IF v_p.seats_lost OR v_b.status NOT IN ('pending_payment', 'deposit_paid', 'cancel_requested') THEN
      RAISE EXCEPTION 'CANNOT_CONFIRM: The booking is % so this money cannot be applied to it. Refund the customer instead.', replace(v_b.status, '_', ' ');
    END IF;

    IF v_p.amount_paise <> v_b.amount_due_paise THEN
      RAISE EXCEPTION 'AMOUNT_CHANGED: The amount due changed after this payment was sent. Check the booking before confirming.';
    END IF;

    IF v_b.status = 'pending_payment' THEN
      SELECT COUNT(*)::INTEGER INTO v_held
      FROM public.seat_allocations
      WHERE booking_id = v_b.id AND allocation_status = 'held';
      IF v_held <> v_b.seats_requested THEN
        RAISE EXCEPTION 'SEATS_MISSING: The seats for this booking are no longer held.';
      END IF;
    END IF;

    UPDATE public.payments
    SET status = 'captured', verified_at = now(), reviewed_by = p_actor_user_id,
        reviewed_at = now(), review_note = v_note, updated_at = now()
    WHERE id = v_p.id;

    v_new_paid := v_b.amount_paid_paise + v_p.amount_paise;
    v_new_due := GREATEST(0, v_b.total_paise - v_new_paid);
    v_next_status := CASE
      WHEN v_b.status = 'cancel_requested' THEN 'cancel_requested'
      WHEN v_new_due = 0 THEN 'confirmed'
      ELSE 'deposit_paid'
    END;

    UPDATE public.bookings
    SET amount_paid_paise = v_new_paid,
        amount_due_paise = v_new_due,
        status = v_next_status,
        hold_expires_at = NULL,
        payment_provider = 'upi',
        updated_at = now()
    WHERE id = v_b.id;

    UPDATE public.seat_allocations
    SET allocation_status = 'confirmed', hold_expires_at = NULL, updated_at = now()
    WHERE booking_id = v_b.id AND allocation_status = 'held';

    v_payment_status := 'captured';

  ELSIF p_decision = 'reject_retry' THEN
    IF v_p.seats_lost THEN
      RAISE EXCEPTION 'USE_REFUND: The seats for this late payment are gone. Mark it refunded or not received (cancel).';
    END IF;

    UPDATE public.payments
    SET status = 'rejected', reviewed_by = p_actor_user_id, reviewed_at = now(),
        review_note = v_note, updated_at = now()
    WHERE id = v_p.id;

    IF v_b.status = 'pending_payment' THEN
      -- Fresh short window to send the correct reference; after that the seats free up as usual.
      v_retry_until := now() + make_interval(mins => GREATEST(5, LEAST(COALESCE(p_retry_minutes, 15), 60)));
      UPDATE public.bookings SET hold_expires_at = v_retry_until, updated_at = now() WHERE id = v_b.id;
      UPDATE public.seat_allocations
      SET hold_expires_at = v_retry_until, updated_at = now()
      WHERE booking_id = v_b.id AND allocation_status = 'held';
    ELSIF v_b.status = 'cancel_requested' AND v_b.amount_paid_paise = 0 THEN
      -- Customer already asked to cancel and nothing was received: close it and free the seats.
      UPDATE public.bookings SET status = 'cancelled', hold_expires_at = NULL, updated_at = now() WHERE id = v_b.id;
      UPDATE public.seat_allocations
      SET allocation_status = 'released', updated_at = now()
      WHERE booking_id = v_b.id AND allocation_status = 'held';
    END IF;

    v_payment_status := 'rejected';

  ELSIF p_decision = 'reject_cancel' THEN
    IF v_b.amount_paid_paise > 0 THEN
      RAISE EXCEPTION 'HAS_PAID_DEPOSIT: This booking already has money paid. Use "let customer retry" for this payment.';
    END IF;

    UPDATE public.payments
    SET status = 'rejected', reviewed_by = p_actor_user_id, reviewed_at = now(),
        review_note = v_note, updated_at = now()
    WHERE id = v_p.id;

    IF v_b.status IN ('pending_payment', 'cancel_requested') THEN
      UPDATE public.bookings SET status = 'cancelled', hold_expires_at = NULL, updated_at = now() WHERE id = v_b.id;
      UPDATE public.seat_allocations
      SET allocation_status = 'released', updated_at = now()
      WHERE booking_id = v_b.id AND allocation_status IN ('held', 'confirmed');
    END IF;

    v_payment_status := 'rejected';

  ELSE -- refund_late
    IF NOT v_p.seats_lost THEN
      RAISE EXCEPTION 'NOT_LATE: Only late payments whose seats were gone can be marked refunded here.';
    END IF;

    UPDATE public.payments
    SET status = 'refunded', reviewed_by = p_actor_user_id, reviewed_at = now(),
        review_note = v_note, updated_at = now()
    WHERE id = v_p.id;

    INSERT INTO public.refunds (booking_id, payment_id, amount_paise, reason, status, processed_by)
    VALUES (v_b.id, v_p.id, v_p.amount_paise, v_note, 'processed', p_actor_user_id);

    v_payment_status := 'refunded';
  END IF;

  PERFORM public.recalculate_departure_status(v_dep.id);

  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, reason, before_state, after_state)
  VALUES (
    p_actor_user_id,
    p_actor_role,
    'upi_payment_' || p_decision,
    'booking',
    v_b.id::TEXT,
    COALESCE(v_note, 'Money seen in the account'),
    jsonb_build_object('booking_status', v_b.status, 'amount_paid_paise', v_b.amount_paid_paise, 'payment_status', v_p.status),
    jsonb_build_object('payment_id', v_p.id, 'payment_status', v_payment_status,
      'amount_paise', v_p.amount_paise, 'utr_last4', right(v_p.utr, 4))
  );

  RETURN QUERY
    SELECT v_payment_status, b.status, b.amount_paid_paise, b.amount_due_paise
    FROM public.bookings b WHERE b.id = v_b.id;
END;
$$;

REVOKE ALL ON FUNCTION public.review_upi_payment(UUID, TEXT, UUID, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_upi_payment(UUID, TEXT, UUID, TEXT, TEXT, INTEGER) TO service_role;

-- 6. Customer cancels a booking they never paid for: free the seats at once
CREATE OR REPLACE FUNCTION public.cancel_unpaid_booking(p_booking_id UUID, p_reason TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_departure_id UUID;
  v_b public.bookings%ROWTYPE;
BEGIN
  SELECT b.departure_id INTO v_departure_id FROM public.bookings b WHERE b.id = p_booking_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  PERFORM 1 FROM public.departures WHERE id = v_departure_id FOR UPDATE;
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;

  IF v_b.status <> 'pending_payment'
     OR v_b.amount_paid_paise > 0
     OR EXISTS (SELECT 1 FROM public.payments p WHERE p.booking_id = v_b.id AND p.status = 'submitted') THEN
    RETURN false;
  END IF;

  UPDATE public.bookings SET status = 'cancelled', hold_expires_at = NULL, updated_at = now() WHERE id = v_b.id;
  UPDATE public.seat_allocations
  SET allocation_status = 'released', updated_at = now()
  WHERE booking_id = v_b.id AND allocation_status = 'held';

  PERFORM public.recalculate_departure_status(v_departure_id);

  INSERT INTO public.audit_logs (actor_role, action, entity_type, entity_id, reason, before_state, after_state)
  VALUES ('customer', 'customer_cancelled_unpaid', 'booking', v_b.id::TEXT, p_reason,
    jsonb_build_object('status', v_b.status), jsonb_build_object('status', 'cancelled'));

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_unpaid_booking(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_unpaid_booking(UUID, TEXT) TO service_role;
