-- ============================================================================
-- Sanchari • Micro Trips — Coupons and the creator (influencer) programme
-- Migration: 202611130004_creator_coupons.sql
--
-- 1. coupons: public codes (e.g. DIWALI10) and personal creator codes. Percent off (with an
--    optional cap), flat ₹ off, or free seats. Dates, trip limit, minimum order, total uses
--    and uses per customer are enforced here, under a row lock, inside the same transaction
--    that holds the seats — two people can never both take the last use.
-- 2. influencer_tiers: follower ranges the owner sets (no overlaps) → the reward a creator
--    in that range gets.
-- 3. influencer_applications: creators apply from the website; staff check the profile,
--    enter the real follower count and approve → a personal one-time code is issued for
--    the matching range, usable only with the creator's own email or phone.
-- 4. coupon_redemptions: one row per booking that used a code; a trigger releases it when
--    the booking expires / is cancelled / refunded (the code becomes usable again) and marks
--    it used when the booking is paid. A booking whose total becomes ₹0 is confirmed at once.
-- Lock order: coupons -> departures -> bookings (reserve_departure_seats keeps its own order).
-- Rollback: drop the functions, trigger and the four tables.
-- ============================================================================

-- 1. Coupons ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9-]{3,23}$'),
  kind TEXT NOT NULL DEFAULT 'public' CHECK (kind IN ('public', 'creator')),
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'flat', 'free_seats')),
  discount_value INTEGER NOT NULL CHECK (discount_value > 0),
  max_discount_paise INTEGER NULL CHECK (max_discount_paise IS NULL OR max_discount_paise > 0),
  min_order_paise INTEGER NOT NULL DEFAULT 0 CHECK (min_order_paise >= 0),
  max_redemptions INTEGER NULL CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  per_customer_limit INTEGER NOT NULL DEFAULT 1 CHECK (per_customer_limit BETWEEN 1 AND 10),
  valid_from TIMESTAMPTZ NULL,
  valid_until TIMESTAMPTZ NULL,
  trip_id UUID NULL REFERENCES public.trips(id) ON DELETE SET NULL,
  locked_email TEXT NULL CHECK (locked_email IS NULL OR locked_email = lower(locked_email)),
  locked_phone TEXT NULL CHECK (locked_phone IS NULL OR locked_phone ~ '^[6-9][0-9]{9}$'),
  is_active BOOLEAN NOT NULL DEFAULT true,
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 300),
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT coupons_percent_range CHECK (discount_type <> 'percent' OR discount_value BETWEEN 1 AND 100),
  CONSTRAINT coupons_free_seats_range CHECK (discount_type <> 'free_seats' OR discount_value BETWEEN 1 AND 6),
  CONSTRAINT coupons_dates_order CHECK (valid_from IS NULL OR valid_until IS NULL OR valid_until > valid_from),
  CONSTRAINT coupons_creator_locked CHECK (kind <> 'creator' OR locked_email IS NOT NULL OR locked_phone IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_code ON public.coupons (code);

-- 2. Follower ranges ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.influencer_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL CHECK (char_length(btrim(label)) BETWEEN 2 AND 40),
  min_followers INTEGER NOT NULL CHECK (min_followers >= 0),
  max_followers INTEGER NULL,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'flat', 'free_seats')),
  discount_value INTEGER NOT NULL CHECK (discount_value > 0),
  max_discount_paise INTEGER NULL CHECK (max_discount_paise IS NULL OR max_discount_paise > 0),
  valid_days INTEGER NOT NULL DEFAULT 90 CHECK (valid_days BETWEEN 1 AND 365),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tiers_range_order CHECK (max_followers IS NULL OR max_followers >= min_followers),
  CONSTRAINT tiers_percent_range CHECK (discount_type <> 'percent' OR discount_value BETWEEN 1 AND 100),
  CONSTRAINT tiers_free_seats_range CHECK (discount_type <> 'free_seats' OR discount_value BETWEEN 1 AND 6)
);

CREATE OR REPLACE FUNCTION public.influencer_tiers_no_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_clash TEXT;
BEGIN
  IF NOT NEW.is_active THEN
    RETURN NEW;
  END IF;
  SELECT t.label INTO v_clash
  FROM public.influencer_tiers t
  WHERE t.is_active
    AND t.id <> NEW.id
    AND t.min_followers <= COALESCE(NEW.max_followers, 2147483647)
    AND NEW.min_followers <= COALESCE(t.max_followers, 2147483647)
  LIMIT 1;
  IF v_clash IS NOT NULL THEN
    RAISE EXCEPTION 'TIER_OVERLAP: This follower range overlaps "%". Ranges must not overlap.', v_clash;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_influencer_tiers_no_overlap ON public.influencer_tiers;
