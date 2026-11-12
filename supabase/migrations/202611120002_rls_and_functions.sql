-- ============================================================================
-- Sanchari • Micro Trips — Row Level Security, Trusted Functions & Atomic Booking
-- Migration: 202611120002_rls_and_functions.sql
-- ============================================================================

-- 1. Enable RLS on EVERY table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itinerary_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pickup_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departure_ops_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_travelers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_comfort_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seat_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 2. Trusted staff check helper (reads staff_roles; never trusts user_metadata)
CREATE OR REPLACE FUNCTION public.is_staff(required_roles TEXT[] DEFAULT ARRAY['owner', 'ops', 'support'])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff_roles sr
    WHERE sr.user_id = auth.uid()
      AND sr.role = ANY(required_roles)
  );
$$;

REVOKE ALL ON FUNCTION public.is_staff(TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_staff(TEXT[]) TO authenticated, service_role;

-- 3. Automatic profile creation on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Public-safe departure availability function (returns counts ONLY; zero PII or seat maps)
CREATE OR REPLACE FUNCTION public.get_departure_availability(p_trip_id UUID DEFAULT NULL)
RETURNS TABLE (
  departure_id UUID,
  trip_id UUID,
  departure_code TEXT,
  start_date DATE,
  end_date DATE,
  max_capacity INTEGER,
  min_occupancy INTEGER,
  departure_type TEXT,
  status TEXT,
  booking_cutoff_at TIMESTAMPTZ,
  preference_deadline_at TIMESTAMPTZ,
  price_override_paise INTEGER,
  seats_taken INTEGER,
  seats_remaining INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH counts AS (
    SELECT
      d.id,
      COALESCE(COUNT(sa.id) FILTER (
        WHERE sa.allocation_status IN ('confirmed', 'operator_blocked')
           OR (sa.allocation_status = 'held' AND (sa.hold_expires_at IS NULL OR sa.hold_expires_at > now()))
      ), 0)::INTEGER AS taken
    FROM public.departures d
    LEFT JOIN public.seat_allocations sa ON sa.departure_id = d.id
    GROUP BY d.id
  )
  SELECT
    d.id AS departure_id,
    d.trip_id,
    d.departure_code,
    d.start_date,
    d.end_date,
    d.max_capacity,
    d.min_occupancy,
    d.departure_type,
    -- Badge computed live from seats, so an expired hold never leaves a stale "sold out".
    CASE
      WHEN d.status IN ('cancelled', 'completed') THEN d.status
      WHEN GREATEST(0, d.max_capacity - c.taken) = 0 THEN 'sold_out'
      WHEN GREATEST(0, d.max_capacity - c.taken) <= 2 THEN 'last_seats'
      WHEN GREATEST(0, d.max_capacity - c.taken) <= 4 THEN 'filling_fast'
      ELSE 'open'
    END AS status,
    d.booking_cutoff_at,
    d.preference_deadline_at,
    d.price_override_paise,
    c.taken AS seats_taken,
    GREATEST(0, d.max_capacity - c.taken) AS seats_remaining
  FROM public.departures d
  JOIN counts c ON c.id = d.id
  JOIN public.trips t ON t.id = d.trip_id
  WHERE d.is_published = true
    AND t.is_published = true
    AND (p_trip_id IS NULL OR d.trip_id = p_trip_id)
  ORDER BY d.start_date ASC;
$$;

REVOKE ALL ON FUNCTION public.get_departure_availability(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_departure_availability(UUID) TO anon, authenticated, service_role;

-- 5. RLS Policies

-- profiles: users manage their own profile; staff can read for operations
CREATE POLICY "profiles_select_own_or_staff" ON public.profiles
  FOR SELECT USING (id = auth.uid() OR public.is_staff());
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- staff_roles: users can read only their own role row; only owners can manage staff roles
CREATE POLICY "staff_roles_select_own_or_owner" ON public.staff_roles
  FOR SELECT USING (user_id = auth.uid() OR public.is_staff(ARRAY['owner']));
CREATE POLICY "staff_roles_manage_owner_only" ON public.staff_roles
  FOR ALL USING (public.is_staff(ARRAY['owner'])) WITH CHECK (public.is_staff(ARRAY['owner']));

-- trips, itinerary_days, pickup_points, departures: public read when published; staff write
CREATE POLICY "trips_public_read_published" ON public.trips
  FOR SELECT USING (is_published = true OR public.is_staff());
CREATE POLICY "trips_staff_write" ON public.trips
  FOR ALL USING (public.is_staff(ARRAY['owner', 'ops'])) WITH CHECK (public.is_staff(ARRAY['owner', 'ops']));

CREATE POLICY "itinerary_public_read_published" ON public.itinerary_days
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND (t.is_published = true OR public.is_staff()))
  );
CREATE POLICY "itinerary_staff_write" ON public.itinerary_days
  FOR ALL USING (public.is_staff(ARRAY['owner', 'ops'])) WITH CHECK (public.is_staff(ARRAY['owner', 'ops']));

CREATE POLICY "pickups_public_read_published" ON public.pickup_points
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND (t.is_published = true OR public.is_staff()))
  );
