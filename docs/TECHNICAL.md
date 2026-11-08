# VIRASTRA — technical overview

Product name: **VIRASTRA by New India Export**. Public site: [https://www.virastrainternationalexport.com](https://www.virastrainternationalexport.com).

This is a two-app system. The browser app is a React single-page app. The API is a Node.js Express server. They are separate Git repositories, both hosted on Railway, and they share one MongoDB Atlas cluster and one Google Cloud Storage bucket.

This note describes how the system is built and run. It does not contain passwords, API secrets, or database connection strings. Those live in GitHub Actions secrets and are copied onto Railway.

---

## Repositories

| Piece | GitHub repo | What it is |
| --- | --- | --- |
| Frontend | `rennovatetechnologies/india-exports-hub-53` | Customer site, dashboards, admin and operations UI |
| Backend | `rennovatetechnologies/new-india-exports` | HTTP API (this repo). Current version **2.3.0** |

An earlier Python/FastAPI backend was replaced by this Express API. The `/api` contracts stayed the same. File storage used to be Google Drive and, before that, MongoDB GridFS. Customer files now go to Google Cloud Storage. GridFS is no longer the upload path.

---

## What the product does

VIRASTRA is the customer and operations platform for **New India Export**. A visitor can read about the company, browse export product categories, download brochures, and book a consultation or an event. A signed-in customer buys a service plan, completes KYC, and is taken through an export-readiness case (IEC, GST, bank, DGFT, ICEGATE, and related registrations) by the operations team. Staff run that queue. Admins run plans, events, staff access, and the payment ledger.

Three kinds of user:

| Actor | What they do |
| --- | --- |
| Visitor | Marketing site, product pages, brochures, events, contact, booking. No account required. |
| Customer | One account per email. Own plan, KYC, case, documents, messages, billing, and events. |
| Operations | Case queue, KYC review, document requests, stage updates, assignment. |
| Admin | Everything operations can do, plus staff approval, plans, events, brochures, community, analytics, and the payment ledger. |

A customer has at most one open case. Closed cases do not block a new one.

### Public site

- Home, about, gallery, and contact.
- Product categories: spices, cereals and pulses, organic food, fruits and vegetables, and others.
- Brochure library. Downloads come from the shared catalog, so dev and production serve the same files.
- Events list and an event landing page (schedule, price, registration).
- Consultation / booking request.
- Contact form and inbound leads.

### Accounts

- Customer signup and login by email OTP. No password.
- Forgot-password flow is present in the UI. Login itself is OTP, not a stored password.
- Staff login and staff registration. A registration stays pending until an admin approves it.
- Roles: customer, operations, admin. Admin can use operations screens.
- Session is a short-lived JWT (default 2 hours).
- Profile, company details, avatar, and notification preferences.
- Team invites on the customer account.

### Plans and checkout

- Three service packs: **Basic**, **Standard**, and **Premium**. Each pack lists the registrations and documents it includes (KYC, Shop Act, MSME, IEC, GST, current account, AD code, RCMC, phytosanitary, DSC, DGFT, ICEGATE, and similar steps). Admins can edit plans. Plan records are kept identical in the non-production and production databases.
- The customer selects a plan, then pays with Razorpay (card / UPI).
- Amounts at or above ₹1,00,000 can be split into 3 installments (10-day gap, 30-day window). A reminder job chases due installments.
- GST is 18% by default. A paid order produces a GST invoice (PDF) in the seller’s name, New India Export.
- The customer can see subscription status, invoices, and download invoice PDF or CSV. Staff can see the payment ledger.

### KYC

- The customer fills business and identity details and uploads documents (PAN, Aadhaar, bank statement, photo, address proof, GST certificate, and other items the plan requires).
- Documents are stored per customer under that environment’s file tree.
- The customer submits KYC. Operations or admin approve or reject it from the queue. Rejected items can be replaced and submitted again.
- The case does not move into active export work until KYC is approved and the plan is paid.

### Export case

This is the core operations workflow. Status runs roughly: no plan → unpaid → KYC incomplete → KYC pending → active → completed, and a case can be closed or a plan can expire.

- One case per customer email while it is open.
- Workflow stages come from the plan (IEC, GST, DGFT, ICEGATE, and the rest). Operations advance a stage, add a note, or send it back.
- Operations can assign a case to themselves or to someone on the ops roster.
- The customer sees the current stage, what is done, and what is next.
- Each side can post messages on the case.
- Operations can request a document. The customer uploads it. Staff can also attach files back to the customer (certificates, drafts).
- The customer’s document screen is the vault. Older “vault” links redirect there.

### Events, workshops, and bookings

- Public event catalog with detail pages.
- Registration, including a paid virtual-shipment workshop (default price ₹6,399) and a small booking fee (default ₹100).
- Registered customers see their registrations inside the dashboard.
- Admins create, edit, and delete events, upload an image, and notify registrants or all users when details change.
- Consultation bookings are stored and visible to staff.

### Community and updates

- A community feed (updates and upcoming posts). Customers see it only when community access is active.
- Access can come from the paid plan or from an expiry date an admin sets on the user.
- Admins publish, edit, and unpublish posts, and can turn the community requirement on or off.

### Support

- FAQs and help articles.
- Support tickets raised from the dashboard.
- Concierge booking.
- Contact leads from the public form.

### Notifications

- Email for OTP, case updates, event changes, and payment mail, sent through Resend. Failed mail is queued and can be retried.
- In-app notifications, with mark-as-read.
- WhatsApp is built (OTP and notification templates) and switched off until Meta credentials and approved templates are added.

### Operations workspace

- Queue of all cases, filterable by owner, KYC state, active, completed, and closed.
- Search by case id, customer email, plan, or legal name.
- Open a case and work the stage, documents, and messages.
- Dashboard counts for the day’s queue.

### Admin

- Approve, reject, or suspend staff access requests. Set who is operations and who is admin.
- Analytics summary: revenue, case volume, and month-on-month movement.
- Payment and invoice ledger (the audit screen), filterable by period.
- Plan editor and brochure uploads.
- Event editor.
- Community access editor.
- Activity audit log. Rows are kept for 7 days, then deleted.
- Retry failed email (and WhatsApp, when that channel is on).

### Explicitly out of the live product

- Password-based customer login. Access is email OTP.
- A public shipment-tracking vault. Those routes exist only if `ENABLE_LEGACY_SHIPMENT` is turned on. It is off in production.
- WhatsApp delivery, until the Cloud API credentials are filled in.

---

## How a request moves

```text
Browser
  → https://www.virastrainternationalexport.com          (frontend on Railway)
  → https://new-india-exports-production.up.railway.app  (API on Railway)
       → MongoDB Atlas          users, cases, payments, file metadata
       → Google Cloud Storage   the actual files (KYC, cases, invoices, brochures)
       → Razorpay               card / UPI checkout
       → Resend                 transactional email and email OTP
       → WhatsApp Cloud API     optional; switched off until credentials are set
```

Locally, the frontend does not call Railway. Vite proxies `/api` to `http://127.0.0.1:5001`.

In production the frontend calls the API by absolute URL. `VITE_API_BASE_URL` is baked in at build time. If that variable is missing from a production build, the app falls back to `https://new-india-exports-production.up.railway.app`.

---

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | React 19, React Router 7, Vite 6, Tailwind CSS 4 |
| Frontend hosting | Node 20 process that serves the built `dist/` folder (`serve`, SPA mode) |
| API | Node.js 20, CommonJS, Express 4 |
| Database | MongoDB Atlas via Mongoose 8 and the native driver |
| File storage | Google Cloud Storage (`@google-cloud/storage`). Local disk only if GCS credentials are missing |
| Auth | Email OTP, then a JWT (`Authorization: Bearer …`). Roles: `customer`, `operations`, `admin` |
| Payments | Razorpay (orders, verify, signed webhook) |
| Invoices | PDFKit, GST calculated in the API |
| Email | Resend. From-address domain: `virastrainternationalexport.com` |
| WhatsApp | Meta WhatsApp Cloud API (Graph). Off unless `ENABLE_WHATSAPP_*` is turned on |
| Validation | Zod |
| API docs | OpenAPI 3 in `docs/openapi.yaml`, Swagger UI at `/docs` |
| Logs | Morgan (health checks are not logged) |
| CI | GitHub Actions, Node 20 |
| Deploy | Railway, built with Nixpacks |

There is no separate compile step for the API. `npm run build` only syntax-checks the entry files. The frontend build is a real Vite production bundle.

---

## Database

**Host:** MongoDB Atlas. One cluster, two databases.

| Database | Used when |
| --- | --- |
| `virastra_nonprod` | Local development and any non-production `APP_ENV` |
| `virastra_prod` | `APP_ENV=production` (Railway) |

The API picks the database from `MONGODB_DB_NAME`. If that is unset, production uses `virastra_prod` and everything else uses `virastra_nonprod`.

Most data stays in the database for that environment: users, KYC, cases, payments, invoices, events, notifications, audit logs.

Two collections are written to **both** databases so marketing content stays identical: `plans` and `brochures`. Brochure file metadata is also copied into `files` on both databases. Events are not shared.

Audit rows in `audit_logs` expire after 7 days (`AUDIT_LOG_TTL_DAYS`). OTP and signup-draft documents expire on their own `expiresAt` field. Idempotency keys expire the same way.

Main collections (created by `npm run db:setup` if missing):

`users`, `otps`, `otp_verified`, `signup_drafts`, `staff_requests`, `customer_cases`, `case_messages`, `case_documents`, `doc_requests`, `plans`, `events`, `event_registrations`, `event_communications`, `installment_plans`, `notifications`, `brochures`, `payments`, `orders`, `invoices`, `bookings`, `support_tickets`, `leads`, `email_outbox`, `whatsapp_outbox`, `audit_logs`, `files`, `drive_folders`, `idempotency_keys`, `config`, `platform_posts`, `counters`.

Indexes are created on API startup (`db.js`) and again by `scripts/setupDatabases.js`. Examples: unique email on `users`, unique case id, one open case per customer email, unique Razorpay order id.

On an empty database, startup seeds a bootstrap admin (`sanjay.r@newindiaexport.com`), default plans, and sample events. `npm run seed` runs the same logic.

The API listens even if Atlas is unreachable, and retries the connection every 15 seconds. The machine’s public IP must be on the Atlas Network Access list. Railway’s outbound IPs must be allowed for production (or Atlas must allow the Railway egress range you use).

---

## File storage

**Provider:** Google Cloud Storage.

| Setting | Value |
| --- | --- |
| GCP project | `virastra-504906` |
| Bucket | `virastra` |
| Credentials on Railway | Service-account JSON in the `GCS_CREDENTIALS_JSON` variable (no key file on the server) |
| Credentials locally | Same JSON, or a key file via `GCS_KEY_FILE` / `GOOGLE_APPLICATION_CREDENTIALS` |

GCS has no real folders. The API writes zero-byte placeholder objects so the console shows a tree, then stores each upload as `{fileId}_{filename}` under that prefix. Mongo `files` holds the metadata (`id`, object path, mime type, size, md5). Downloads go through the API, not a public bucket URL.

Layout inside the bucket:

```text
gs://virastra/
  DEV/                         local and non-production uploads
    customers/{customer}/
      profile/
      kyc/
      cases/{caseId}/from-customer/
      cases/{caseId}/from-ops/
    admin/invoices/{year}/
    operations/
    _quarantine/
  PROD/                        same tree, production only
  SHARED/admin/brochures/      same PDFs for both environments
  SHARED/admin/catalogs/
```

`APP_ENV=production` writes under `PROD/`. Anything else writes under `DEV/`. Brochures always use `SHARED/`, so a brochure uploaded in dev is the one production serves.

If GCS credentials are missing, uploads fall back to a local directory (`.data/drive` in the API repo). That fallback is for a laptop only. Railway is expected to have GCS configured. Startup logs either `File storage ready (GCS gs://virastra/PROD)` or `local fallback`.

Upload limits (defaults):

| Kind | Limit |
| --- | --- |
| General upload | 5 MB |
| Case documents | 15 MB |
| Brochure PDF | 20 MB |
| Brochure image | 8 MB |

JSON request bodies are capped at 2 MB. File bytes go through Multer, then into GCS.

One-time bucket tree setup: `npm run gcs:init`.

---

## Auth, payments, mail

**Login.** The user asks for an email OTP (`POST /api/auth/otp/send`). Default lifetime is 10 minutes, and sends are rate-limited (5 per window). Verifying the code returns a JWT. Default token life is 24 hours (`JWT_EXPIRE_HOURS`). The browser stores it as `vistara_token`. Staff can also log in with the staff routes. Admin satisfies routes that allow either `admin` or `operations`.

**Payments.** The browser gets the Razorpay publishable key from `GET /api/config/public` (and, as a fallback, `VITE_RAZORPAY_KEY_ID`). The secret and webhook secret stay on the API. Checkout creates an order, the browser completes Razorpay, then the API verifies the payment. Razorpay also calls `POST /api/webhooks/razorpay`. That route is registered before the JSON body parser so the signature can be checked against the raw body (`X-Razorpay-Signature`). Local and dev use Razorpay **test** keys (`rzp_test_…`). Production uses **live** keys (`rzp_live_…`).

GST rate default is 18%. Workshop and booking amounts are configured in rupees (`WORKSHOP_AMOUNT_INR`, `BOOKING_AMOUNT_INR`). Installments apply above a threshold (default ₹1,00,000, 3 parts).

**Email.** Resend sends OTP and product mail. `MAIL_FROM` must be an address on the verified domain, not a Gmail address. Failed sends sit in `email_outbox` and can be retried from admin.

**WhatsApp.** Code is in place (Cloud API, templates, `whatsapp_outbox`) and is **disabled** (`ENABLE_WHATSAPP_NOTIFICATIONS=false`, `ENABLE_WHATSAPP_OTP=false`) until a phone number id, token, and approved templates exist.

---

## Environments

| | Local | Production |
| --- | --- | --- |
| Frontend | `http://localhost:5173` | `https://www.virastrainternationalexport.com` (also the apex domain, and the Railway URL `india-exports-hub-53-production.up.railway.app`) |
| API | `http://127.0.0.1:5001` | `https://new-india-exports-production.up.railway.app` |
| `APP_ENV` | `development` | `production` |
| Mongo database | `virastra_nonprod` | `virastra_prod` |
| GCS prefix | `DEV/` | `PROD/` |
| Razorpay | test key | live key |
| Rate limits | off by default (`DISABLE_RATE_LIMITS`) | on |
| Swagger `/docs` | on | on only if `ENABLE_DOCS=true` |

CORS allows localhost, `*.up.railway.app`, and `virastrainternationalexport.com` / `www`. The API sets `trust proxy` so client IPs are correct behind Railway. Railway has no usable outbound IPv6, so the process prefers IPv4 DNS (`NODE_OPTIONS=--dns-result-order=ipv4first`).

---

## Build

**API** (`new-india-exports`):

```bash
npm install
npm run build    # node --check on server.js, config.js, db.js
npm run check    # syntax-check routes, services, middleware, schemas
npm start        # node server.js  (Railway start command)
npm run dev      # node --watch server.js
```

Node 20 (`engines` and `nixpacks.toml`). There is no TypeScript compile and no test suite wired to `npm test` yet.

**Frontend** (`india-exports-hub-53`):

```bash
npm install
npm run dev      # Vite on port 5173, proxies /api to :5001
npm run build    # vite build → dist/
npm start        # node scripts/serve-spa.mjs
```

`serve-spa.mjs` serves `dist/` with `serve -s` (client-side routes fall back to `index.html`). Railway’s `PORT` is used in production; locally the script defaults to 4173. On start it can patch the Razorpay publishable key already baked into the JS bundle, because Vite freezes `VITE_*` at build time and a later Railway variable change does not rebuild the app by itself.

`VITE_ALLOW_AUTH_MOCK` must stay `false` for a real environment. `true` skips the API and opens a demo login.

---

## Deployment

Both apps deploy on **Railway**, builder **Nixpacks**, Node 20.

| Service | Build | Start | Health |
| --- | --- | --- | --- |
| API | Nixpacks default install | `npm start` | `GET /health` |
| Frontend | `npm run build` (also forced in `nixpacks.toml`, so a committed `dist/` is never what ships) | `node scripts/serve-spa.mjs` | Railway process up |

API restart policy: on failure, up to 5 retries. `GET /` returns `{ status, version, env }`. `GET /health` returns whether a Mongo URI is set and whether the database is connected. It does not check GCS or Razorpay.

**Secrets.** GitHub Actions secrets are the source of truth. Railway cannot read them during a git deploy. To push them:

1. Backend: `node scripts/pushGithubSecrets.js` (writes the secret names into GitHub).
2. Run the manual workflow **Sync GitHub secrets to Railway** in each repo (`.github/workflows/sync-railway-variables.yml`).
3. That workflow needs `RAILWAY_TOKEN`, `RAILWAY_PROJECT_ID`, and `RAILWAY_SERVICE_ID`. It sets each variable with the Railway CLI and redeploys.

Do not set `PORT` yourself. Railway injects it.

**CI.** On push or pull request to `main` or `master`:

- API: `npm install` and `npm run build` (syntax check only).
- Frontend: `npm ci` and `npm run build`, with the three `VITE_*` values taken from GitHub secrets.

A green CI run does not deploy. Railway deploys from the connected branch on its own.

Templates for variable names (no real secrets): `.env.example` and `.env.production.example` in each repo. Copy the local one to `.env` (API) or `.env.local` (frontend). Never commit those copies.

---

## Run it locally

Two terminals.

```bash
# API
cd new-india-exports
cp .env.example .env          # fill MONGODB_URI, JWT_SECRET, Resend, GCS
npm install
npm run db:setup              # optional: create both databases and indexes
npm start                     # http://127.0.0.1:5001
```

```bash
# Frontend
cd india-exports-hub-53
cp .env.example .env.local    # leave VITE_API_BASE_URL empty
npm install
npm run dev                   # http://localhost:5173
```

Swagger, when docs are enabled: [http://127.0.0.1:5001/docs](http://127.0.0.1:5001/docs). Raw spec: `/openapi.json` and `/openapi.yaml`.

In development, if email OTP is not actually delivered, the API logs the code on its own console.

---

## API surface (short)

All product routes are under `/api`. The OpenAPI file is the contract when adding endpoints.

| Area | Prefix |
| --- | --- |
| Auth and OTP | `/api/auth` |
| Staff and RBAC | `/api/staff`, `/api/rbac` |
| KYC | `/api/kyc` |
| Cases and workspace | `/api/cases`, `/api/workspace`, `/api/ops` |
| Files | `/api` file routes |
| Payments and Razorpay webhook | `/api/payment`, `/api/webhooks/razorpay` |
| Invoices and billing | `/api` invoice and billing routes |
| Plans, events, community | `/api/plans`, `/api/events`, community routes |
| Profile and notifications | `/api/me`, `/api/notifications` |
| Admin | `/api/admin` |
| Support and leads | `/api` support routes, `/api/leads` |

Legacy shipment vault routes mount only when `ENABLE_LEGACY_SHIPMENT=true`. That flag is false in production.
