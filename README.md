# New India Exports (VISTARA) — Backend

Express + MongoDB API for the VISTARA / New India Exports hub. It powers the Vite frontend (`india-exports-hub-53`) with JWT auth, OTP login, KYC, export cases, document vault, Razorpay payments, plans/billing, events, and admin/ops tooling.

> **Note:** An earlier FastAPI/Python implementation was cut over to Express with the same `/api` contracts; the Python sources were removed.

---

## Stack

| Layer | Choice |
|--------|--------|
| Runtime | Node.js (CommonJS) |
| Framework | Express 4 |
| Database | MongoDB via Mongoose + native driver (`GridFSBucket` for files) |
| Auth | JWT (`Authorization: Bearer <token>`) |
| Payments | Razorpay (orders, verify, webhook) |
| Uploads | Multer → GridFS |
| Docs | Swagger UI + OpenAPI 3 (`/docs`) |
| Logging | Morgan |

**Default port:** `5001`

**Frontend pairing:** Vite app proxies `/api` → `http://127.0.0.1:5001`. Customer token is stored as `vistara_token`.

---

## Roles

| Role | Typical access |
|------|----------------|
| **customer** | Own profile, KYC, cases, vault uploads, billing, events, notifications |
| **operations** | Case workflow, KYC queue, vault review, ops dashboards |
| **admin** | Staff/RBAC, plans, analytics, audit, workflow templates; also inherits ops access where role checks allow |

Admin can satisfy routes that require `admin` or `operations`.

---

## Quick start

```bash
cd new-india-exports
cp .env.example .env   # fill secrets
npm install
# MongoDB must be running and reachable via MONGODB_URI
npm start              # or: npm run seed  then  npm start
```

On first empty DB, startup seeds:

- Bootstrap admin user / access request: `sanjay.r@newindiaexport.com`
- Default plans (Basic / Standard / Premium)
- Sample events and workflow cases (when collections are empty)

```bash
npm run seed   # run seed alone (same logic as startup seed-if-empty)
```

---

## Environment

Copy `.env.example` → `.env`. Never commit real secrets.

| Variable | Purpose | Default / notes |
|----------|---------|-----------------|
| `APP_ENV` | `development` / `production` | Docs off in production unless overridden |
| `PORT` | HTTP port | `5001` |
| `MONGODB_URI` | Connection string | required for persistence |
| `MONGODB_DB_NAME` | DB name | `new_india_exports` |
| `JWT_SECRET` | JWT signing key | **change in production** |
| `JWT_EXPIRE_HOURS` | Token TTL | `24` |
| `CORS_ORIGINS` | Comma-separated allowlist | local Vite origins |
| `RAZORPAY_KEY_ID` | Public key | used by `/api/config/public` |
| `RAZORPAY_KEY_SECRET` | Secret | order create / verify |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook HMAC | `/api/webhooks/razorpay` |
| `OTP_TTL_MINUTES` | OTP lifetime | `10` |
| `OTP_RATE_LIMIT` | OTP sends per window | `5` |
| `MAX_UPLOAD_BYTES` | Upload size cap | `5MB` |
| `WORKSHOP_AMOUNT_PAISE` | Workshop payment default | `639900` |
| `BOOKING_AMOUNT_PAISE` | Booking default | `100` |
| `ENABLE_DOCS` | Force Swagger on/off | `true` / `false`; default: on when not production |

---

## Project layout

```
server.js                 # Entry: CORS, webhook raw body, routes, Swagger, errors
config.js                 # Env → config object
db.js                     # Mongoose connect + GridFS bucket + indexes
docs/openapi.yaml         # OpenAPI 3 spec (~84 paths)
middleware/
  auth.js                 # JWT protect / roles / optionalAuth
  rateLimit.js            # OTP rate limiter
  swagger.js              # /docs, /openapi.json, /openapi.yaml
routes/                   # Domain routers (auth, staff, kyc, cases, vault, …)
services/                 # otp, razorpay, audit, helpers
scripts/seed.js           # Bootstrap admin, plans, events, sample cases
utils/                    # uploads, asyncHandler, iciciHash
models/                   # Legacy Order/Payment mongoose models (payments also use collections via services)
```