CREATE POLICY "pickups_staff_write" ON public.pickup_points
  FOR ALL USING (public.is_staff(ARRAY['owner', 'ops'])) WITH CHECK (public.is_staff(ARRAY['owner', 'ops']));

CREATE POLICY "departures_public_read_published" ON public.departures
  FOR SELECT USING (is_published = true OR public.is_staff());
CREATE POLICY "departures_staff_write" ON public.departures
  FOR ALL USING (public.is_staff(ARRAY['owner', 'ops'])) WITH CHECK (public.is_staff(ARRAY['owner', 'ops']));

-- departure_ops_notes: strict staff only
CREATE POLICY "departure_ops_notes_staff_only" ON public.departure_ops_notes
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff(ARRAY['owner', 'ops']));

-- bookings: customer reads own; staff reads all; mutations via service_role RPC/API
CREATE POLICY "bookings_select_own_or_staff" ON public.bookings
  FOR SELECT USING (user_id = auth.uid() OR public.is_staff());
CREATE POLICY "bookings_staff_update" ON public.bookings
  FOR UPDATE USING (public.is_staff(ARRAY['owner', 'ops'])) WITH CHECK (public.is_staff(ARRAY['owner', 'ops']));

-- booking_travelers: customer reads own; staff reads all
CREATE POLICY "travelers_select_own_or_staff" ON public.booking_travelers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND (b.user_id = auth.uid() OR public.is_staff()))
  );

-- booking_comfort_preferences: strict privacy — own customer or owner/ops ONLY
CREATE POLICY "comfort_prefs_select_own_or_ops" ON public.booking_comfort_preferences
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.user_id = auth.uid())
    OR public.is_staff(ARRAY['owner', 'ops'])
  );
CREATE POLICY "comfort_prefs_update_ops_only" ON public.booking_comfort_preferences
  FOR UPDATE USING (public.is_staff(ARRAY['owner', 'ops'])) WITH CHECK (public.is_staff(ARRAY['owner', 'ops']));

-- seat_allocations: customer sees own allocations; staff sees all; anon NEVER reads raw allocations
CREATE POLICY "seat_alloc_select_own_or_staff" ON public.seat_allocations
  FOR SELECT USING (
    public.is_staff()
    OR EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.user_id = auth.uid())
  );
CREATE POLICY "seat_alloc_ops_write" ON public.seat_allocations
  FOR ALL USING (public.is_staff(ARRAY['owner', 'ops'])) WITH CHECK (public.is_staff(ARRAY['owner', 'ops']));

-- payments & refunds: customer reads own; staff reads/manages
CREATE POLICY "payments_select_own_or_staff" ON public.payments
  FOR SELECT USING (
    public.is_staff()
    OR EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.user_id = auth.uid())
  );
CREATE POLICY "refunds_select_own_or_staff" ON public.refunds
  FOR SELECT USING (
    public.is_staff()
    OR EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.user_id = auth.uid())
  );

-- waitlist_entries & consent_records: staff read; inserts go through server validation
CREATE POLICY "waitlist_staff_read_write" ON public.waitlist_entries
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff(ARRAY['owner', 'ops']));
CREATE POLICY "consent_staff_read" ON public.consent_records
  FOR SELECT USING (public.is_staff());

-- reviews: public reads ONLY verified + published authentic reviews
CREATE POLICY "reviews_public_read_verified" ON public.reviews
  FOR SELECT USING ((is_verified_authentic = true AND is_published = true) OR public.is_staff());
CREATE POLICY "reviews_staff_write" ON public.reviews
  FOR ALL USING (public.is_staff(ARRAY['owner', 'ops'])) WITH CHECK (public.is_staff(ARRAY['owner', 'ops']));

-- site_settings: public read safe storefront settings; owner/ops write
CREATE POLICY "site_settings_public_read" ON public.site_settings
  FOR SELECT USING (true);
CREATE POLICY "site_settings_staff_write" ON public.site_settings
  FOR ALL USING (public.is_staff(ARRAY['owner', 'ops'])) WITH CHECK (public.is_staff(ARRAY['owner', 'ops']));

-- audit_logs: staff read only; insert via server/RPC
CREATE POLICY "audit_logs_staff_read" ON public.audit_logs
  FOR SELECT USING (public.is_staff());

-- 6. Atomic Seat Hold & Booking Creation Function (Concurrency-Safe)
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
  p_policy_version TEXT
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

  v_chosen_seats := v_available_seats[1:p_seats_requested];
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

