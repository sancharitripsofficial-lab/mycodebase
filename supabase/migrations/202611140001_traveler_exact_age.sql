-- Exact age per traveller (14 Nov 2026, owner request): the booking form asks for the age as a
-- number — adults 18-59, seniors 60 and over. Optional in the database, so older bookings and
-- pages opened before this release (no age sent) still work; the form itself requires it.

ALTER TABLE public.booking_travelers
  ADD COLUMN IF NOT EXISTS age_years SMALLINT NULL;

ALTER TABLE public.booking_travelers
  DROP CONSTRAINT IF EXISTS booking_travelers_age_years_check;

ALTER TABLE public.booking_travelers
  ADD CONSTRAINT booking_travelers_age_years_check CHECK (
    age_years IS NULL
    OR (age_group = 'adult' AND age_years BETWEEN 18 AND 59)
    OR (age_group = 'senior' AND age_years BETWEEN 60 AND 110)
  );

-- Same seat-hold function as 202611130002_owner_operations.sql, now also saving age_years.
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
      room_preference,
      age_years
    ) VALUES (
      v_booking_id,
      COALESCE(v_traveler ->> 'fullName', p_customer_name),
      COALESCE(v_traveler ->> 'ageGroup', 'adult'),
      COALESCE(v_traveler ->> 'emergencyContact', p_customer_phone),
      NULLIF(v_traveler ->> 'dietaryNotes', ''),
      COALESCE(v_traveler ->> 'seatRowRequest', 'no_preference'),
      COALESCE(v_traveler ->> 'roomPreference', 'shared_same_gender'),
      -- Exact age when the traveller typed one (the CHECK below keeps it inside their age group).
      CASE WHEN (v_traveler ->> 'ageYears') ~ '^[0-9]{1,3}$' THEN (v_traveler ->> 'ageYears')::SMALLINT END
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