CREATE TRIGGER trg_influencer_tiers_no_overlap
  BEFORE INSERT OR UPDATE ON public.influencer_tiers
  FOR EACH ROW EXECUTE FUNCTION public.influencer_tiers_no_overlap();

-- 3. Creator applications -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.influencer_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL CHECK (char_length(btrim(full_name)) BETWEEN 2 AND 120),
  phone TEXT NOT NULL CHECK (phone ~ '^[6-9][0-9]{9}$'),
  email TEXT NOT NULL CHECK (email = lower(email) AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' AND char_length(email) <= 160),
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'youtube', 'facebook', 'x', 'other')),
  profile_url TEXT NOT NULL CHECK (profile_url ~ '^https://[^[:space:]<>"]{4,}$' AND char_length(profile_url) <= 300),
  followers_claimed INTEGER NOT NULL CHECK (followers_claimed BETWEEN 0 AND 500000000),
  message TEXT NOT NULL DEFAULT '' CHECK (char_length(message) <= 1500),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  followers_verified INTEGER NULL CHECK (followers_verified IS NULL OR followers_verified BETWEEN 0 AND 500000000),
  tier_id UUID NULL REFERENCES public.influencer_tiers(id) ON DELETE SET NULL,
  coupon_id UUID NULL REFERENCES public.coupons(id) ON DELETE SET NULL,
  staff_note TEXT NOT NULL DEFAULT '' CHECK (char_length(staff_note) <= 500),
  reviewed_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_influencer_apps_status ON public.influencer_applications (status, created_at DESC);

-- 4. Redemptions --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE RESTRICT,
  booking_id UUID NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  discount_paise INTEGER NOT NULL CHECK (discount_paise >= 0),
  status TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'used', 'released')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon ON public.coupon_redemptions (coupon_id, status);

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS coupon_code TEXT NULL,
  ADD COLUMN IF NOT EXISTS coupon_discount_paise INTEGER NOT NULL DEFAULT 0 CHECK (coupon_discount_paise >= 0);

-- RLS: staff read; every write goes through the server (service role) and the functions below.
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.influencer_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.influencer_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "coupons_staff_read" ON public.coupons;
CREATE POLICY "coupons_staff_read" ON public.coupons FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS "tiers_staff_read" ON public.influencer_tiers;
CREATE POLICY "tiers_staff_read" ON public.influencer_tiers FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS "influencer_apps_staff_read" ON public.influencer_applications;
CREATE POLICY "influencer_apps_staff_read" ON public.influencer_applications FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS "redemptions_staff_read" ON public.coupon_redemptions;
CREATE POLICY "redemptions_staff_read" ON public.coupon_redemptions FOR SELECT TO authenticated USING (public.is_staff());
REVOKE ALL ON public.coupons, public.influencer_tiers, public.influencer_applications, public.coupon_redemptions FROM anon;

