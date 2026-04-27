# MedStore – Medical Inventory & Expiry Tracker (PWA)

## Original Problem Statement
Mobile-first web app (PWA) for medical store owners to track medicine stock from purchase receipts and get expiry alerts. Receipt OCR, validation UI, inventory CRUD, expiry alerts (10 days), dashboard, ₹600/month membership with manual payment + admin approval, login, manual add option.

## User Choices (gathered)
- OCR: OpenAI GPT-5.2 vision (via Emergent universal LLM key)
- Auth: Email/password JWT
- Payments: Manual UPI/bank transfer + admin verification
- Notifications: In-app + email (SMTP optional, mocked otherwise)
- Admin: Auto-seeded `admin@medstore.com / Admin@12345`

## Architecture
- **Backend**: FastAPI single file (`server.py`) — JWT auth, MongoDB (Motor), OCR via `emergentintegrations.LlmChat` (gpt-5.2 vision), background expiry-alert loop (24h).
- **Frontend**: React 19, React Router, shadcn UI, Sonner toasts, mobile bottom-nav + desktop top-nav, pharmacy theme (cream + deep teal + terracotta).
- **DB collections**: `users`, `medicines`, `payments`, `alerts`.

## Implemented (Iteration 1 – 2026-04-27)
- JWT register/login/me; auto-seed admin
- Medicine CRUD with free-plan 10-item cap (HTTP 402)
- Dashboard stats (`/api/dashboard/stats`) — total, expiring 10d, expired, total qty
- Inventory listing with filter (all/expiring/expired) + server-side search
- OCR `/api/ocr/extract` (image → JSON of medicines)
- Manual payment submit + bank/UPI details endpoint
- Admin: payments approve/reject (extends premium 30d), users grant/revoke/delete, stats
- Background daily expiry alert loop (sends email if SMTP set; logs otherwise — **MOCKED**)
- Mobile-first PWA manifest + theme
- Pharmacy-friendly UI: large 56–64px tap targets, clean cream + teal palette

## Verified
Testing agent: Backend 15/15 + Frontend flows = 100% passing.

## Backlog (Next)
- P1: Swap native `<input type=date>` with shadcn Calendar/Popover for consistent UX
- P1: Auto-redirect admins to `/admin` after login
- P1: PWA service worker for offline support + install prompt + push notifications
- P2: Alert dedupe (don't email same expiring item daily)
- P2: PDF receipt OCR support
- P2: CSV export of inventory
- P2: Bulk-import from spreadsheet
- P2: Telegram/WhatsApp alert channel
- P3: Multi-store / staff accounts
