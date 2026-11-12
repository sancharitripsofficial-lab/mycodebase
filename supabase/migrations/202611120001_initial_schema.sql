-- ============================================================================
-- Sanchari • Micro Trips — Initial Database Schema
-- Migration: 202611120001_initial_schema.sql
-- Reversible notes: Drop tables in reverse dependency order to roll back.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Profiles & Trusted Staff Roles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  emergency_contact_name TEXT NOT NULL DEFAULT '',
  emergency_contact_phone TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staff_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'ops', 'support')),
  assigned_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Trips, Itineraries & Pickup Points
CREATE TABLE IF NOT EXISTS public.trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  destination TEXT NOT NULL,
  region TEXT NOT NULL,
  tagline TEXT NOT NULL,
  summary TEXT NOT NULL,
  duration_days INTEGER NOT NULL CHECK (duration_days >= 1 AND duration_days <= 14),
  duration_nights INTEGER NOT NULL CHECK (duration_nights >= 0 AND duration_nights <= 13),
  difficulty TEXT NOT NULL CHECK (difficulty IN ('Easy', 'Moderate', 'Active')),
  vibe TEXT NOT NULL,
  base_price_paise INTEGER NOT NULL CHECK (base_price_paise >= 0),
  private_group_price_paise INTEGER NULL CHECK (private_group_price_paise >= 0),
  private_discount_percent INTEGER NOT NULL DEFAULT 0 CHECK (private_discount_percent BETWEEN 0 AND 40),
  deposit_percent INTEGER NULL CHECK (deposit_percent IS NULL OR deposit_percent BETWEEN 10 AND 100),
  balance_due_days_before INTEGER NOT NULL DEFAULT 7 CHECK (balance_due_days_before BETWEEN 1 AND 60),
  pickup_city TEXT NOT NULL DEFAULT 'Bengaluru',
  hero_image_url TEXT NOT NULL,
  gallery_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  inclusions JSONB NOT NULL DEFAULT '[]'::jsonb,
  exclusions JSONB NOT NULL DEFAULT '[]'::jsonb,
  accommodation_notes TEXT NOT NULL DEFAULT '',
  packing_list JSONB NOT NULL DEFAULT '[]'::jsonb,
  safety_notes TEXT NOT NULL DEFAULT '',
  accessibility_notes TEXT NOT NULL DEFAULT '',
  is_sample_demo BOOLEAN NOT NULL DEFAULT true,
  is_published BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.itinerary_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL CHECK (day_number >= 1),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  drive_time_estimate TEXT NOT NULL DEFAULT '',
  travel_buffer_notes TEXT NOT NULL DEFAULT '',
  meals_included TEXT NOT NULL DEFAULT '',
  UNIQUE (trip_id, day_number)
);

CREATE TABLE IF NOT EXISTS public.pickup_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  area TEXT NOT NULL,
  pickup_time_label TEXT NOT NULL,
  maps_url TEXT NULL,
  is_confirmed BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- 3. Departures (Hard Cap = 6 travelers)
CREATE TABLE IF NOT EXISTS public.departures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  departure_code TEXT NOT NULL UNIQUE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  max_capacity INTEGER NOT NULL DEFAULT 6 CHECK (max_capacity BETWEEN 1 AND 6),
  min_occupancy INTEGER NOT NULL DEFAULT 3 CHECK (min_occupancy BETWEEN 1 AND 6),
  departure_type TEXT NOT NULL DEFAULT 'open_batch' CHECK (departure_type IN ('open_batch', 'women_only', 'private_charter')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'filling_fast', 'last_seats', 'sold_out', 'cancelled', 'completed')),
  booking_cutoff_at TIMESTAMPTZ NOT NULL,
  preference_deadline_at TIMESTAMPTZ NOT NULL,
  price_override_paise INTEGER NULL CHECK (price_override_paise IS NULL OR price_override_paise >= 0),
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  CHECK (min_occupancy <= max_capacity)
);