---

## API overview

Interactive docs (development): **http://127.0.0.1:5001/docs**

Raw spec: `/openapi.json`, `/openapi.yaml` · Alias: `/api-docs` → `/docs`

### Health

- `GET /` — `{ status: "New India Export Backend Running" }`

### Auth (`/api/auth`)

- `POST /otp/send`, `/otp/resend`, `/otp/verify` — email OTP (rate-limited); verify issues JWT
- `POST /customer/signup`, `/customer/login`
- `POST /staff/login`, `/staff/register`
- `GET /me`, `POST /logout`

### Staff & RBAC

- `/api/staff/access-requests`, `/users`, permissions patches
- `/api/rbac/matrix`

### KYC (`/api/kyc`)

- Customer: `/me`, business/identity, document upload/delete, submit
- Staff: `/queue`, approve/reject, document download

### Cases & workspace (`/api`)

- CRUD-ish `/cases`, stage approve/reject, activity
- `/workspace/search`, `/dashboard/overview`, `/ops/stats`

### Vault (`/api/cases/:caseId/...`)

- Document list/upload/content, approve/reject/comment, ZIP bundle, checklist

### Payments

- Order aliases: `POST /api/create-order`, `/api/payment/create-order`
- Verify aliases: `POST /api/verify-payment`, `/api/payment/verify`
- `POST /api/bookings`, `GET /api/payments/:paymentId`, `GET /api/config/public`
- `POST /api/webhooks/razorpay` — **raw body** + `X-Razorpay-Signature` (registered before JSON parser)

### Plans & billing

- `/api/plans` CRUD (admin writes)
- `/api/billing/subscription`, `checkout`, `invoices`, CSV/PDF export, `ledger`
- `/api/pricing/templates`

### Events

- `/api/events` CRUD + image upload, register, `/events/registrations/me`
- `/api/workshops/virtual-shipment/register`

### Me & notifications

- Profile, avatar, company, team invites
- `/api/me/notifications`, `/api/notifications`, mark read

### Admin

- `/api/admin/analytics/summary|detail`, `/audit`, workflow templates, `/pending-counts`

### Support & leads

- FAQs, articles, concierge book, tickets, `/api/leads/contact`

---

## Auth & security (Instance 1)

**In place**

- CORS allowlist
- JWT Bearer auth + role gates (`requireRoles`, `requireAdmin`)
- OTP rate limiting
- Upload size/type checks (Multer)
- Razorpay webhook signature verification
- Trust proxy enabled (for correct client IP behind reverse proxies)
- Swagger disabled when `APP_ENV=production` unless `ENABLE_DOCS=true`
- Production error responses hide internal stack details

**Intentionally deferred** (not yet production-hardened)

- Hashed OTP storage
- PII encryption at rest
- Antivirus scanning on uploads
- MFA for staff
- Full automated test suite

OTPs are treated as plain/dev-friendly for Instance 1. Rotate `JWT_SECRET` and Razorpay secrets before any real deployment.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` / `npm run dev` | Start Express (`node server.js`) |
| `npm run seed` | Seed DB if empty |
| `npm test` | Placeholder (no suite yet) |

---

## Frontend integration checklist

1. Vite proxy `/api` → `http://127.0.0.1:5001`
2. Send `Authorization: Bearer <token>` after OTP verify / staff login
3. Prefer `/api/payment/create-order` + `/api/payment/verify` (aliases also work)
4. Public Razorpay key from `GET /api/config/public` — do not hardcode live keys in the FE
5. Multipart uploads for KYC, vault, avatar, event images

---

## Migration history

1. Original backend was payment-focused Express + Razorpay.
2. Full product API was built in **FastAPI** (auth, KYC, cases, vault, billing, etc.).
3. Stack was **ported to Express** with matching route contracts for ops cost and long-term ownership.
4. Python sources were **removed** after cutover.

API shape should stay aligned with the OpenAPI file in `docs/openapi.yaml` when adding endpoints.

---

## Related repos

- Frontend: `VISTARA/india-exports-hub-53` (Vite + React)
- This repo: `VISTARA/new-india-exports` (Express API)
