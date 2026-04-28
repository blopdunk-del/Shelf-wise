# ShelfWise – Stock & Expiry Tracker (PWA)

## Original Problem Statement
Mobile-first web app (PWA) for retailers to track stock from purchase receipts and get expiry alerts. Receipt OCR, validation UI, inventory CRUD, expiry alerts (10 days), dashboard, ₹600/month membership with manual payment + admin approval, JWT login, manual add option.

## User Choices (gathered across iterations)
- OCR: OpenAI GPT-5.2 vision (via Emergent universal LLM key)
- Auth: Email/password JWT
- Payments: Manual UPI to QR `8919803257@fam` (Majid Hussain) + admin verification
- Notifications: In-app + email (SMTP optional, mocked otherwise)
- Admin: Auto-seeded `admin@medstore.com / Admin@12345`
- App is **generic retail** (rebrand: MedStore → ShelfWise) — works for pharmacy, grocery, cosmetics, supermarket, etc.
- **Free tier = NO app access**. Free users see only `/tutorial` (7-step walkthrough) and `/membership`. Premium (₹600/mo) unlocks the entire app.

## Architecture
- **Backend**: FastAPI single file (`server.py`), JWT auth, MongoDB (Motor), OCR via `emergentintegrations.LlmChat` (gpt-5.2 vision), background expiry-alert loop (24h cycle).
- **Frontend**: React 19 + Router, shadcn UI, Sonner toasts, mobile bottom-nav + desktop top-nav (only for premium users), pharmacy-friendly cream + deep teal + terracotta theme.
- **DB collections**: `users`, `medicines`, `payments`, `alerts`.

## Implemented
### Iter 1 (2026-04-27) — MVP
- JWT register/login/me, auto-seed admin
- Medicine CRUD, dashboard stats (total / expiring 10d / expired / total qty)
- Inventory listing with filter (all/expiring/expired), search, sort, edit, delete
- OCR `/api/ocr/extract` (image → JSON of items)
- Manual payment submit + bank/UPI details
- Admin: payments approve/reject (extends premium 30d), users grant/revoke/delete, stats
- Background daily expiry alert loop (in-app + email — **EMAIL MOCKED** when SMTP_HOST unset)
- Mobile-first PWA manifest + theme

### Iter 2 (2026-04-28) — Generic rebrand + premium gate + UPI QR + per-item alerts
- **Rebrand**: MedStore → ShelfWise; "Medicine" → "Item"; Pill → Boxes icon; tagline "Track every item in your store"
- **UPI QR + deep-link**: Membership page shows your QR (8919803257@fam · Majid Hussain) + "Pay ₹600 with UPI app" button using `upi://pay?...` scheme
- **Strict premium gate**: free users blocked from `/`, `/inventory`, `/add`, `/upload`, `/admin`. Backend returns 402 on protected endpoints.
- **7-step Tutorial** (`/tutorial`): guided walkthrough showing app features with sample data, ends with "Get Premium" CTA
- **Per-item notifications**: alerts collection now stores name/batch/qty/expiry per item; dashboard "Recent notifications" lists each item line-by-line
- **`/api/alerts/live`** endpoint returns currently-expiring items for in-app display

### Iter 3 (2026-04-28) — Smart manual renewal + 30-min SLA
- **Manual monthly renewal** (per user choice "Option B"): no payment gateway, keeps existing UPI QR
- **`/api/membership/status`** endpoint returns `is_premium`, `days_left`, `needs_renewal`, `activation_sla_minutes=30`
- **Top-of-app `<RenewalBanner>`** appears for premium users with ≤5 days remaining → "Premium expires in N days — Renew now" button → /membership (admin never sees banner)
- **Membership SLA card**: "Premium activates within 30 minutes of admin verifying your payment. Manual monthly renewal — admin manually approves every payment."
- **Background renewal reminders**: daily loop now also emails users 0–5 days before expiry (with 20h dedupe), saves to alerts collection with `type='renewal_reminder'`
- Admin still manually approves every payment (confirmed) — approve auto-extends premium 30d from current expiry (stacks correctly for renewals)

## Verified
- Iter 1: Backend 15/15 + Frontend = 100%
- Iter 2: Backend 18/18 + Frontend = 100%
- Iter 3: Backend 22/22 + Frontend = 100%
- Iter 4: Backend 27/27 + Frontend = 100%

### Iter 4 (2026-04-28) — Real PWA: Service Worker + Web Push + Install prompt
- **Service worker** (`/sw.js`): caches app shell, network-first for navigations, listens for `push` + `notificationclick`
- **Manifest** with 192×192 and 512×512 PNG icons (auto-generated, brand-colored), `display: standalone`, install prompt eligible
- **VAPID keys** generated and added to `.env` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY_PEM`, `VAPID_SUBJECT`)
- **Backend push endpoints** (4 new): `GET /api/push/vapid-public-key`, `POST /api/push/subscribe`, `DELETE /api/push/unsubscribe`, `POST /api/push/test`
- **Push subscriptions** stored in `push_subscriptions` MongoDB collection (upsert by endpoint, dedupes per-device)
- **Auto-cleanup**: failed pushes returning 410/404 auto-remove expired subscriptions
- **Alert loop integration**: when expiry/renewal alerts fire, push notifications sent in parallel (best-effort)
- **`<PwaBanners />`** UI on Dashboard: prompts user to enable notifications + offers "Install app" when `beforeinstallprompt` fires; can dismiss
- **`pywebpush==2.3.0`** added to requirements.txt

## Backlog
- P1: Replace native date inputs with shadcn Calendar+Popover (UX polish)
- P2: integrate Razorpay Subscriptions for true UPI Autopay (zero-touch renewals)
- P2: Wrap pywebpush sync I/O in `asyncio.to_thread()` once subscriber count grows
- P2: PDF receipt OCR
- P2: CSV export of inventory
- P3: Multi-store / staff accounts
- P3: Split server.py into routers

## Backlog
- P1: Configure real SMTP (`SMTP_HOST/USER/PASSWORD`) → real email delivery
- P1: Replace native date inputs with shadcn Calendar + Popover
- P1: Service-worker / push notifications for true PWA
- P1: Auto-renew via UPI Autopay/mandates (needs Razorpay/Cashfree integration)
- P2: PDF receipt OCR
- P2: Alert dedupe (don't re-email same items daily)
- P2: CSV export of inventory
- P2: WhatsApp alert channel via Twilio
- P3: Multi-store / staff accounts
- P3: Split server.py into routers (auth/medicines/payments/admin/ocr/alerts)
