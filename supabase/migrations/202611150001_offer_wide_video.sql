-- 15 Nov: an optional WIDE copy of an offer's video. A tall phone film fills the phone pop-up, but in
-- wide places (home / trips banners, tablets, computers) it shrank to a thin strip. When this is set,
-- wide places play it instead; empty = the main video everywhere (old behaviour).
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS wide_media_url TEXT NOT NULL DEFAULT '';

ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS promotions_wide_media_url_check;
ALTER TABLE public.promotions ADD CONSTRAINT promotions_wide_media_url_check CHECK (
  wide_media_url = ''
  OR (
    media_type = 'video'
    AND wide_media_url ~ '^(/[A-Za-z0-9._~/%-]+|https://[^[:space:]<>"]{4,})$'
    AND char_length(wide_media_url) <= 600
  )
);

-- Visitors may read it like the other display columns.
GRANT SELECT (wide_media_url) ON public.promotions TO anon, authenticated;