REVOKE ALL ON FUNCTION public.reserve_departure_seats(
  TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, UUID, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, TIMESTAMPTZ, INTEGER, JSONB, JSONB, TEXT, JSONB, TEXT, TEXT, BOOLEAN, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_departure_seats(
  TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, UUID, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, TIMESTAMPTZ, INTEGER, JSONB, JSONB, TEXT, JSONB, TEXT, TEXT, BOOLEAN, TEXT
) TO service_role;

-- 7. Recalculate departure status helper
CREATE OR REPLACE FUNCTION public.recalculate_departure_status(p_departure_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dep public.departures%ROWTYPE;
  v_active INTEGER;
  v_remaining INTEGER;
  v_next_status TEXT;
BEGIN
  SELECT * INTO v_dep FROM public.departures WHERE id = p_departure_id FOR UPDATE;
  IF NOT FOUND OR v_dep.status IN ('cancelled', 'completed') THEN
    RETURN;
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_active
  FROM public.seat_allocations
  WHERE departure_id = p_departure_id
    AND (
      allocation_status IN ('confirmed', 'operator_blocked')
      OR (allocation_status = 'held' AND (hold_expires_at IS NULL OR hold_expires_at > now()))
    );

  v_remaining := GREATEST(0, v_dep.max_capacity - v_active);

  v_next_status := CASE
    WHEN v_remaining = 0 THEN 'sold_out'
    WHEN v_remaining <= 2 THEN 'last_seats'
    WHEN v_remaining <= 4 THEN 'filling_fast'
    ELSE 'open'
  END;

  UPDATE public.departures
  SET status = v_next_status, updated_at = now()
  WHERE id = p_departure_id;
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_departure_status(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_departure_status(UUID) TO service_role;

-- 8. Idempotent server-verified payment confirmation
CREATE OR REPLACE FUNCTION public.confirm_booking_payment(
  p_booking_id UUID,
  p_provider TEXT,
  p_provider_order_id TEXT,
  p_provider_payment_id TEXT,
  p_idempotency_key TEXT,
  p_amount_paise INTEGER,
  p_payment_type TEXT,
  p_raw_payload JSONB
)
RETURNS TABLE (
  booking_status TEXT,
  already_processed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_new_paid INTEGER;
  v_new_due INTEGER;
  v_next_status TEXT;
BEGIN
  -- Lock booking row
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  -- Idempotency check on provider payment id or idempotency key
  IF EXISTS (
    SELECT 1 FROM public.payments
    WHERE (provider = p_provider AND provider_payment_id = p_provider_payment_id)
       OR (idempotency_key = p_idempotency_key AND status = 'captured')
  ) THEN
    RETURN QUERY SELECT v_booking.status, true;
    RETURN;
  END IF;

  IF v_booking.status IN ('cancelled', 'refunded', 'expired') THEN
    RAISE EXCEPTION 'Cannot confirm payment for % booking; manual refund/reallocation required', v_booking.status;
  END IF;

  IF v_booking.status = 'pending_payment'
     AND v_booking.hold_expires_at IS NOT NULL
     AND v_booking.hold_expires_at <= now() THEN
    RAISE EXCEPTION 'Booking hold has expired; manual refund/reallocation required';
  END IF;

  INSERT INTO public.payments (
    booking_id,
    provider,
    provider_order_id,
    provider_payment_id,
    idempotency_key,
    amount_paise,
    currency,
    payment_type,
    status,
    raw_verified_payload,
    verified_at
  ) VALUES (
    p_booking_id,
    p_provider,
    p_provider_order_id,
    p_provider_payment_id,
    p_idempotency_key,
    p_amount_paise,
    'INR',
    p_payment_type,
    'captured',
    p_raw_payload,
    now()
  )
  ON CONFLICT (idempotency_key) DO UPDATE
  SET status = 'captured',
      provider_payment_id = EXCLUDED.provider_payment_id,
      raw_verified_payload = EXCLUDED.raw_verified_payload,
      verified_at = now(),
      updated_at = now();

  v_new_paid := LEAST(v_booking.total_paise, v_booking.amount_paid_paise + p_amount_paise);
  v_new_due := GREATEST(0, v_booking.total_paise - v_new_paid);
  v_next_status := CASE WHEN v_new_due = 0 THEN 'confirmed' ELSE 'deposit_paid' END;

  UPDATE public.bookings
  SET amount_paid_paise = v_new_paid,
      amount_due_paise = v_new_due,
      status = v_next_status,
      hold_expires_at = NULL,
      updated_at = now()
  WHERE id = p_booking_id;

  UPDATE public.seat_allocations
  SET allocation_status = 'confirmed',
      hold_expires_at = NULL,
      updated_at = now()
  WHERE booking_id = p_booking_id
    AND allocation_status = 'held';

  PERFORM public.recalculate_departure_status(v_booking.departure_id);

  INSERT INTO public.audit_logs (action, entity_type, entity_id, reason, after_state)
  VALUES (
    'payment_verified',
    'booking',
    p_booking_id::TEXT,
    'Server-verified gateway payment captured',
    jsonb_build_object('provider', p_provider, 'payment_id', p_provider_payment_id, 'amount_paise', p_amount_paise, 'status', v_next_status)
  );

  RETURN QUERY SELECT v_next_status, false;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_booking_payment(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_booking_payment(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB) TO service_role;

