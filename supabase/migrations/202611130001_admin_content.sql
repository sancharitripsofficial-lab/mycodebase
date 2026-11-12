-- ============================================================================
-- Sanchari • Micro Trips — Admin content management
-- Migration: 202611130001_admin_content.sql
--
-- * trips.video_links: reel / YouTube links shown on the trip page.
-- * Public "media" storage bucket for photos and short videos uploaded from Admin.
-- * Safe departure functions (save / cancel / reopen / complete / delete) that protect
--   seats and money, plus guarded deletes for trips and pickup points.
-- Simple content (trip text, itinerary days, pickup points, site settings, reviews) is
-- written by the server with the service role after validation; every write is audit-logged.
-- Lock order: departures row -> bookings rows (same as the booking functions).
-- Rollback: drop the admin_* functions, the video_links column and the media bucket.
-- ============================================================================

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS video_links JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trips_slug_format') THEN
    ALTER TABLE public.trips
      ADD CONSTRAINT trips_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 80);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'departures_code_format') THEN
    ALTER TABLE public.departures
      ADD CONSTRAINT departures_code_format CHECK (departure_code ~ '^[A-Z0-9][A-Z0-9-]{2,31}$');
  END IF;
END $$;

-- Media bucket (only where Supabase Storage exists; local test databases skip it).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'media', 'media', true, 20971520,
      ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'video/webm']
    )
    ON CONFLICT (id) DO UPDATE
      SET public = true,
          file_size_limit = EXCLUDED.file_size_limit,
          allowed_mime_types = EXCLUDED.allowed_mime_types;
  END IF;
END $$;

