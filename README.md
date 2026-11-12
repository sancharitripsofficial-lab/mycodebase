# Sanchari • Micro Trips

Curated small-group Karnataka road trips starting from Bengaluru, strictly capped at **six travelers per departure**. Built with Next.js App Router, strict TypeScript, Tailwind CSS, Zod, and Supabase Postgres + Row Level Security.

---

## 1. Current Workspace & Integration Status

- **Storefront & Operations App:** Implemented under `src/` with responsive editorial pages, accessible 6-seat visual tracker, private comfort request handling, booking lookup, and role-protected `/admin` console.
- **Database Schema & Atomic Functions:** Located in `supabase/migrations/` and `supabase/seed.sql`.
- **Preview Fallback Mode:** When Supabase environment variables are not set in `.env.local`, the server uses an in-memory sample store (`src/lib/data/demo-store.ts`) and displays a clear **Preview / Sample Mode** banner so you can inspect flows locally without inventing live claims.
- **Git Remote Note:** Check `git remote -v` before pushing; if this workspace was initialized locally without a remote, add `https://github.com/sancharitripsofficial-lab/mycodebase.git` only when ready to push.

---

## 2. Local Development Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template (never commit .env.local)
cp .env.example .env.local

# 3. Start local dev server
npm run dev
```

Available scripts in `package.json`:
- `npm run dev` — Start Next.js development server
- `npm run lint` — Run ESLint
- `npm run typecheck` — Run TypeScript strict type checking (`tsc --noEmit`)
- `npm test` — Run Vitest unit & security invariant tests
- `npm run build` — Build production Next.js bundle

---

## 3. Environment Variables (Names Only — Never Commit Secrets)

See `.env.example` for safe placeholders:

| Variable | Side | Purpose & Where to Obtain |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Public | Canonical site origin (e.g., `https://sanchari.example.com`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase Dashboard → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Supabase Dashboard → Project Settings → API → `anon` / publishable key (safe only with RLS enabled) |
| `SANCHARI_SUPABASE_SECRET_KEY` | **Server-only** | Supabase Dashboard → Project Settings → API Keys → secret key (`sb_secret_…`). Project-specific name on purpose: a system-wide `SUPABASE_SERVICE_ROLE_KEY` from another project would otherwise override `.env.local`. |
| `PAYMENT_PROVIDER` | Server-only | `sandbox` (default) or `razorpay` |
| `RAZORPAY_KEY_ID` | Server / Public ID | Razorpay Dashboard → Account & Settings → API Keys |
| `RAZORPAY_KEY_SECRET` | **Server-only** | Razorpay Dashboard → API Keys |
| `RAZORPAY_WEBHOOK_SECRET` | **Server-only** | Razorpay Dashboard → Webhooks (`payment.captured`, `order.paid` → `/api/payments/webhook`) |
| `NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER` | Public | Optional click-to-WhatsApp fallback (`91XXXXXXXXXX`, digits only) |
| `WHATSAPP_CLOUD_API_TOKEN` | **Server-only** | Meta WhatsApp Business Cloud API token (only after templates approved) |
| `WHATSAPP_PHONE_NUMBER_ID` | **Server-only** | Meta WhatsApp Business Phone Number ID |
| `RESEND_API_KEY` / `EMAIL_FROM_ADDRESS` | **Server-only** | Optional transactional email receipt provider |
| `BOOKING_LOOKUP_SECRET` | **Server-only** | 32+ char random secret (`openssl rand -hex 32`) for HMAC-signing guest receipt tokens |

---

## 4. Supabase Migration, Seed & First Admin Provisioning

1. **Apply migrations** in your Supabase project (`sancharitripsofficial-lab's Project`, e.g., via Supabase SQL Editor or linked `supabase db push`):
   - `supabase/migrations/202611120001_initial_schema.sql`
   - `supabase/migrations/202611120002_rls_and_functions.sql`
2. **Optional staging sample seed:**
   - Run `supabase/seed.sql` to populate clearly flagged sample itineraries (`is_sample_demo = true`), draft policy settings, and test departures.
3. **Provision the First Admin Safely (Trusted Server-Side Path Only):**
   - Create the owner user in **Supabase Dashboard → Authentication → Users** (using a strong password / verified email).
   - Copy the new user's `id` (UUID) and insert one row into `public.staff_roles` via the Supabase SQL Editor:
     ```sql
     INSERT INTO public.staff_roles (user_id, role, notes)
     VALUES ('<AUTH_USER_UUID>', 'owner', 'Initial business owner provisioning');
     ```
   - User-editable `profiles` or `user_metadata` fields **never** grant admin access.

---

## 5. Key Security & Booking Architecture

- **Atomic 6-Seat Concurrency Lock:** `public.reserve_departure_seats` locks the `departures` row (`FOR UPDATE`), expires stale pending holds, enforces `max_capacity <= 6`, requires `0` occupied seats for `private_vehicle`, and allocates unique seats protected by `idx_unique_active_seat_per_departure`.
- **Isolated Comfort Preferences:** `booking_comfort_preferences` is isolated from public views, excluded from CSV exports (`/api/admin/export`), masked from read-only `support` staff, and summarized to customers via privacy-safe labels only.
- **Server-Verified Idempotent Payments:** Client redirects never confirm bookings. Confirmations occur only through `/api/payments/verify` (HMAC check) or `/api/payments/webhook` (`X-Razorpay-Signature` timing-safe check) calling `confirm_booking_payment`.