-- Separate staff-only internal notes so public queries never see operational comments
CREATE TABLE IF NOT EXISTS public.departure_ops_notes (
  departure_id UUID PRIMARY KEY REFERENCES public.departures(id) ON DELETE CASCADE,
  operator_notes TEXT NOT NULL DEFAULT '',
  vehicle_assignment_label TEXT NOT NULL DEFAULT '',
  updated_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Bookings, Travelers, Comfort Preferences & Seat Allocations
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_reference TEXT NOT NULL UNIQUE,
  departure_id UUID NOT NULL REFERENCES public.departures(id) ON DELETE RESTRICT,
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  booking_mode TEXT NOT NULL CHECK (booking_mode IN ('batch_seats', 'private_vehicle')),
  seats_requested INTEGER NOT NULL CHECK (seats_requested BETWEEN 1 AND 6),
  status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (
    status IN ('pending_payment', 'deposit_paid', 'confirmed', 'cancel_requested', 'cancelled', 'refunded', 'expired')
  ),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  unit_price_paise INTEGER NOT NULL CHECK (unit_price_paise >= 0),
  subtotal_paise INTEGER NOT NULL CHECK (subtotal_paise >= 0),
  discount_paise INTEGER NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
  tax_paise INTEGER NOT NULL DEFAULT 0 CHECK (tax_paise >= 0),
  total_paise INTEGER NOT NULL CHECK (total_paise >= 0),
  amount_paid_paise INTEGER NOT NULL DEFAULT 0 CHECK (amount_paid_paise >= 0),
  amount_due_paise INTEGER NOT NULL CHECK (amount_due_paise >= 0),
  balance_due_at TIMESTAMPTZ NULL,
  hold_expires_at TIMESTAMPTZ NULL,
  terms_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  pricing_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  pickup_point_id UUID NULL REFERENCES public.pickup_points(id) ON DELETE SET NULL,
  verification_status TEXT NOT NULL DEFAULT 'not_checked' CHECK (verification_status IN ('not_checked', 'checked')),
  payment_provider TEXT NULL,
  reschedule_requested_note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.booking_travelers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  age_group TEXT NOT NULL DEFAULT 'adult' CHECK (age_group IN ('adult', 'senior')),
  emergency_contact TEXT NOT NULL,
  dietary_notes TEXT NULL,
  seat_row_request TEXT NOT NULL DEFAULT 'no_preference' CHECK (seat_row_request IN ('no_preference', 'front_middle', 'rear_window')),
  room_preference TEXT NOT NULL DEFAULT 'shared_same_gender' CHECK (
    room_preference IN ('shared_same_gender', 'private_room_request', 'couple_friends_room_request')
  ),
  verification_checked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Isolated table for private co-traveler comfort requests (never exposed publicly or in analytics)
CREATE TABLE IF NOT EXISTS public.booking_comfort_preferences (
  booking_id UUID PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  co_traveler_preference TEXT NOT NULL DEFAULT 'open_mixed' CHECK (
    co_traveler_preference IN ('open_mixed', 'prefer_same_gender', 'request_women_only')
  ),
  preference_notes TEXT NULL,
  resolution_status TEXT NOT NULL DEFAULT 'none_requested' CHECK (
    resolution_status IN (
      'none_requested',
      'pending_review',
      'accommodated',
      'not_feasible_notified',
      'customer_accepted_alt',
      'customer_rescheduled',
      'customer_refunded'
    )
  ),
  resolved_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ NULL,
  consent_recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.seat_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  departure_id UUID NOT NULL REFERENCES public.departures(id) ON DELETE CASCADE,
  booking_id UUID NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  seat_number INTEGER NOT NULL CHECK (seat_number BETWEEN 1 AND 6),
  allocation_status TEXT NOT NULL CHECK (allocation_status IN ('held', 'confirmed', 'operator_blocked', 'released')),
  hold_expires_at TIMESTAMPTZ NULL,
  reason TEXT NULL,
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Critical concurrency invariant: a physical seat (1..6) on a departure can only have ONE active allocation
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_seat_per_departure
  ON public.seat_allocations (departure_id, seat_number)
  WHERE allocation_status IN ('held', 'confirmed', 'operator_blocked');

-- 5. Payments, Refunds, Waitlist, Consent, Reviews, Site Settings & Audit Log
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_order_id TEXT NULL,
  provider_payment_id TEXT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  payment_type TEXT NOT NULL DEFAULT 'full' CHECK (payment_type IN ('full', 'deposit', 'balance')),
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'authorized', 'captured', 'failed', 'refunded')),
  raw_verified_payload JSONB NULL,
  verified_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_payment_id
  ON public.payments (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  payment_id UUID NULL REFERENCES public.payments(id) ON DELETE SET NULL,
  amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'processed', 'failed')),
  provider_refund_id TEXT NULL,
  processed_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.waitlist_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  departure_id UUID NOT NULL REFERENCES public.departures(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  seats_needed INTEGER NOT NULL CHECK (seats_needed BETWEEN 1 AND 6),
  whatsapp_opt_in BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'notified', 'converted', 'cancelled')),
  consent_recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_email TEXT NOT NULL,
  booking_id UUID NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL CHECK (
    consent_type IN ('booking_terms_privacy', 'comfort_preference_processing', 'whatsapp_updates', 'waitlist_contact')
  ),
  granted BOOLEAN NOT NULL,
  policy_version TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NULL REFERENCES public.trips(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  departure_label TEXT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  quote TEXT NOT NULL,
  is_verified_authentic BOOLEAN NOT NULL DEFAULT false,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.site_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role TEXT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  reason TEXT NULL,
  before_state JSONB NULL,
  after_state JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for foreign keys, RLS predicates & common lookups
CREATE INDEX IF NOT EXISTS idx_trips_published_sort ON public.trips (is_published, sort_order);
CREATE INDEX IF NOT EXISTS idx_itinerary_trip_id ON public.itinerary_days (trip_id);
CREATE INDEX IF NOT EXISTS idx_pickup_points_trip_id ON public.pickup_points (trip_id);
CREATE INDEX IF NOT EXISTS idx_departures_trip_start ON public.departures (trip_id, start_date);
CREATE INDEX IF NOT EXISTS idx_bookings_departure_id ON public.bookings (departure_id);
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON public.bookings (user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_reference ON public.bookings (booking_reference);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings (status);
CREATE INDEX IF NOT EXISTS idx_travelers_booking_id ON public.booking_travelers (booking_id);
CREATE INDEX IF NOT EXISTS idx_seat_alloc_departure_status ON public.seat_allocations (departure_id, allocation_status);
CREATE INDEX IF NOT EXISTS idx_seat_alloc_booking_id ON public.seat_allocations (booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON public.payments (booking_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_departure_id ON public.waitlist_entries (departure_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs (entity_type, entity_id, created_at DESC);