-- Shared: count seats in use on a departure (after expiring unpaid holds whose time ran out).
CREATE OR REPLACE FUNCTION public.admin_seats_in_use(p_departure_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_count INTEGER;
BEGIN
  PERFORM public.release_expired_holds(p_departure_id);
  SELECT COUNT(*)::INTEGER INTO v_count
  FROM public.seat_allocations
  WHERE departure_id = p_departure_id
    AND allocation_status IN ('held', 'confirmed', 'operator_blocked');
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_seats_in_use(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_seats_in_use(UUID) TO service_role;

-- Create or edit a departure date.
CREATE OR REPLACE FUNCTION public.admin_save_departure(
  p_id UUID,
  p_trip_id UUID,
  p_departure_code TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_max_capacity INTEGER,
  p_min_occupancy INTEGER,
  p_departure_type TEXT,
  p_booking_cutoff_at TIMESTAMPTZ,
  p_preference_deadline_at TIMESTAMPTZ,
  p_price_override_paise INTEGER,
  p_is_published BOOLEAN,
  p_actor_user_id UUID,
  p_actor_role TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_dep public.departures%ROWTYPE;
  v_id UUID;
  v_in_use INTEGER;
  v_bookings INTEGER;
  v_alloc RECORD;
  v_free INTEGER;
  v_code TEXT := upper(btrim(COALESCE(p_departure_code, '')));
BEGIN
  IF p_actor_role NOT IN ('owner', 'ops') THEN
    RAISE EXCEPTION 'NOT_ALLOWED: Only owner or operations staff can change departures.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.trips WHERE id = p_trip_id) THEN
    RAISE EXCEPTION 'TRIP_NOT_FOUND: Choose the trip this date belongs to.';
  END IF;
  IF v_code !~ '^[A-Z0-9][A-Z0-9-]{2,31}$' THEN
    RAISE EXCEPTION 'BAD_CODE: Departure code: 3–32 capital letters, numbers or dashes (e.g. SAN-CKM-DEC04).';
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
    RAISE EXCEPTION 'BAD_DATES: The return date must be on or after the start date.';
  END IF;
  IF p_max_capacity IS NULL OR p_max_capacity < 1 OR p_max_capacity > 6 THEN
    RAISE EXCEPTION 'BAD_CAPACITY: Seats per car must be between 1 and 6.';
  END IF;
  IF p_min_occupancy IS NULL OR p_min_occupancy < 1 OR p_min_occupancy > p_max_capacity THEN
    RAISE EXCEPTION 'BAD_MIN: Minimum travellers must be between 1 and the seats per car.';
  END IF;
  IF p_departure_type NOT IN ('open_batch', 'women_only', 'private_charter') THEN
    RAISE EXCEPTION 'BAD_TYPE: Unknown departure type.';
  END IF;
  IF p_booking_cutoff_at IS NULL OR p_booking_cutoff_at > (p_start_date::timestamp AT TIME ZONE 'Asia/Kolkata') THEN
    RAISE EXCEPTION 'BAD_CUTOFF: Bookings must close before the trip starts (on or before the start date, 00:00 IST).';
  END IF;
  IF p_preference_deadline_at IS NULL OR p_preference_deadline_at > p_booking_cutoff_at THEN
    RAISE EXCEPTION 'BAD_PREF_DEADLINE: The comfort-request deadline must be on or before the booking cutoff.';
  END IF;
  IF p_price_override_paise IS NOT NULL AND (p_price_override_paise < 0 OR p_price_override_paise > 50000000) THEN
    RAISE EXCEPTION 'BAD_PRICE: Special price must be between ₹0 and ₹5,00,000.';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.departures (
      trip_id, departure_code, start_date, end_date, max_capacity, min_occupancy, departure_type,
      status, booking_cutoff_at, preference_deadline_at, price_override_paise, is_published
    ) VALUES (
      p_trip_id, v_code, p_start_date, p_end_date, p_max_capacity, p_min_occupancy, p_departure_type,
      'open', p_booking_cutoff_at, p_preference_deadline_at, p_price_override_paise, COALESCE(p_is_published, true)
    )
    RETURNING id INTO v_id;

    INSERT INTO public.audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, reason, after_state)
    VALUES (p_actor_user_id, p_actor_role, 'departure_created', 'departure', v_id::TEXT, 'New departure date',
      jsonb_build_object('code', v_code, 'start', p_start_date, 'end', p_end_date, 'seats', p_max_capacity));
    RETURN v_id;
  END IF;

  SELECT * INTO v_dep FROM public.departures WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEPARTURE_NOT_FOUND: Departure not found.';
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_bookings FROM public.bookings WHERE departure_id = p_id;
  IF v_bookings > 0 AND p_trip_id <> v_dep.trip_id THEN
    RAISE EXCEPTION 'HAS_BOOKINGS: This date already has bookings, so it cannot move to another trip.';
  END IF;

  v_in_use := public.admin_seats_in_use(p_id);
  IF p_max_capacity < v_in_use THEN
    RAISE EXCEPTION 'CAPACITY_BELOW_TAKEN: % seats are already taken or held on this date, so seats per car cannot go below %.', v_in_use, v_in_use;
  END IF;

  -- Seat numbers carry no customer meaning (rows are assigned before departure), so compact any
  -- seat in use that sits above the new capacity into a free lower number.
  FOR v_alloc IN
    SELECT id FROM public.seat_allocations
    WHERE departure_id = p_id
      AND allocation_status IN ('held', 'confirmed', 'operator_blocked')
      AND seat_number > p_max_capacity
    ORDER BY seat_number
  LOOP
    SELECT s INTO v_free
    FROM generate_series(1, p_max_capacity) AS s
    WHERE NOT EXISTS (
      SELECT 1 FROM public.seat_allocations sa
      WHERE sa.departure_id = p_id AND sa.seat_number = s
        AND sa.allocation_status IN ('held', 'confirmed', 'operator_blocked')
    )
    ORDER BY s
    LIMIT 1;
    UPDATE public.seat_allocations SET seat_number = v_free, updated_at = now() WHERE id = v_alloc.id;
  END LOOP;

  UPDATE public.departures
  SET trip_id = p_trip_id,
      departure_code = v_code,
      start_date = p_start_date,
      end_date = p_end_date,
      max_capacity = p_max_capacity,
      min_occupancy = p_min_occupancy,
      departure_type = p_departure_type,
      booking_cutoff_at = p_booking_cutoff_at,
      preference_deadline_at = p_preference_deadline_at,
      price_override_paise = p_price_override_paise,
      is_published = COALESCE(p_is_published, true),
      updated_at = now()
  WHERE id = p_id;

  PERFORM public.recalculate_departure_status(p_id);

  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, reason, before_state, after_state)
  VALUES (p_actor_user_id, p_actor_role, 'departure_updated', 'departure', p_id::TEXT, 'Departure edited',
    jsonb_build_object('code', v_dep.departure_code, 'start', v_dep.start_date, 'seats', v_dep.max_capacity,
      'price_override_paise', v_dep.price_override_paise, 'published', v_dep.is_published),
    jsonb_build_object('code', v_code, 'start', p_start_date, 'seats', p_max_capacity,
      'price_override_paise', p_price_override_paise, 'published', p_is_published));
  RETURN p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_save_departure(UUID, UUID, TEXT, DATE, DATE, INTEGER, INTEGER, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, BOOLEAN, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_departure(UUID, UUID, TEXT, DATE, DATE, INTEGER, INTEGER, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, BOOLEAN, UUID, TEXT) TO service_role;

-- Cancel, reopen or mark a departure completed.
CREATE OR REPLACE FUNCTION public.admin_set_departure_status(
  p_id UUID,
  p_status TEXT,
  p_actor_user_id UUID,
  p_actor_role TEXT,
  p_reason TEXT
)
RETURNS TABLE (status TEXT, released_unpaid_holds INTEGER, paid_bookings_to_handle INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_dep public.departures%ROWTYPE;
  v_released INTEGER := 0;
  v_paid INTEGER := 0;
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  IF p_actor_role NOT IN ('owner', 'ops') THEN
    RAISE EXCEPTION 'NOT_ALLOWED: Only owner or operations staff can change departures.';
  END IF;
  IF p_status NOT IN ('cancelled', 'completed', 'open') THEN
    RAISE EXCEPTION 'BAD_STATUS: Choose cancel, reopen or completed.';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 5 THEN
    RAISE EXCEPTION 'NOTE_REQUIRED: Write a short reason (at least 5 characters).';
  END IF;

  SELECT * INTO v_dep FROM public.departures WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEPARTURE_NOT_FOUND: Departure not found.';
  END IF;

  IF p_status = 'cancelled' THEN
    -- Unpaid holds with no payment waiting are simply ended; their seats are freed.
    WITH ended AS (
      UPDATE public.bookings b
      SET status = 'cancelled', hold_expires_at = NULL, updated_at = now()
      WHERE b.departure_id = p_id
        AND b.status = 'pending_payment'
        AND b.amount_paid_paise = 0
        AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.booking_id = b.id AND p.status = 'submitted')
      RETURNING b.id
    )
    SELECT COUNT(*)::INTEGER INTO v_released FROM ended;

    UPDATE public.seat_allocations sa
    SET allocation_status = 'released', updated_at = now()
    WHERE sa.departure_id = p_id
      AND sa.allocation_status = 'held'
      AND sa.booking_id IN (SELECT id FROM public.bookings WHERE departure_id = p_id AND status = 'cancelled');

    SELECT COUNT(*)::INTEGER INTO v_paid
    FROM public.bookings b
    WHERE b.departure_id = p_id
      AND (b.amount_paid_paise > 0 OR EXISTS (SELECT 1 FROM public.payments p WHERE p.booking_id = b.id AND p.status = 'submitted'))
      AND b.status NOT IN ('cancelled', 'refunded');

    UPDATE public.departures SET status = 'cancelled', updated_at = now() WHERE id = p_id;
  ELSIF p_status = 'completed' THEN
    UPDATE public.departures SET status = 'completed', updated_at = now() WHERE id = p_id;
  ELSE
    UPDATE public.departures SET status = 'open', updated_at = now() WHERE id = p_id;
    PERFORM public.recalculate_departure_status(p_id);
  END IF;

  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, reason, before_state, after_state)
  VALUES (p_actor_user_id, p_actor_role, 'departure_' || p_status, 'departure', p_id::TEXT, v_reason,
    jsonb_build_object('status', v_dep.status),
    jsonb_build_object('status', p_status, 'released_unpaid_holds', v_released, 'paid_bookings_to_handle', v_paid));

  RETURN QUERY SELECT d.status, v_released, v_paid FROM public.departures d WHERE d.id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_departure_status(UUID, TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_departure_status(UUID, TEXT, UUID, TEXT, TEXT) TO service_role;

-- Delete a departure that never had a booking (otherwise cancel it).
CREATE OR REPLACE FUNCTION public.admin_delete_departure(p_id UUID, p_actor_user_id UUID, p_actor_role TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_dep public.departures%ROWTYPE;
BEGIN
  IF p_actor_role NOT IN ('owner', 'ops') THEN
    RAISE EXCEPTION 'NOT_ALLOWED: Only owner or operations staff can delete departures.';
  END IF;
  SELECT * INTO v_dep FROM public.departures WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEPARTURE_NOT_FOUND: Departure not found.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bookings WHERE departure_id = p_id) THEN
    RAISE EXCEPTION 'HAS_BOOKINGS: This date has bookings, so it can only be cancelled, not deleted.';
  END IF;
  DELETE FROM public.departures WHERE id = p_id;
  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, reason, before_state)
  VALUES (p_actor_user_id, p_actor_role, 'departure_deleted', 'departure', p_id::TEXT, 'Deleted (no bookings)',
    jsonb_build_object('code', v_dep.departure_code, 'start', v_dep.start_date));
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_departure(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_departure(UUID, UUID, TEXT) TO service_role;

-- Delete a trip only when none of its dates ever had a booking (otherwise unpublish it).
CREATE OR REPLACE FUNCTION public.admin_delete_trip(p_id UUID, p_actor_user_id UUID, p_actor_role TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_trip public.trips%ROWTYPE;
BEGIN
  IF p_actor_role NOT IN ('owner', 'ops') THEN
    RAISE EXCEPTION 'NOT_ALLOWED: Only owner or operations staff can delete trips.';
  END IF;
  SELECT * INTO v_trip FROM public.trips WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TRIP_NOT_FOUND: Trip not found.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.bookings b JOIN public.departures d ON d.id = b.departure_id WHERE d.trip_id = p_id
  ) THEN
    RAISE EXCEPTION 'HAS_BOOKINGS: This trip has bookings, so it can only be hidden (unpublished), not deleted.';
  END IF;
  DELETE FROM public.trips WHERE id = p_id;
  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, reason, before_state)
  VALUES (p_actor_user_id, p_actor_role, 'trip_deleted', 'trip', p_id::TEXT, 'Deleted (no bookings)',
    jsonb_build_object('slug', v_trip.slug, 'title', v_trip.title));
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_trip(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_trip(UUID, UUID, TEXT) TO service_role;

-- Delete a pickup point only when no live booking uses it.
CREATE OR REPLACE FUNCTION public.admin_delete_pickup(p_id UUID, p_actor_user_id UUID, p_actor_role TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_pick public.pickup_points%ROWTYPE;
BEGIN
  IF p_actor_role NOT IN ('owner', 'ops') THEN
    RAISE EXCEPTION 'NOT_ALLOWED: Only owner or operations staff can delete pickup points.';
  END IF;
  SELECT * INTO v_pick FROM public.pickup_points WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PICKUP_NOT_FOUND: Pickup point not found.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.bookings
    WHERE pickup_point_id = p_id AND status NOT IN ('cancelled', 'expired', 'refunded')
  ) THEN
    RAISE EXCEPTION 'IN_USE: Travellers are booked from this pickup point. Edit it instead, or move them first.';
  END IF;
  DELETE FROM public.pickup_points WHERE id = p_id;
  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, reason, before_state)
  VALUES (p_actor_user_id, p_actor_role, 'pickup_deleted', 'pickup_point', p_id::TEXT, 'Deleted (unused)',
    jsonb_build_object('name', v_pick.name, 'trip_id', v_pick.trip_id));
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_pickup(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_pickup(UUID, UUID, TEXT) TO service_role;

-- Replace a trip's whole day-by-day itinerary in one step (all days saved, or none).
CREATE OR REPLACE FUNCTION public.admin_replace_itinerary(
  p_trip_id UUID,
  p_days JSONB,
  p_actor_user_id UUID,
  p_actor_role TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_count INTEGER;
  v_day JSONB;
  v_n INTEGER := 0;
BEGIN
  IF p_actor_role NOT IN ('owner', 'ops') THEN
    RAISE EXCEPTION 'NOT_ALLOWED: Only owner or operations staff can change itineraries.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.trips WHERE id = p_trip_id) THEN
    RAISE EXCEPTION 'TRIP_NOT_FOUND: Trip not found.';
  END IF;
  IF jsonb_typeof(p_days) <> 'array' THEN
    RAISE EXCEPTION 'BAD_ITINERARY: Itinerary must be a list of days.';
  END IF;
  v_count := jsonb_array_length(p_days);
  IF v_count > 14 THEN
    RAISE EXCEPTION 'BAD_ITINERARY: At most 14 days.';
  END IF;

  DELETE FROM public.itinerary_days WHERE trip_id = p_trip_id;
  FOR v_day IN SELECT * FROM jsonb_array_elements(p_days)
  LOOP
    v_n := v_n + 1;
    IF char_length(btrim(COALESCE(v_day ->> 'title', ''))) < 2 THEN
      RAISE EXCEPTION 'BAD_ITINERARY: Day % needs a title.', v_n;
    END IF;
    INSERT INTO public.itinerary_days (trip_id, day_number, title, description, drive_time_estimate, travel_buffer_notes, meals_included)
    VALUES (
      p_trip_id, v_n,
      btrim(v_day ->> 'title'),
      COALESCE(v_day ->> 'description', ''),
      COALESCE(v_day ->> 'driveTimeEstimate', ''),
      COALESCE(v_day ->> 'travelBufferNotes', ''),
      COALESCE(v_day ->> 'mealsIncluded', '')
    );
  END LOOP;

  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, reason, after_state)
  VALUES (p_actor_user_id, p_actor_role, 'itinerary_replaced', 'trip', p_trip_id::TEXT, 'Itinerary saved',
    jsonb_build_object('days', v_n));
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_replace_itinerary(UUID, JSONB, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_replace_itinerary(UUID, JSONB, UUID, TEXT) TO service_role;
