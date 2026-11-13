-- ============================================================================
-- Sanchari • Micro Trips — Owner operations
-- Migration: 202611130002_owner_operations.sql
--
-- 1. Seat choice: customers pick exact seats on the Ertiga map; reserve_departure_seats takes
--    an optional p_preferred_seats and refuses any seat that is no longer free (SEAT_TAKEN).
-- 2. Public seat map: seat numbers in use per departure (no names, no bookings).
-- 3. Offline payments (cash / bank transfer / manual UPI) recorded by staff with a reference.
-- 4. Refunds recorded with amount + reference; optional close of the booking.
-- 5. Trip crew per departure: driver, phone, vehicle number, batch WhatsApp group link.
-- 6. Enquiries: private-date / custom-trip / group requests from the website.
-- Lock order everywhere: departures -> bookings -> payments.
-- Rollback: drop the new functions/table/columns; re-run 0002's reserve_departure_seats.
-- ============================================================================

-- 1. Seat choice (the tested 0002 function, changed only in its new parameter and seat pick)
DROP FUNCTION IF EXISTS public.reserve_departure_seats(TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, UUID, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, TIMESTAMPTZ, INTEGER, JSONB, JSONB, TEXT, JSONB, TEXT, TEXT, BOOLEAN, TEXT);

CREATE OR REPLACE FUNCTION public.reserve_departure_seats(
  p_booking_reference TEXT,
  p_departure_id UUID,
  p_user_id UUID,
  p_customer_name TEXT,
  p_customer_email TEXT,
  p_customer_phone TEXT,
  p_booking_mode TEXT,
  p_seats_requested INTEGER,
  p_pickup_point_id UUID,
  p_unit_price_paise INTEGER,
  p_subtotal_paise INTEGER,
  p_discount_paise INTEGER,
  p_tax_paise INTEGER,
  p_total_paise INTEGER,
  p_amount_due_paise INTEGER,
  p_balance_due_at TIMESTAMPTZ,
  p_hold_minutes INTEGER,
  p_terms_snapshot JSONB,
  p_pricing_snapshot JSONB,
  p_payment_provider TEXT,
  p_travelers JSONB,
  p_co_traveler_preference TEXT,
  p_preference_notes TEXT,
  p_whatsapp_opt_in BOOLEAN,
  p_policy_version TEXT,
  p_preferred_seats INTEGER[] DEFAULT NULL
)
RETURNS TABLE (
  booking_id UUID,
  booking_reference TEXT,
  assigned_seats INTEGER[],
  hold_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_departure public.departures%ROWTYPE;
  v_active_count INTEGER;
  v_available_seats INTEGER[];
  v_chosen_seats INTEGER[];
  v_booking_id UUID;
  v_hold_until TIMESTAMPTZ;
  v_traveler JSONB;
  v_seat INTEGER;
  v_resolution TEXT;
BEGIN
  IF p_seats_requested < 1 OR p_seats_requested > 6 THEN
    RAISE EXCEPTION 'Invalid seat count: must be between 1 and 6';
  END IF;

  IF p_booking_mode = 'private_vehicle' AND p_seats_requested <> 6 THEN
    RAISE EXCEPTION 'Private vehicle bookings must allocate all 6 seats';
  END IF;

  -- 1. Lock the departure row so concurrent requests serialize cleanly
  SELECT * INTO v_departure
  FROM public.departures
  WHERE id = p_departure_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Departure not found';
  END IF;

  -- 'sold_out' is only a display badge; real capacity is checked below after expired holds
  -- are released (otherwise a car filled by unpaid holds would stay unbookable forever).
  IF NOT v_departure.is_published OR v_departure.status IN ('cancelled', 'completed') THEN
    RAISE EXCEPTION 'Departure is not open for booking';
  END IF;

  IF v_departure.booking_cutoff_at < now() THEN
    RAISE EXCEPTION 'Booking cutoff has passed for this departure';
  END IF;

  -- 2. Release expired temporary holds before evaluating capacity
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

  -- 3. Count currently active seats
  SELECT COUNT(*)::INTEGER INTO v_active_count
  FROM public.seat_allocations
  WHERE departure_id = p_departure_id
    AND allocation_status IN ('held', 'confirmed', 'operator_blocked');

  IF p_booking_mode = 'private_vehicle' AND v_active_count > 0 THEN
    RAISE EXCEPTION 'Private vehicle option requires all 6 seats to be available';
  END IF;

  IF (v_active_count + p_seats_requested) > v_departure.max_capacity THEN
    RAISE EXCEPTION 'Insufficient seats remaining (% left)', GREATEST(0, v_departure.max_capacity - v_active_count);
  END IF;

  -- 4. Select lowest free seat numbers within 1..max_capacity
  SELECT ARRAY_AGG(s ORDER BY s) INTO v_available_seats
  FROM generate_series(1, v_departure.max_capacity) AS s
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.seat_allocations sa
    WHERE sa.departure_id = p_departure_id
      AND sa.seat_number = s
      AND sa.allocation_status IN ('held', 'confirmed', 'operator_blocked')
  );

  IF v_available_seats IS NULL OR array_length(v_available_seats, 1) < p_seats_requested THEN
    RAISE EXCEPTION 'No matching free seats found';
  END IF;

  -- Customer picked exact seats on the car map: honour them only if every one is still free.
  IF p_preferred_seats IS NOT NULL AND COALESCE(array_length(p_preferred_seats, 1), 0) > 0
     AND p_booking_mode <> 'private_vehicle' THEN
    IF array_length(p_preferred_seats, 1) <> p_seats_requested THEN
      RAISE EXCEPTION 'SEAT_COUNT: Pick exactly % seat(s) on the car map.', p_seats_requested;
    END IF;
    IF (SELECT COUNT(DISTINCT s) FROM unnest(p_preferred_seats) AS s) <> p_seats_requested THEN
      RAISE EXCEPTION 'SEAT_DUPLICATE: The same seat was picked twice.';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(p_preferred_seats) AS s WHERE s IS NULL OR s < 1 OR s > v_departure.max_capacity) THEN
      RAISE EXCEPTION 'SEAT_INVALID: That seat is not offered on this date.';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(p_preferred_seats) AS s WHERE NOT (s = ANY (v_available_seats))) THEN
      RAISE EXCEPTION 'SEAT_TAKEN: Seat % was just taken by someone else. Please pick again.',
        (SELECT string_agg(s::TEXT, ', ' ORDER BY s) FROM unnest(p_preferred_seats) AS s WHERE NOT (s = ANY (v_available_seats)));
    END IF;
    SELECT ARRAY_AGG(s ORDER BY s) INTO v_chosen_seats FROM unnest(p_preferred_seats) AS s;
  ELSE
    v_chosen_seats := v_available_seats[1:p_seats_requested];
  END IF;
  v_hold_until := now() + make_interval(mins => GREATEST(5, LEAST(p_hold_minutes, 60)));

  -- 5. Insert booking header
  INSERT INTO public.bookings (
    booking_reference,
    departure_id,
    user_id,
    customer_name,
    customer_email,
    customer_phone,
    booking_mode,
    seats_requested,
    status,
    currency,
    unit_price_paise,
    subtotal_paise,
    discount_paise,
    tax_paise,
    total_paise,
    amount_paid_paise,
    amount_due_paise,
    balance_due_at,
    hold_expires_at,
    terms_snapshot,
    pricing_snapshot,
    pickup_point_id,
    payment_provider
  ) VALUES (
    p_booking_reference,
    p_departure_id,
    p_user_id,
    p_customer_name,
    p_customer_email,
    p_customer_phone,
    p_booking_mode,
    p_seats_requested,
    'pending_payment',
    'INR',
    p_unit_price_paise,
    p_subtotal_paise,
    p_discount_paise,
    p_tax_paise,
    p_total_paise,
    0,
    p_amount_due_paise,
    p_balance_due_at,
    v_hold_until,
    p_terms_snapshot,
    p_pricing_snapshot,
    p_pickup_point_id,
    p_payment_provider
  )
  RETURNING id INTO v_booking_id;

  -- 6. Insert travelers
  FOR v_traveler IN SELECT * FROM jsonb_array_elements(p_travelers)
  LOOP
    INSERT INTO public.booking_travelers (
      booking_id,
      full_name,
      age_group,
      emergency_contact,
      dietary_notes,
      seat_row_request,
      room_preference
    ) VALUES (
      v_booking_id,
      COALESCE(v_traveler ->> 'fullName', p_customer_name),
      COALESCE(v_traveler ->> 'ageGroup', 'adult'),
      COALESCE(v_traveler ->> 'emergencyContact', p_customer_phone),
      NULLIF(v_traveler ->> 'dietaryNotes', ''),
      COALESCE(v_traveler ->> 'seatRowRequest', 'no_preference'),
      COALESCE(v_traveler ->> 'roomPreference', 'shared_same_gender')
    );
  END LOOP;

  -- 7. Insert isolated comfort preference & consent records
  v_resolution := CASE
    WHEN COALESCE(p_co_traveler_preference, 'open_mixed') = 'open_mixed' THEN 'none_requested'
    ELSE 'pending_review'
  END;

  INSERT INTO public.booking_comfort_preferences (
    booking_id,
    co_traveler_preference,
    preference_notes,
    resolution_status,
    consent_recorded_at
  ) VALUES (
    v_booking_id,
    COALESCE(p_co_traveler_preference, 'open_mixed'),
    NULLIF(p_preference_notes, ''),
    v_resolution,
    now()
  );

  INSERT INTO public.consent_records (subject_email, booking_id, consent_type, granted, policy_version)
  VALUES
    (p_customer_email, v_booking_id, 'booking_terms_privacy', true, p_policy_version),
    (p_customer_email, v_booking_id, 'comfort_preference_processing', true, p_policy_version),
    (p_customer_email, v_booking_id, 'whatsapp_updates', COALESCE(p_whatsapp_opt_in, false), p_policy_version);

  -- 8. Insert held seat allocations
  FOREACH v_seat IN ARRAY v_chosen_seats
  LOOP
    INSERT INTO public.seat_allocations (
      departure_id,
      booking_id,
      seat_number,
      allocation_status,
      hold_expires_at
    ) VALUES (
      p_departure_id,
      v_booking_id,
      v_seat,
      'held',
      v_hold_until
    );
  END LOOP;

  -- 9. Refresh departure status badge
  PERFORM public.recalculate_departure_status(p_departure_id);

  RETURN QUERY SELECT v_booking_id, p_booking_reference, v_chosen_seats, v_hold_until;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_departure_seats(TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, UUID, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, TIMESTAMPTZ, INTEGER, JSONB, JSONB, TEXT, JSONB, TEXT, TEXT, BOOLEAN, TEXT, INTEGER[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_departure_seats(TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, UUID, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, TIMESTAMPTZ, INTEGER, JSONB, JSONB, TEXT, JSONB, TEXT, TEXT, BOOLEAN, TEXT, INTEGER[]) TO service_role;

-- 2. Which seats are in use on a published departure (numbers only — no personal data)
CREATE OR REPLACE FUNCTION public.get_departure_seat_map(p_departure_id UUID)
RETURNS TABLE (seat_number INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sa.seat_number
  FROM public.seat_allocations sa
  JOIN public.departures d ON d.id = sa.departure_id
  JOIN public.trips t ON t.id = d.trip_id
  WHERE sa.departure_id = p_departure_id
    AND d.is_published = true
    AND t.is_published = true
    AND (
      sa.allocation_status IN ('confirmed', 'operator_blocked')
      OR (sa.allocation_status = 'held' AND (sa.hold_expires_at IS NULL OR sa.hold_expires_at > now()))
    )
  ORDER BY 1;
$$;

REVOKE ALL ON FUNCTION public.get_departure_seat_map(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_departure_seat_map(UUID) TO anon, authenticated, service_role;

-- 3 & 4. Money columns
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS amount_refunded_paise INTEGER NOT NULL DEFAULT 0 CHECK (amount_refunded_paise >= 0);

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS method TEXT NULL CHECK (method IS NULL OR method IN ('upi', 'cash', 'bank_transfer', 'upi_manual', 'gateway'));

-- 3. Staff record money received outside the website (phone bookings, cash at pickup, NEFT)
CREATE OR REPLACE FUNCTION public.admin_record_payment(
  p_booking_id UUID,
  p_amount_paise INTEGER,
  p_method TEXT,
  p_reference TEXT,
  p_actor_user_id UUID,
  p_actor_role TEXT,
  p_note TEXT
)
RETURNS TABLE (booking_status TEXT, amount_paid_paise INTEGER, amount_due_paise INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_departure_id UUID;
  v_b public.bookings%ROWTYPE;
  v_ref TEXT := btrim(COALESCE(p_reference, ''));
  v_held INTEGER;
  v_owed INTEGER;
  v_new_paid INTEGER;
  v_new_due INTEGER;
  v_next TEXT;
  v_type TEXT;
  v_payment_id UUID;
BEGIN
  IF p_actor_role NOT IN ('owner', 'ops') THEN
    RAISE EXCEPTION 'NOT_ALLOWED: Only owner or operations staff can record payments.';
  END IF;
  IF p_method NOT IN ('cash', 'bank_transfer', 'upi_manual') THEN
    RAISE EXCEPTION 'BAD_METHOD: Choose cash, bank transfer or UPI.';
  END IF;
  IF char_length(v_ref) < 3 OR char_length(v_ref) > 60 THEN
    RAISE EXCEPTION 'REFERENCE_REQUIRED: Enter the UTR / transaction ID or a receipt number (3–60 characters).';
  END IF;
  IF p_amount_paise IS NULL OR p_amount_paise <= 0 THEN
    RAISE EXCEPTION 'BAD_AMOUNT: Enter the amount received.';
  END IF;

  SELECT b.departure_id INTO v_departure_id FROM public.bookings b WHERE b.id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND: Booking not found.';
  END IF;
  PERFORM 1 FROM public.departures WHERE id = v_departure_id FOR UPDATE;
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;

  IF v_b.status NOT IN ('pending_payment', 'deposit_paid') THEN
    RAISE EXCEPTION 'BOOKING_NOT_PAYABLE: This booking is % — payments can be recorded only for unpaid or deposit-paid bookings.', replace(v_b.status, '_', ' ');
  END IF;
  IF EXISTS (SELECT 1 FROM public.payments p WHERE p.booking_id = v_b.id AND p.status = 'submitted') THEN
    RAISE EXCEPTION 'ALREADY_WAITING: A UPI payment for this booking is waiting for your check. Confirm or reject it first.';
  END IF;

  v_owed := v_b.total_paise - v_b.amount_paid_paise;
  IF p_amount_paise > v_owed THEN
    RAISE EXCEPTION 'AMOUNT_TOO_HIGH: Only ₹% is still owed on this booking.', round(v_owed / 100.0, 2);
  END IF;

  IF v_b.status = 'pending_payment' THEN
    IF v_b.hold_expires_at IS NOT NULL AND v_b.hold_expires_at <= now() THEN
      RAISE EXCEPTION 'HOLD_EXPIRED: This booking''s seat hold ran out. Make a new booking for the customer.';
    END IF;
    SELECT COUNT(*)::INTEGER INTO v_held FROM public.seat_allocations WHERE booking_id = v_b.id AND allocation_status = 'held';
    IF v_held <> v_b.seats_requested THEN
      RAISE EXCEPTION 'SEATS_MISSING: The seats for this booking are no longer held.';
    END IF;
    IF p_amount_paise < v_b.amount_due_paise THEN
      RAISE EXCEPTION 'AMOUNT_TOO_LOW: At least ₹% (the amount due now) is needed to confirm the seats.', round(v_b.amount_due_paise / 100.0, 2);
    END IF;
  END IF;

  v_type := CASE
    WHEN v_b.amount_paid_paise > 0 THEN 'balance'
    WHEN p_amount_paise < v_b.total_paise THEN 'deposit'
    ELSE 'full'
  END;

  BEGIN
    INSERT INTO public.payments (
      booking_id, provider, provider_payment_id, idempotency_key, amount_paise, currency, payment_type,
      status, method, raw_verified_payload, verified_at, reviewed_by, reviewed_at, review_note
    ) VALUES (
      v_b.id, 'manual', v_ref, 'manual:' || gen_random_uuid()::TEXT, p_amount_paise, 'INR', v_type,
      'captured', p_method, jsonb_build_object('recorded_by_staff', true), now(), p_actor_user_id, now(),
      NULLIF(btrim(COALESCE(p_note, '')), '')
    )
    RETURNING id INTO v_payment_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'REFERENCE_USED: This reference was already recorded for another payment.';
  END;

  v_new_paid := v_b.amount_paid_paise + p_amount_paise;
  v_new_due := GREATEST(0, v_b.total_paise - v_new_paid);
  v_next := CASE WHEN v_new_due = 0 THEN 'confirmed' ELSE 'deposit_paid' END;

  UPDATE public.bookings
  SET amount_paid_paise = v_new_paid, amount_due_paise = v_new_due, status = v_next,
      hold_expires_at = NULL, updated_at = now()
  WHERE id = v_b.id;

  UPDATE public.seat_allocations
  SET allocation_status = 'confirmed', hold_expires_at = NULL, updated_at = now()
  WHERE booking_id = v_b.id AND allocation_status = 'held';

  PERFORM public.recalculate_departure_status(v_departure_id);

  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, reason, before_state, after_state)
  VALUES (p_actor_user_id, p_actor_role, 'payment_recorded_' || p_method, 'booking', v_b.id::TEXT,
    COALESCE(NULLIF(btrim(COALESCE(p_note, '')), ''), 'Offline payment recorded'),
    jsonb_build_object('status', v_b.status, 'amount_paid_paise', v_b.amount_paid_paise),
    jsonb_build_object('status', v_next, 'amount_paise', p_amount_paise, 'reference', v_ref, 'payment_id', v_payment_id));

  RETURN QUERY SELECT b.status, b.amount_paid_paise, b.amount_due_paise FROM public.bookings b WHERE b.id = v_b.id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_record_payment(UUID, INTEGER, TEXT, TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_payment(UUID, INTEGER, TEXT, TEXT, UUID, TEXT, TEXT) TO service_role;

-- 4. Staff record a refund they sent; optionally close the booking and free its seats
CREATE OR REPLACE FUNCTION public.admin_record_refund(
  p_booking_id UUID,
  p_amount_paise INTEGER,
  p_reference TEXT,
  p_actor_user_id UUID,
  p_actor_role TEXT,
  p_note TEXT,
  p_close_booking BOOLEAN
)
RETURNS TABLE (booking_status TEXT, amount_paid_paise INTEGER, amount_refunded_paise INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_departure_id UUID;
  v_b public.bookings%ROWTYPE;
  v_ref TEXT := btrim(COALESCE(p_reference, ''));
  v_note TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_refundable INTEGER;
  v_new_refunded INTEGER;
  v_next TEXT;
BEGIN
  IF p_actor_role NOT IN ('owner', 'ops') THEN
    RAISE EXCEPTION 'NOT_ALLOWED: Only owner or operations staff can record refunds.';
  END IF;
  IF p_amount_paise IS NULL OR p_amount_paise <= 0 THEN
    RAISE EXCEPTION 'BAD_AMOUNT: Enter the amount you refunded.';
  END IF;
  IF char_length(v_ref) < 3 OR char_length(v_ref) > 60 THEN
    RAISE EXCEPTION 'REFERENCE_REQUIRED: Enter the refund UTR / transaction ID (3–60 characters).';
  END IF;
  IF v_note IS NULL OR char_length(v_note) < 5 THEN
    RAISE EXCEPTION 'NOTE_REQUIRED: Write why (at least 5 characters), e.g. "Cancelled 10 days before — 80%% slab".';
  END IF;

  SELECT b.departure_id INTO v_departure_id FROM public.bookings b WHERE b.id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND: Booking not found.';
  END IF;
  PERFORM 1 FROM public.departures WHERE id = v_departure_id FOR UPDATE;
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;

  IF EXISTS (SELECT 1 FROM public.payments p WHERE p.booking_id = v_b.id AND p.status = 'submitted') THEN
    RAISE EXCEPTION 'ALREADY_WAITING: A UPI payment for this booking is waiting for your check. Confirm or reject it first.';
  END IF;

  v_refundable := v_b.amount_paid_paise - v_b.amount_refunded_paise;
  IF p_amount_paise > v_refundable THEN
    RAISE EXCEPTION 'REFUND_TOO_HIGH: Only ₹% has been paid and not yet refunded.', round(v_refundable / 100.0, 2);
  END IF;

  INSERT INTO public.refunds (booking_id, payment_id, amount_paise, reason, status, provider_refund_id, processed_by)
  VALUES (v_b.id, NULL, p_amount_paise, v_note, 'processed', v_ref, p_actor_user_id);

  v_new_refunded := v_b.amount_refunded_paise + p_amount_paise;
  v_next := v_b.status;
  IF COALESCE(p_close_booking, false) THEN
    v_next := CASE WHEN v_new_refunded >= v_b.amount_paid_paise THEN 'refunded' ELSE 'cancelled' END;
    UPDATE public.seat_allocations
    SET allocation_status = 'released', updated_at = now()
    WHERE booking_id = v_b.id AND allocation_status IN ('held', 'confirmed');
  END IF;

  UPDATE public.bookings
  SET amount_refunded_paise = v_new_refunded,
      status = v_next,
      hold_expires_at = CASE WHEN COALESCE(p_close_booking, false) THEN NULL ELSE hold_expires_at END,
      updated_at = now()
  WHERE id = v_b.id;

  PERFORM public.recalculate_departure_status(v_departure_id);

  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, reason, before_state, after_state)
  VALUES (p_actor_user_id, p_actor_role, 'refund_recorded', 'booking', v_b.id::TEXT, v_note,
    jsonb_build_object('status', v_b.status, 'amount_refunded_paise', v_b.amount_refunded_paise),
    jsonb_build_object('status', v_next, 'amount_paise', p_amount_paise, 'reference', v_ref));

  RETURN QUERY SELECT b.status, b.amount_paid_paise, b.amount_refunded_paise FROM public.bookings b WHERE b.id = v_b.id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_record_refund(UUID, INTEGER, TEXT, UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_refund(UUID, INTEGER, TEXT, UUID, TEXT, TEXT, BOOLEAN) TO service_role;

-- 5. Trip crew per departure (staff only; shared with booked travellers close to the trip)
ALTER TABLE public.departure_ops_notes
  ADD COLUMN IF NOT EXISTS driver_name TEXT NOT NULL DEFAULT '' CHECK (char_length(driver_name) <= 80),
  ADD COLUMN IF NOT EXISTS driver_phone TEXT NOT NULL DEFAULT '' CHECK (driver_phone = '' OR driver_phone ~ '^[6-9][0-9]{9}$'),
  ADD COLUMN IF NOT EXISTS vehicle_number TEXT NOT NULL DEFAULT '' CHECK (char_length(vehicle_number) <= 20),
  ADD COLUMN IF NOT EXISTS whatsapp_group_url TEXT NOT NULL DEFAULT '' CHECK (
    whatsapp_group_url = '' OR whatsapp_group_url ~ '^https://chat\.whatsapp\.com/[A-Za-z0-9]{10,40}$'
  ),
  ADD COLUMN IF NOT EXISTS reporting_note TEXT NOT NULL DEFAULT '' CHECK (char_length(reporting_note) <= 300);

-- 6. Enquiries from the website (private dates, custom trips, groups)
CREATE TABLE IF NOT EXISTS public.enquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('private_date', 'custom_trip', 'group', 'general')),
  full_name TEXT NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 120),
  phone TEXT NOT NULL CHECK (phone ~ '^[6-9][0-9]{9}$'),
  email TEXT NOT NULL DEFAULT '' CHECK (char_length(email) <= 160),
  trip_id UUID NULL REFERENCES public.trips(id) ON DELETE SET NULL,
  preferred_dates TEXT NOT NULL DEFAULT '' CHECK (char_length(preferred_dates) <= 120),
  group_size INTEGER NULL CHECK (group_size IS NULL OR group_size BETWEEN 1 AND 60),
  message TEXT NOT NULL DEFAULT '' CHECK (char_length(message) <= 1500),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'converted', 'closed')),
  staff_note TEXT NOT NULL DEFAULT '' CHECK (char_length(staff_note) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_enquiries_status_created ON public.enquiries (status, created_at DESC);

ALTER TABLE public.enquiries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "enquiries_staff_read" ON public.enquiries;
CREATE POLICY "enquiries_staff_read" ON public.enquiries FOR SELECT USING (public.is_staff());
DROP POLICY IF EXISTS "enquiries_ops_update" ON public.enquiries;
CREATE POLICY "enquiries_ops_update" ON public.enquiries
  FOR UPDATE USING (public.is_staff(ARRAY['owner', 'ops'])) WITH CHECK (public.is_staff(ARRAY['owner', 'ops']));
-- Inserts come only from the server (validated + rate-limited); no anon insert policy on purpose.
