-- ============================================================================
-- Sanchari • Micro Trips — Offers & ads shown on the website
-- Migration: 202611130003_promotions.sql
--
-- Staff create offers in the admin (text, photo, video or YouTube, a button link, where to
-- show it, and when). The website shows only offers that are switched on and inside their
-- dates. Views and clicks are counted (numbers only, nothing about the visitor).
-- Writes happen only on the server (service role) after a staff role check.
-- Rollback: DROP FUNCTION public.promotion_track(UUID, TEXT); DROP TABLE public.promotions;
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 80),
  message TEXT NOT NULL DEFAULT '' CHECK (char_length(message) <= 240),
  badge TEXT NOT NULL DEFAULT '' CHECK (char_length(badge) <= 24),
  media_type TEXT NOT NULL DEFAULT 'none' CHECK (media_type IN ('none', 'image', 'video', 'youtube')),
  media_url TEXT NOT NULL DEFAULT '' CHECK (
    (media_type = 'none' AND media_url = '')
    OR (media_type <> 'none' AND media_url ~ '^(/[A-Za-z0-9._~/%-]+|https://[^[:space:]<>"]{4,})$' AND char_length(media_url) <= 600)
  ),
  poster_url TEXT NOT NULL DEFAULT '' CHECK (
    poster_url = '' OR (poster_url ~ '^(/[A-Za-z0-9._~/%-]+|https://[^[:space:]<>"]{4,})$' AND char_length(poster_url) <= 600)
  ),
  cta_label TEXT NOT NULL DEFAULT '' CHECK (char_length(cta_label) <= 30),
  cta_url TEXT NOT NULL DEFAULT '' CHECK (
    cta_url = '' OR (cta_url ~ '^(/[A-Za-z0-9._~/?#=&%-]*|https://[^[:space:]<>"]{4,})$' AND char_length(cta_url) <= 500)
  ),
  placements TEXT[] NOT NULL DEFAULT ARRAY['home_banner']::TEXT[] CHECK (
    cardinality(placements) >= 1
    AND placements <@ ARRAY['top_bar', 'home_banner', 'trips_banner', 'trip_page', 'popup']::TEXT[]
  ),
  trip_id UUID NULL REFERENCES public.trips(id) ON DELETE SET NULL,
  theme TEXT NOT NULL DEFAULT 'sunset' CHECK (theme IN ('sunset', 'ocean', 'teal')),
  starts_at TIMESTAMPTZ NULL,
  ends_at TIMESTAMPTZ NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN -1000 AND 1000),
  view_count BIGINT NOT NULL DEFAULT 0,
  click_count BIGINT NOT NULL DEFAULT 0,
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT promotions_dates_order CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT promotions_button_pair CHECK ((cta_label = '') = (cta_url = ''))
);

CREATE INDEX IF NOT EXISTS idx_promotions_live ON public.promotions (is_active, sort_order, created_at DESC);

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

-- Visitors: only offers that are on and inside their dates.
DROP POLICY IF EXISTS "promotions_public_live" ON public.promotions;
CREATE POLICY "promotions_public_live" ON public.promotions
  FOR SELECT TO anon, authenticated USING (
    is_active
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at > now())
  );

-- Staff: everything (drafts, scheduled, ended).
DROP POLICY IF EXISTS "promotions_staff_read" ON public.promotions;
CREATE POLICY "promotions_staff_read" ON public.promotions FOR SELECT TO authenticated USING (public.is_staff());

-- Visitors may read the display columns only (not counters or who made it).
REVOKE ALL ON public.promotions FROM anon, authenticated;
GRANT SELECT (id, title, message, badge, media_type, media_url, poster_url, cta_label, cta_url, placements,
  trip_id, theme, starts_at, ends_at, is_active, sort_order) ON public.promotions TO anon, authenticated;

-- Count a view or a click on a live offer (called by the server, rate-limited there).
CREATE OR REPLACE FUNCTION public.promotion_track(p_promotion_id UUID, p_kind TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_kind NOT IN ('view', 'click') THEN
    RAISE EXCEPTION 'BAD_KIND: Only view or click can be counted.';
  END IF;
  UPDATE public.promotions
  SET view_count = view_count + CASE WHEN p_kind = 'view' THEN 1 ELSE 0 END,
      click_count = click_count + CASE WHEN p_kind = 'click' THEN 1 ELSE 0 END
  WHERE id = p_promotion_id
    AND is_active
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at > now());
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.promotion_track(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promotion_track(UUID, TEXT) TO service_role;
