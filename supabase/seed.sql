-- ============================================================================
-- Sanchari • Micro Trips — Illustrative Sample Seed Data
-- All prices, dates, pickup points, itineraries, and policy drafts below are
-- SAMPLE PLACEHOLDERS for staging/local verification. Owner must review and
-- update all values in Admin before accepting live customer bookings.
-- ============================================================================

INSERT INTO public.site_settings (key, value) VALUES
  (
    'brand_identity',
    '{
      "brandName": "Sanchari • Micro Trips",
      "headline": "Leave as strangers. Return as a story.",
      "subheadline": "Curated Karnataka road trips, shared with no more than six travelers.",
      "baseCity": "Bengaluru, Karnataka",
      "supportHours": "[Owner to verify: e.g., Mon–Sun, 9:00 AM – 7:00 PM IST]",
      "legalEntityName": "[Owner to verify legal entity name]",
      "registeredAddress": "[Owner to verify Bengaluru office/registered address]",
      "supportEmail": "[Owner to configure support email]",
      "whatsappDisplay": "[Owner to configure WhatsApp support number]",
      "isCopyDraft": true
    }'::jsonb
  ),
  (
    'booking_policy',
    '{
      "maxGroupSize": 6,
      "holdMinutes": 15,
      "gstIncludedOrNote": "[Owner to confirm GST applicability and tax rate before launch]",
      "taxRatePercent": 0,
      "allowDepositCheckout": false,
      "depositPercent": 30,
      "balanceDueDaysBefore": 7,
      "cancellationSlabs": [
        {"label": "Draft: 14+ days before departure", "refundNote": "[Owner to verify refund % / credit rule]"},
        {"label": "Draft: 7–13 days before departure", "refundNote": "[Owner to verify partial refund %]"},
        {"label": "Draft: Under 7 days / no-show", "refundNote": "[Owner to verify no-refund / emergency policy]"}
      ],
      "preferenceDecisionHoursBefore": 72,
      "roomPolicySummary": "For overnight stays, shared same-gender rooms are the default request for solo travelers when confirmed by the operator. Private or couple/friends rooms are subject to property availability and tariff confirmation.",
      "vehiclePolicySummary": "Operated in an Ertiga-class 6-passenger MPV (exact vehicle registration, luggage allowance, and driver assignment shared only after owner confirmation).",
      "policyVersion": "draft-v0.1-owner-review-required"
    }'::jsonb
  ),
  (
    'faqs',
    '[
      {
        "id": "faq-six-cap",
        "question": "Why are departures capped at six travelers?",
        "answer": "Every Sanchari trip travels in one comfortable Ertiga-sized MPV with a strict six-traveler limit. Smaller groups allow unhurried stops, easier conversation, and stays at intimate homestays rather than large coach-bus hotels."
      },
      {
        "id": "faq-solo",
        "question": "Can I join solo, or as a duo or trio?",
        "answer": "Yes. Most travelers join solo or in pairs (1–5 seats) on scheduled departures. If you are six friends or family, you can also book all six seats as a private vehicle when a departure has 6/6 seats free."
      },
      {
        "id": "faq-comfort",
        "question": "How do co-traveler and room preferences work?",
        "answer": "During checkout you can share optional co-traveler comfort and room requests. Preferences are handled privately by our operations team and are never shown publicly. Women-only departures are scheduled explicitly by our team—if a preference cannot be met by the decision deadline, you will be offered alternatives or a refund per the published policy."
      },
      {
        "id": "faq-pickup",
        "question": "Where are Bengaluru pickup and drop points?",
        "answer": "Sample pickup hubs (such as Indiranagar, Koramangala, and Hebbal/Yeshwanthpur depending on route direction) are listed on each trip page. Exact confirmed pickup timings are locked by the operator before departure."
      },
      {
        "id": "faq-reviews",
        "question": "Why are customer reviews not shown unless verified?",
        "answer": "Sanchari publishes only authentic, operator-verified reviews from real completed trips. We never publish placeholder testimonials."
      }
    ]'::jsonb
  ),
  (
    'legal_drafts',
    '{
      "ownerReviewRequired": true,
      "termsSummary": "DRAFT FOR OWNER REVIEW: This platform facilitates small-group road trip reservations operated in Karnataka. Final terms covering force majeure, weather/ghat road diversions, traveler conduct, medical disclosure, and liability must be reviewed by legal counsel before going live.",
      "privacySummary": "DRAFT FOR OWNER REVIEW: We collect only information necessary to operate your trip (contact details, emergency contact, pickup choice, and optional comfort/dietary requests). Co-traveler comfort preferences are access-restricted to operations staff and never shared publicly or with third-party marketers.",
      "refundSummary": "DRAFT FOR OWNER REVIEW: Refunds and reschedules follow the slab snapshot attached to your booking at checkout. Payment gateway reversals typically settle within 5–7 business days once processed, subject to gateway rules.",
      "safetySummary": "DRAFT FOR OWNER REVIEW: Safety protocols, driver rest limits, night-driving restrictions on ghat roads, first-aid kit checks, and manual verification-checked steps must be confirmed and audited by the business owner before publishing as guarantees."
    }'::jsonb
  )