-- 5. Check a code against a booking (shared by the price preview and the seat hold) --------
CREATE OR REPLACE FUNCTION public.coupon_check(
  p_code TEXT,
  p_trip_id UUID,
  p_seats INTEGER,
  p_unit_price_paise INTEGER,
  p_base_paise INTEGER,
  p_customer_email TEXT,
  p_customer_phone TEXT,
  p_lock BOOLEAN DEFAULT false
)
RETURNS TABLE (coupon_id UUID, code TEXT, discount_paise INTEGER, summary TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_c public.coupons%ROWTYPE;
  v_code TEXT := upper(btrim(COALESCE(p_code, '')));
  v_email TEXT := lower(btrim(COALESCE(p_customer_email, '')));
  v_phone TEXT := right(regexp_replace(COALESCE(p_customer_phone, ''), '[^0-9]', '', 'g'), 10);
  v_used INTEGER;
  v_mine INTEGER;
  v_discount INTEGER;
  v_summary TEXT;
BEGIN
  IF v_code = '' THEN
    RAISE EXCEPTION 'COUPON_UNKNOWN: Enter a coupon code.';
  END IF;
  IF p_lock THEN
    SELECT * INTO v_c FROM public.coupons c WHERE c.code = v_code FOR UPDATE;
  ELSE
    SELECT * INTO v_c FROM public.coupons c WHERE c.code = v_code;
  END IF;
  IF NOT FOUND OR NOT v_c.is_active THEN
    RAISE EXCEPTION 'COUPON_UNKNOWN: That coupon code is not valid.';
  END IF;
  IF v_c.valid_from IS NOT NULL AND v_c.valid_from > now() THEN
    RAISE EXCEPTION 'COUPON_NOT_STARTED: This coupon starts on %.', to_char(v_c.valid_from AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY');
  END IF;
  IF v_c.valid_until IS NOT NULL AND v_c.valid_until <= now() THEN
    RAISE EXCEPTION 'COUPON_EXPIRED: This coupon has expired.';
  END IF;
  IF v_c.trip_id IS NOT NULL AND v_c.trip_id IS DISTINCT FROM p_trip_id THEN
    RAISE EXCEPTION 'COUPON_OTHER_TRIP: This coupon is for a different trip.';
  END IF;
  IF (v_c.locked_email IS NOT NULL OR v_c.locked_phone IS NOT NULL)
     AND NOT (COALESCE(v_c.locked_email = v_email, false) OR COALESCE(v_c.locked_phone = v_phone, false)) THEN
    RAISE EXCEPTION 'COUPON_PERSONAL: This is a personal coupon. Use the email or phone it was issued to.';
  END IF;
  IF p_base_paise < v_c.min_order_paise THEN
    RAISE EXCEPTION 'COUPON_MIN_ORDER: This coupon needs a booking of at least ₹%.', round(v_c.min_order_paise / 100.0);
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_used FROM public.coupon_redemptions r WHERE r.coupon_id = v_c.id AND r.status IN ('held', 'used');
  IF v_c.max_redemptions IS NOT NULL AND v_used >= v_c.max_redemptions THEN
    RAISE EXCEPTION 'COUPON_USED_UP: This coupon has been fully used.';
  END IF;
  SELECT COUNT(*)::INTEGER INTO v_mine FROM public.coupon_redemptions r
  WHERE r.coupon_id = v_c.id AND r.status IN ('held', 'used')
    AND (r.customer_email = v_email OR (v_phone <> '' AND r.customer_phone = v_phone));
  IF v_mine >= v_c.per_customer_limit THEN
    RAISE EXCEPTION 'COUPON_ALREADY_USED: You have already used this coupon.';
  END IF;

  IF v_c.discount_type = 'percent' THEN
    v_discount := floor(p_base_paise::NUMERIC * v_c.discount_value / 100);
    v_summary := v_c.discount_value || '% off';
  ELSIF v_c.discount_type = 'flat' THEN
    v_discount := v_c.discount_value;
    v_summary := '₹' || round(v_c.discount_value / 100.0) || ' off';
  ELSE
    v_discount := LEAST(v_c.discount_value, p_seats) * p_unit_price_paise;
    v_summary := LEAST(v_c.discount_value, p_seats) || ' free seat' || CASE WHEN LEAST(v_c.discount_value, p_seats) = 1 THEN '' ELSE 's' END;
  END IF;
  IF v_c.max_discount_paise IS NOT NULL THEN
    v_discount := LEAST(v_discount, v_c.max_discount_paise);
  END IF;
  v_discount := GREATEST(0, LEAST(v_discount, p_base_paise));

  RETURN QUERY SELECT v_c.id, v_c.code, v_discount, v_summary;
END;
$$;

-- 6. Hold seats with a coupon: check + hold + redeem in ONE transaction ------------------
CREATE OR REPLACE FUNCTION public.reserve_departure_seats_with_coupon(
  p_coupon_code TEXT,
  p_coupon_discount_paise INTEGER,
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
  hold_expires_at TIMESTAMPTZ,
  booking_status TEXT,
  coupon_discount_paise INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_trip_id UUID;
  v_check RECORD;
  v_hold RECORD;
  v_base INTEGER;
  v_phone TEXT := right(regexp_replace(COALESCE(p_customer_phone, ''), '[^0-9]', '', 'g'), 10);
  v_status TEXT := 'pending_payment';
BEGIN
  SELECT d.trip_id INTO v_trip_id FROM public.departures d WHERE d.id = p_departure_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Departure not found';
  END IF;
  IF p_coupon_discount_paise IS NULL OR p_coupon_discount_paise < 0 OR p_coupon_discount_paise > p_discount_paise THEN
    RAISE EXCEPTION 'COUPON_CHANGED: The coupon amount changed. Please apply the coupon again.';
  END IF;

  -- Base the coupon sees = price after any other discount (e.g. the private-car price).
  v_base := p_subtotal_paise - (p_discount_paise - p_coupon_discount_paise);
  SELECT * INTO v_check
  FROM public.coupon_check(p_coupon_code, v_trip_id, p_seats_requested, p_unit_price_paise, v_base,
                           p_customer_email, p_customer_phone, true);
  IF v_check.discount_paise <> p_coupon_discount_paise THEN
    RAISE EXCEPTION 'COUPON_CHANGED: The coupon amount changed. Please apply the coupon again.';
  END IF;

  SELECT * INTO v_hold
  FROM public.reserve_departure_seats(
    p_booking_reference, p_departure_id, p_user_id, p_customer_name, p_customer_email, p_customer_phone,
    p_booking_mode, p_seats_requested, p_pickup_point_id, p_unit_price_paise, p_subtotal_paise,
    p_discount_paise, p_tax_paise, p_total_paise, p_amount_due_paise, p_balance_due_at, p_hold_minutes,
    p_terms_snapshot, p_pricing_snapshot, p_payment_provider, p_travelers, p_co_traveler_preference,
    p_preference_notes, p_whatsapp_opt_in, p_policy_version, p_preferred_seats);

  UPDATE public.bookings
  SET coupon_code = v_check.code, coupon_discount_paise = v_check.discount_paise, updated_at = now()
  WHERE id = v_hold.booking_id;

  INSERT INTO public.coupon_redemptions (coupon_id, booking_id, customer_email, customer_phone, discount_paise, status)
  VALUES (v_check.coupon_id, v_hold.booking_id, lower(btrim(p_customer_email)), v_phone, v_check.discount_paise, 'held');

  -- Nothing left to pay (e.g. a creator's free seat): confirm now, no payment step.
  IF p_total_paise = 0 AND p_amount_due_paise = 0 THEN
    UPDATE public.seat_allocations
    SET allocation_status = 'confirmed', hold_expires_at = NULL, updated_at = now()
    WHERE booking_id = v_hold.booking_id AND allocation_status = 'held';
    UPDATE public.bookings
    SET status = 'confirmed', hold_expires_at = NULL, updated_at = now()
    WHERE id = v_hold.booking_id;
    v_status := 'confirmed';
    PERFORM public.recalculate_departure_status(p_departure_id);
  END IF;

  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, reason, after_state)
  VALUES (p_user_id, 'customer', 'coupon_applied', 'booking', v_hold.booking_id::TEXT, v_check.code,
          jsonb_build_object('discount_paise', v_check.discount_paise, 'total_paise', p_total_paise, 'status', v_status));

  RETURN QUERY SELECT v_hold.booking_id, v_hold.booking_reference, v_hold.assigned_seats,
    CASE WHEN v_status = 'confirmed' THEN NULL::TIMESTAMPTZ ELSE v_hold.hold_expires_at END,
    v_status, v_check.discount_paise;
END;
$$;

-- 7. Keep redemptions in step with the booking ---------------------------------
CREATE OR REPLACE FUNCTION public.coupon_redemption_follow_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status IN ('expired', 'cancelled', 'refunded') THEN
    UPDATE public.coupon_redemptions SET status = 'released', updated_at = now()
    WHERE booking_id = NEW.id AND status IN ('held', 'used');
  ELSIF NEW.status IN ('confirmed', 'deposit_paid') THEN
    UPDATE public.coupon_redemptions SET status = 'used', updated_at = now()
    WHERE booking_id = NEW.id AND status = 'held';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_coupon_redemption_follow_booking ON public.bookings;
CREATE TRIGGER trg_coupon_redemption_follow_booking
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.coupon_redemption_follow_booking();

-- 8. Approve a creator: verified followers -> range -> personal one-time code -------------
CREATE OR REPLACE FUNCTION public.admin_approve_creator(
  p_application_id UUID,
  p_followers_verified INTEGER,
  p_code TEXT,
  p_actor_user_id UUID,
  p_actor_role TEXT,
  p_note TEXT DEFAULT ''
)
RETURNS TABLE (coupon_id UUID, code TEXT, tier_label TEXT, discount_type TEXT, discount_value INTEGER, valid_until TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_app public.influencer_applications%ROWTYPE;
  v_tier public.influencer_tiers%ROWTYPE;
  v_coupon_id UUID;
  v_until TIMESTAMPTZ;
  v_code TEXT := upper(btrim(COALESCE(p_code, '')));
BEGIN
  IF p_actor_role NOT IN ('owner', 'ops') THEN
    RAISE EXCEPTION 'NOT_ALLOWED: Only the owner or operations staff can approve creators.';
  END IF;
  IF p_followers_verified IS NULL OR p_followers_verified < 0 THEN
    RAISE EXCEPTION 'FOLLOWERS_REQUIRED: Enter the follower count you checked on their profile.';
  END IF;
  IF v_code !~ '^[A-Z0-9][A-Z0-9-]{3,23}$' THEN
    RAISE EXCEPTION 'BAD_CODE: Codes are 4–24 capital letters, numbers or dashes.';
  END IF;

  SELECT * INTO v_app FROM public.influencer_applications a WHERE a.id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Application not found.';
  END IF;
  IF v_app.status <> 'pending' THEN
    RAISE EXCEPTION 'ALREADY_DECIDED: This application was already %.', v_app.status;
  END IF;

  SELECT * INTO v_tier FROM public.influencer_tiers t
  WHERE t.is_active AND t.min_followers <= p_followers_verified
    AND (t.max_followers IS NULL OR p_followers_verified <= t.max_followers)
  ORDER BY t.min_followers DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_TIER: No follower range covers % followers. Add or change a range first, or reject.', p_followers_verified;
  END IF;

  v_until := now() + make_interval(days => v_tier.valid_days);
  BEGIN
    INSERT INTO public.coupons (code, kind, discount_type, discount_value, max_discount_paise, max_redemptions,
      per_customer_limit, valid_until, locked_email, locked_phone, note, created_by)
    VALUES (v_code, 'creator', v_tier.discount_type, v_tier.discount_value, v_tier.max_discount_paise, 1, 1,
      v_until, v_app.email, v_app.phone,
      left('Creator ' || v_app.full_name || ' (' || v_app.platform || ', ' || p_followers_verified || ' followers)', 300),
      p_actor_user_id)
    RETURNING id INTO v_coupon_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'CODE_TAKEN: That code already exists. Choose another.';
  END;

  UPDATE public.influencer_applications
  SET status = 'approved', followers_verified = p_followers_verified, tier_id = v_tier.id, coupon_id = v_coupon_id,
      staff_note = left(COALESCE(p_note, ''), 500), reviewed_by = p_actor_user_id, reviewed_at = now()
  WHERE id = v_app.id;

  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, reason, after_state)
  VALUES (p_actor_user_id, p_actor_role, 'creator_approved', 'influencer_application', v_app.id::TEXT,
    v_tier.label || ' — ' || v_code,
    jsonb_build_object('followers_verified', p_followers_verified, 'tier', v_tier.label, 'code', v_code));

  RETURN QUERY SELECT v_coupon_id, v_code, v_tier.label, v_tier.discount_type, v_tier.discount_value, v_until;
END;
$$;

REVOKE ALL ON FUNCTION public.coupon_check(TEXT, UUID, INTEGER, INTEGER, INTEGER, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coupon_check(TEXT, UUID, INTEGER, INTEGER, INTEGER, TEXT, TEXT, BOOLEAN) TO service_role;
REVOKE ALL ON FUNCTION public.reserve_departure_seats_with_coupon(TEXT, INTEGER, TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, UUID, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, TIMESTAMPTZ, INTEGER, JSONB, JSONB, TEXT, JSONB, TEXT, TEXT, BOOLEAN, TEXT, INTEGER[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_departure_seats_with_coupon(TEXT, INTEGER, TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, UUID, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, TIMESTAMPTZ, INTEGER, JSONB, JSONB, TEXT, JSONB, TEXT, TEXT, BOOLEAN, TEXT, INTEGER[]) TO service_role;
REVOKE ALL ON FUNCTION public.admin_approve_creator(UUID, INTEGER, TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_creator(UUID, INTEGER, TEXT, UUID, TEXT, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.coupon_redemption_follow_booking() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.influencer_tiers_no_overlap() FROM PUBLIC, anon, authenticated;