---

## 6. Owner Pre-Launch Verification Checklist

Before switching `is_sample_demo` to `false` or enabling live payments, the business owner must verify and update in Admin / Supabase:

- [ ] Official legal entity name, Bengaluru registered address, support email, phone, and support hours.
- [ ] Confirmed destinations, day-by-day itineraries, realistic drive buffers, and verified Bengaluru pickup hubs + exact timings (`is_confirmed = true`).
- [ ] Actual Ertiga-class vehicle specification, luggage capacity per traveler, and seat-assignment rules.
- [ ] Real per-seat prices, private 6-seat group tariff/discount, GST/tax applicability, and deposit/balance deadlines.
- [ ] Minimum occupancy rules and booking/preference decision cutoffs.
- [ ] Final legal Terms, Privacy Policy, and Cancellation/Refund slabs reviewed by legal counsel.
- [ ] True safety, driver-rest, and manual check-in verification standards (never publish unverified safety claims).
- [ ] Overnight room sharing policy and trip-specific accessibility limitations.
- [ ] Razorpay KYC/live keys + webhook URL (`/api/payments/webhook`) configured.
- [ ] WhatsApp Business API template approval & customer opt-in copy (or confirm click-to-WhatsApp fallback only).
- [ ] Authentic verified reviews and owner-licensed photography (replacing illustrative media in `public/media/`).

---

## 7. Payments: direct UPI to the owner's own account (default)

Same concept as Grain Bazar: no gateway, no fees.

1. Owner opens **Admin → UPI Settings**, enters the UPI ID from their UPI app's profile (e.g. `9876543210@ybl`; a bare phone number is refused), the payee name, and switches payments on. A ₹1 test QR appears so the owner can confirm money really lands in their account.
2. A customer holds seats; the booking page shows the exact amount, a QR, UPI-app buttons and a countdown. After paying they type the 12-digit UPI reference (UTR).
3. Seats stay held while **Admin → Payments** shows the payment. Staff check their bank/UPI app and press **Money received** (booking → deposit paid / confirmed), **Not received — let customer retry**, **Not received — cancel booking**, or for a late payment whose seats were taken, **Money returned — mark refunded**.

Rules enforced in the database (`supabase/migrations/202611120003_upi_direct_payments.sql`) and mirrored in the local preview store: one UTR pays once ever; one payment waiting per booking; the amount always comes from the booking, never the browser; a customer who pays after the hold expires keeps the seats if still free, otherwise the payment is flagged for refund (never overbooked); only owner/ops can decide; only the owner can change the UPI ID; every decision is audit-logged.

`npm test` runs every money flow against both the real migrations (in-process Postgres via PGlite) and the local store.

Razorpay remains available: set `PAYMENT_PROVIDER=razorpay` with all three Razorpay keys.

## 8. Design system

Astryx (Meta, MIT) with the Sanchari brand theme in `src/themes/sanchari/` (rebuild after edits: `npm run astryx -- theme build src/themes/sanchari/sanchariTheme.ts`). Brand palette tokens and utilities (`bg-ocean`, `btn-sunset`, `card-soft`, …) live in `src/app/globals.css`. Motion components (hero film, S-road route, seat map, reveal, count-up) are in `src/components/motion/`; review them at `/motion-preview`.

## 9. Admin panel (separate from the storefront)

- **Address:** `/admin` — nothing on the storefront links to it, it is kept out of search engines by an `X-Robots-Tag: noindex` header (not listed in `robots.txt`, which would advertise it), and it has its own layout.
- **Own domain (recommended in production):** set `ADMIN_HOST=admin.yourdomain.in`. The admin and its APIs then answer only on that host; the public site returns 404 for `/admin`, and opening the admin host goes straight to the panel.
- **Sign-in:** Supabase Auth user + a row in `public.staff_roles` (`owner`, `ops` or `support`). Support is read-only; only the owner can change the UPI account.
- **Sections:** Overview (what needs attention, next 14 days), Payments, Bookings, Dates & seats, Waitlist, Trips (details, prices, photos & videos, inclusions, day-by-day, pickup points), Text & policies (brand & contact, social & WhatsApp, booking rules, FAQs, legal), Reviews, Media library (Supabase Storage bucket `media`), UPI payments, Audit log.
- **Safety rules in the database** (`supabase/migrations/202611130001_admin_content.sql`, tested in `tests/admin-content.test.ts`): seats per car never below seats taken; dates/cutoffs must make sense; dates or trips with bookings can't be deleted (cancel / hide instead); cancelling a date ends unpaid holds and reports paid bookings to refund; pickup points used by live bookings can't be deleted; itinerary saves are all-or-nothing; every change is audit-logged.
- **Preview mode** (no Supabase in `.env.local`): the panel opens with a role picker and sample data; content editing is disabled with a clear message.