ON CONFLICT (key) DO NOTHING;

-- Trips
INSERT INTO public.trips (
  id, slug, title, destination, region, tagline, summary,
  duration_days, duration_nights, difficulty, vibe,
  base_price_paise, private_group_price_paise, private_discount_percent,
  deposit_percent, balance_due_days_before, pickup_city, hero_image_url,
  gallery_urls, inclusions, exclusions, accommodation_notes, packing_list,
  safety_notes, accessibility_notes, is_sample_demo, is_published, sort_order
) VALUES
(
  '11111111-1111-4111-8111-111111111101',
  'chikmagalur-coffee-trails',
  'Chikmagalur Coffee & Mist Trails',
  'Chikmagalur, Karnataka',
  'Western Ghats',
  'Unhurried estate walks, monsoon-washed ridges, and filter coffee before the crowds arrive.',
  'Sample itinerary: A calm 3-day weekend drive from Bengaluru into the Mullayanagiri foothills, staying at a small coffee-estate homestay with guided plantation walks and scenic ridge viewpoints.',
  3, 2, 'Easy', 'Slow hills & coffee culture',
  1150000, 6200000, 10,
  NULL, 7, 'Bengaluru', '/media/dest-chikmagalur.jpg',
  '["/media/dest-chikmagalur.jpg", "/media/story-coffee-morning.jpg", "/media/hero-western-ghats.jpg"]'::jsonb,
  '["Sample: 6-seat Ertiga-class AC transport from Bengaluru & back", "Sample: 2 nights at an estate homestay (room basis subject to confirmation)", "Sample: Estate breakfast & Malnad dinner as listed in itinerary", "Sample: Guided coffee plantation walk & driver allowances"]'::jsonb,
  '["Sample: Highway lunches & personal cafe stops", "Sample: Entry tickets / jeep transfers if opted locally", "Sample: Personal travel insurance & incidental expenses"]'::jsonb,
  'Draft policy: Small family-run estate homestay. Solo travelers default to shared same-gender rooms when confirmed; private rooms subject to availability and supplement.',
  '["Light rain shell or windcheater", "Grippy walking shoes", "Reusable water bottle", "Light woollen layer for dawn ridges", "Motion-sickness medication if sensitive to ghat curves"]'::jsonb,
  'Draft operational note: Daytime ghat driving only, planned rest breaks every 2.5 hours. Owner to confirm exact vehicle checklist & driver verification protocols.',
  'Involves moderate walking on uneven coffee-estate paths and gentle steps; please flag mobility needs before booking so the team can advise.',
  true, true, 1
),
(
  '11111111-1111-4111-8111-111111111102',
  'coorg-rainforest-slow-drive',
  'Kodagu Rainforest & Spice Drive',
  'Kodagu (Coorg), Karnataka',
  'Western Ghats',
  'Pepper vines, misty shola valleys, and quiet backroads away from busy resort strips.',
  'Sample itinerary: Three slow days across South Kodagu’s spice estates, shaded forest viewpoints, and traditional Kodava home-cooked meals with a group of no more than six.',
  3, 2, 'Moderate', 'Rainforest & culinary heritage',
  1240000, 6690000, 10,
  NULL, 7, 'Bengaluru', '/media/dest-coorg.jpg',
  '["/media/dest-coorg.jpg", "/media/story-coffee-morning.jpg"]'::jsonb,
  '["Sample: Round-trip Ertiga-class road travel from Bengaluru", "Sample: 2 nights in a verified Kodagu estate stay", "Sample: Breakfasts & 1 curated estate dinner", "Sample: Spice-estate walk & route tolls/parking"]'::jsonb,
  '["Sample: En-route lunches & specialty coffee tastings", "Sample: Optional forest entry permits", "Sample: Personal expenses"]'::jsonb,
  'Draft policy: Heritage plantation bungalow or cottages. Room sharing confirmed before departure.',
  '["Quick-dry trousers", "Closed-toe trail shoes", "Umbrella or poncho (Jun–Nov)", "Personal medications", "Small daypack"]'::jsonb,
  'Draft operational note: Route avoids late-night forest stretches; emergency contact shared prior to pickup.',
  'Includes short forest trails that can be slippery after rain. Not wheelchair accessible at estate verandahs.',
  true, true, 2
),
(
  '11111111-1111-4111-8111-111111111103',
  'gokarna-coastal-headlands',
  'Gokarna Headlands & Quiet Coves',
  'Gokarna, Coastal Karnataka',
  'Coastal Karnataka',
  'Laterite cliff paths, quiet morning swims, and slow coastal drives through Uttara Kannada.',
  'Sample itinerary: An overnight-to-coast micro-expedition linking Bengaluru with Gokarna’s quieter headland trails, sunset cliffs, and local coastal kitchens.',
  3, 2, 'Moderate', 'Coastal cliffs & sea breeze',
  1290000, 6950000, 10,
  NULL, 7, 'Bengaluru', '/media/dest-gokarna.jpg',
  '["/media/dest-gokarna.jpg", "/media/hero-western-ghats.jpg"]'::jsonb,
  '["Sample: AC 6-seat MPV travel from Bengaluru", "Sample: 2 nights coastal boutique stay", "Sample: Daily coastal breakfast", "Sample: Guided headland walk"]'::jsonb,
  '["Sample: Beach shack lunches & dinners", "Sample: Ferry / water activities (weather dependent)", "Sample: Personal purchases"]'::jsonb,
  'Draft policy: Clean coastal guesthouse near quieter coves. AC/non-AC room category confirmed per departure.',
  '["Breathable cotton/linen clothing", "Sandals + trail sneakers", "Sunscreen & hat", "Dry bag for phone", "Light shawl for early morning drive"]'::jsonb,
  'Draft operational note: Coastal swim stops are non-lifeguarded and strictly optional; headland walk follows daylight hours only.',
  'Headland paths involve rocky steps and steep sun-exposed gradients; alternative viewpoint drops can be arranged by car.',
  true, true, 3
),
(
  '11111111-1111-4111-8111-111111111104',
  'hampi-boulders-and-ruins',
  'Hampi Boulders & Sunrise Ruins',
  'Hampi, Karnataka',
  'Heritage',
  'Granite ridges at first light, riverside ruins, and unhurried heritage storytelling.',
  'Sample itinerary: A heritage-focused road trip to Hampi’s boulder landscapes and Vijayanagara stone precincts, paced around early mornings and golden-hour views.',
  3, 2, 'Easy', 'Heritage & golden-hour walks',
  1190000, 6420000, 10,
  NULL, 7, 'Bengaluru', '/media/dest-hampi.jpg',
  '["/media/dest-hampi.jpg", "/media/story-coffee-morning.jpg"]'::jsonb,
  '["Sample: AC 6-seat MPV travel from Bengaluru", "Sample: 2 nights near Hampi/Anegundi", "Sample: Breakfasts", "Sample: Sunrise ridge walk & local heritage orientation"]'::jsonb,
  '["Sample: ASI monument entry fees", "Sample: Lunches, dinners & coracle rides", "Sample: Camera fees if applicable"]'::jsonb,
  'Draft policy: Boutique guesthouse near Anegundi or Kamalapur.',
  '["Sun hat & sunglasses", "Comfortable walking sneakers", "Light breathable layers", "Electrolyte packets", "Power bank"]'::jsonb,
  'Draft operational note: Midday heat breaks built into itinerary; sunrise ridge walks carry group flashlights.',
  'Boulder viewpoints require steady footing on natural granite; main temple complexes are mostly flat stone pathways.',
  true, true, 4
)
ON CONFLICT (id) DO NOTHING;

-- Itinerary days
INSERT INTO public.itinerary_days (trip_id, day_number, title, description, drive_time_estimate, travel_buffer_notes, meals_included) VALUES
  ('11111111-1111-4111-8111-111111111101', 1, 'Bengaluru to Chikmagalur Coffee Country', 'Early morning pickup across confirmed Bengaluru hubs, breakfast stop along the Kunigal–Hassan highway, and afternoon check-in at the coffee estate followed by a slow estate walk.', '5.5 – 6.5 hrs (with breaks)', 'Includes 45-min breakfast & stretch buffer before ghat climb.', 'Sample: Evening estate coffee & dinner'),
  ('11111111-1111-4111-8111-111111111101', 2, 'Misty Ridges, Shola Forests & Estate Hearth', 'Dawn drive toward high-altitude viewpoints (weather & forest rules permitting), relaxed afternoon back at the homestay with Malnad lunch/coffee tasting and evening conversation.', '2.5 hrs local ghat loop', 'Buffer built in for fog clearance & single-lane ridge traffic.', 'Sample: Breakfast & dinner'),
  ('11111111-1111-4111-8111-111111111101', 3, 'Morning Birdsong & Return to Bengaluru', 'Unhurried estate breakfast, optional stop at a historic Hoysala shrine en route if time permits, arriving in Bengaluru by evening.', '6 – 7 hrs (Sunday return buffer)', '45-min Nelamangala evening traffic cushion built into ETA.', 'Sample: Breakfast'),

  ('11111111-1111-4111-8111-111111111102', 1, 'Bengaluru to South Kodagu Spice Estates', 'Morning departure via Mysuru bypass with traditional breakfast stop, arriving in South Kodagu by afternoon for estate check-in and pepper-vine walk.', '5.5 – 6.5 hrs', 'Includes Mysuru ring-road & coffee break buffer.', 'Sample: Dinner'),
  ('11111111-1111-4111-8111-111111111102', 2, 'Shola Valleys & Kodava Culinary Morning', 'Morning forest-edge viewpoint, gentle stream walk, and an unhurried afternoon learning local spice harvests.', '2 hrs local drive', 'Weather-flexible schedule during monsoon months.', 'Sample: Breakfast & curated estate dinner'),
  ('11111111-1111-4111-8111-111111111102', 3, 'Filter Coffee Dawn & Drive Home', 'Early breakfast on the verandah before cruising back toward Bengaluru with a lunch halt.', '6 – 7 hrs', 'Evening highway arrival buffer.', 'Sample: Breakfast'),

  ('11111111-1111-4111-8111-111111111103', 1, 'Bengaluru to Uttara Kannada Coast', 'Early start via Chitradurga–Hubballi or Shimoga corridor, reaching the coastal stay by late afternoon for sunset on a quiet headland.', '8.5 – 9.5 hrs', 'Two planned highway meal & stretch stops.', 'Sample: Light welcome refreshments'),
  ('11111111-1111-4111-8111-111111111103', 2, 'Headland Trail & Cove Hopping', 'Guided morning walk linking secluded coastal coves, relaxed afternoon rest out of peak sun, and golden-hour viewpoint.', '1 hr local transfers', 'Pace adjusts for coastal heat & tide timings.', 'Sample: Breakfast'),
  ('11111111-1111-4111-8111-111111111103', 3, 'Sunrise Shore & Return Drive', 'Early morning beach walk and coastal breakfast before the scenic return drive to Bengaluru.', '8.5 – 9.5 hrs', 'Includes dinner halt before city entry.', 'Sample: Breakfast'),

  ('11111111-1111-4111-8111-111111111104', 1, 'Bengaluru to the Tungabhadra Valley', 'Smooth highway cruise north via Chitradurga, afternoon arrival near Hampi/Anegundi, and sunset atop a quiet granite hill.', '6.5 – 7.5 hrs', 'Includes breakfast & lunch highway halts.', 'Sample: Arrival tea'),
  ('11111111-1111-4111-8111-111111111104', 2, 'Stone Mandapas & Riverine Ruins', 'Sunrise exploration of Vijayanagara monuments before midday heat, afternoon pause by the river, and lantern-lit heritage walk.', '1.5 hrs local loop', 'Midday 3-hour rest buffer built in.', 'Sample: Breakfast'),
  ('11111111-1111-4111-8111-111111111104', 3, 'Anegundi Village Morning & Return', 'Morning stroll through Anegundi lanes and banana plantations, departing after brunch for Bengaluru.', '7 – 8 hrs', 'Evening highway arrival buffer.', 'Sample: Breakfast')
ON CONFLICT (trip_id, day_number) DO NOTHING;

-- Pickup points (clearly flagged is_confirmed = false until owner verifies)
INSERT INTO public.pickup_points (trip_id, name, area, pickup_time_label, is_confirmed, sort_order) VALUES
  ('11111111-1111-4111-8111-111111111101', 'Indiranagar 100ft Road (Sample Hub)', 'East Bengaluru', '05:45 AM (Draft)', false, 1),
  ('11111111-1111-4111-8111-111111111101', 'Yeshwanthpur Metro / Goraguntepalya (Sample Hub)', 'West Bengaluru', '06:30 AM (Draft)', false, 2),
  ('11111111-1111-4111-8111-111111111102', 'Indiranagar 100ft Road (Sample Hub)', 'East Bengaluru', '05:45 AM (Draft)', false, 1),
  ('11111111-1111-4111-8111-111111111102', 'Silk Board / Mysore Road Junction (Sample Hub)', 'South-West Bengaluru', '06:30 AM (Draft)', false, 2),
  ('11111111-1111-4111-8111-111111111103', 'Indiranagar 100ft Road (Sample Hub)', 'East Bengaluru', '05:00 AM (Draft)', false, 1),
  ('11111111-1111-4111-8111-111111111103', 'Hebbal / Yeshwanthpur Bypass (Sample Hub)', 'North-West Bengaluru', '05:45 AM (Draft)', false, 2),
  ('11111111-1111-4111-8111-111111111104', 'Indiranagar 100ft Road (Sample Hub)', 'East Bengaluru', '05:30 AM (Draft)', false, 1),
  ('11111111-1111-4111-8111-111111111104', 'Hebbal Ring Road (Sample Hub)', 'North Bengaluru', '06:15 AM (Draft)', false, 2);

-- Sample upcoming departures (December 2026 & January 2027)
INSERT INTO public.departures (
  id, trip_id, departure_code, start_date, end_date,
  max_capacity, min_occupancy, departure_type, status,
  booking_cutoff_at, preference_deadline_at, is_published
) VALUES
  ('22222222-2222-4222-8222-222222222201', '11111111-1111-4111-8111-111111111101', 'SAN-CKM-DEC04', '2026-12-04', '2026-12-06', 6, 3, 'open_batch', 'filling_fast', '2026-12-02 18:00:00+05:30', '2026-12-01 18:00:00+05:30', true),
  ('22222222-2222-4222-8222-222222222202', '11111111-1111-4111-8111-111111111101', 'SAN-CKM-DEC18', '2026-12-18', '2026-12-20', 6, 3, 'open_batch', 'open', '2026-12-16 18:00:00+05:30', '2026-12-15 18:00:00+05:30', true),
  ('22222222-2222-4222-8222-222222222203', '11111111-1111-4111-8111-111111111102', 'SAN-CRG-DEC11', '2026-12-11', '2026-12-13', 6, 3, 'women_only', 'open', '2026-12-09 18:00:00+05:30', '2026-12-08 18:00:00+05:30', true),
  ('22222222-2222-4222-8222-222222222204', '11111111-1111-4111-8111-111111111103', 'SAN-GOK-DEC25', '2026-12-25', '2026-12-27', 6, 3, 'open_batch', 'last_seats', '2026-12-23 18:00:00+05:30', '2026-12-22 18:00:00+05:30', true),
  ('22222222-2222-4222-8222-222222222205', '11111111-1111-4111-8111-111111111104', 'SAN-HMP-JAN08', '2027-01-08', '2027-01-10', 6, 3, 'open_batch', 'open', '2027-01-06 18:00:00+05:30', '2027-01-05 18:00:00+05:30', true),
  ('22222222-2222-4222-8222-222222222206', '11111111-1111-4111-8111-111111111102', 'SAN-CRG-NOV27', '2026-11-27', '2026-11-29', 6, 3, 'open_batch', 'sold_out', '2026-11-25 18:00:00+05:30', '2026-11-24 18:00:00+05:30', true)
ON CONFLICT (id) DO NOTHING;

-- Sample operator-blocked seats on demo departures so capacity states are realistic
-- (e.g., 3 seats taken on SAN-CKM-DEC04, 5 seats taken on SAN-GOK-DEC25, 6/6 on SAN-CRG-NOV27, 0/6 on open ones for private charter testing)
INSERT INTO public.seat_allocations (departure_id, seat_number, allocation_status, reason)
SELECT '22222222-2222-4222-8222-222222222201', s, 'operator_blocked', 'Sample demo occupancy (3/6)'
FROM generate_series(1, 3) AS s
ON CONFLICT DO NOTHING;

INSERT INTO public.seat_allocations (departure_id, seat_number, allocation_status, reason)
SELECT '22222222-2222-4222-8222-222222222204', s, 'operator_blocked', 'Sample demo occupancy (5/6)'
FROM generate_series(1, 5) AS s
ON CONFLICT DO NOTHING;

INSERT INTO public.seat_allocations (departure_id, seat_number, allocation_status, reason)
SELECT '22222222-2222-4222-8222-222222222206', s, 'operator_blocked', 'Sample demo sold-out state (6/6)'
FROM generate_series(1, 6) AS s
ON CONFLICT DO NOTHING;

