# Inventory Reservation API

Backend API for managing inventory items and temporary inventory reservations.

Built with **Express.js**, **TypeScript**, **Supabase (PostgreSQL)**, and deployed on **Vercel**.

## Important Links

- GitHub Repository: [Add link]
- Deployed API: https://inventory-reservation-api-one.vercel.app
- Swagger UI: https://inventory-reservation-api-one.vercel.app/docs
- OpenAPI JSON: https://inventory-reservation-api-one.vercel.app/openapi.json
- Demo Video: [Add link]

Recording guide: see [DEMO_CHECKLIST.md](./DEMO_CHECKLIST.md) (Module 14 timed shot list).

---

## System Overview

This API lets clients create inventory items, place short-lived holds (reservations), then confirm or cancel those holds. Availability is always derived from:

1. Total stock on the item
2. Permanently confirmed quantity
3. Active pending holds that have not expired

Concurrency-critical writes run inside PostgreSQL functions using `SELECT … FOR UPDATE`, so Express never does a non-atomic “check then insert” flow.

---

## Features

- Create items with initial stock
- Read live inventory status (total / held / confirmed / available)
- Create `PENDING` reservations with configurable TTL (default 10 minutes)
- Confirm reservations (retry-safe)
- Cancel reservations (retry-safe)
- Manually expire stale pending reservations
- Atomic inventory checks under concurrent load
- Consistent JSON success/error envelopes
- Swagger UI + OpenAPI 3.0 document
- Deployed as a Vercel serverless Express app

---

## Architecture

```text
Client
  → Express routes + Zod validation
    → Thin controllers
      → Services
        → Supabase JS client
          → PostgreSQL tables / RPC functions (source of truth)
```

| Layer | Responsibility |
|-------|----------------|
| Routes | HTTP paths, validation middleware, OpenAPI registration (centralized in `src/docs`) |
| Controllers | Map request → service → HTTP response |
| Services | Business rules + Supabase/RPC calls + error mapping |
| PostgreSQL RPCs | Atomic transactions, row locks, inventory math |

---

## Inventory Calculation

```text
available_quantity =
  total_quantity - confirmed_quantity - held_quantity
```

- `held_quantity` = sum of quantities on reservations with `status = PENDING` and `expires_at > NOW()`
- Expired pending rows do **not** reduce availability (even before the maintenance job marks them `EXPIRED`)
- Confirming permanently increases `items.confirmed_quantity` once

---

## Concurrency Strategy

Unsafe pattern (not used):

1. Read availability in Express
2. Decide in Express
3. Insert reservation separately

Safe pattern (used):

1. Call `create_inventory_reservation` RPC
2. Lock the item row (`FOR UPDATE`)
3. Expire stale pending holds for that item
4. Compute availability
5. Insert `PENDING` reservation or raise `INSUFFICIENT_INVENTORY`

Confirm and cancel also lock the reservation (and item, for confirm) so concurrent retries cannot double-deduct or double-release.

Reproduce oversell protection:

```bash
npm run test:concurrency
# Expected: 5 successes, 5 HTTP 409s, available=0, held=5
```

---

## Reservation State Transitions

```text
          create
            │
            ▼
        PENDING ──────expire──────► EXPIRED
           │ ▲
           │ └──(expires_at elapsed; confirm also marks EXPIRED)
           │
     ┌─────┴─────┐
     ▼           ▼
 CONFIRMED    CANCELLED
```

| From | To | How |
|------|----|-----|
| — | `PENDING` | `POST /v1/reservations` |
| `PENDING` | `CONFIRMED` | `POST /v1/reservations/:id/confirm` |
| `PENDING` | `CANCELLED` | `POST /v1/reservations/:id/cancel` |
| `PENDING` | `EXPIRED` | `POST /v1/maintenance/expire-reservations` or confirm-after-TTL |
| `CONFIRMED` | — | Terminal (cancel rejected) |
| `CANCELLED` | — | Terminal (confirm rejected) |
| `EXPIRED` | — | Terminal (confirm/cancel rejected) |

Retry rules:

- Confirming an already `CONFIRMED` reservation returns success without increasing stock twice
- Cancelling an already `CANCELLED` reservation returns success without releasing twice

---

## Technology Stack

| Area | Choice |
|------|--------|
| Runtime | Node.js |
| HTTP | Express.js |
| Language | TypeScript |
| Validation | Zod |
| Database | PostgreSQL (via Supabase) |
| DB client | `@supabase/supabase-js` (service role) |
| Logging | Pino + pino-http |
| Security headers | Helmet |
| CORS | cors |
| Docs | `@asteasolutions/zod-to-openapi` + swagger-ui-express |
| Tests | Vitest + Supertest |
| Deploy | Vercel (`@vercel/node`) |

---

## Project Structure

```text
.
├── api/
│   └── index.ts                 # Vercel serverless entry (exports Express app)
├── src/
│   ├── app.ts                   # Express app + middleware + routes
│   ├── server.ts                # Local HTTP server
│   ├── config/                  # Env (Zod) + Supabase client
│   ├── common/                  # Errors, middleware, response helpers
│   ├── docs/                    # OpenAPI + Swagger mount
│   └── modules/
│       ├── health/
│       ├── items/
│       ├── reservations/
│       └── maintenance/
├── supabase/migrations/         # SQL schema + RPC functions
├── tests/                       # Integration + concurrency tests
├── scripts/                     # verify-migration, concurrency-test
├── vercel.json
├── package.json
├── tsconfig.json
├── .env.example
├── TASK_PLAN.md
└── README.md
```

---

## Prerequisites

- Node.js **20+** (Node **22+** recommended)
- npm
- A Supabase project (PostgreSQL)
- Optional: Vercel CLI for deploys (`npx vercel`)

---

## Environment Variables

Copy the example file and fill in secrets:

```bash
cp .env.example .env
```

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | `development` \| `production` \| `test` |
| `PORT` | No | `3000` | Local server port |
| `SUPABASE_URL` | **Yes** | — | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | — | Server-only service role key |
| `RESERVATION_TTL_MINUTES` | No | `10` | Pending reservation lifetime |

Never commit `.env` / `.env.local` or expose the service role key. Env values are validated with Zod at startup.

---

## Supabase Setup

1. Create a Supabase project
2. Copy **Project URL** → `SUPABASE_URL`
3. Copy **service_role** key (Settings → API) → `SUPABASE_SERVICE_ROLE_KEY`
4. Run the SQL migrations below
5. Confirm with `npx tsx scripts/verify-migration.ts`

Auth is out of scope; the API uses the service role key on the server only.

---

## SQL Migration Instructions

Run these in the Supabase **SQL Editor** (in order):

1. [`supabase/migrations/001_initial_schema.sql`](./supabase/migrations/001_initial_schema.sql)  
   Creates enum, tables, constraints, indexes, triggers, RPC functions, and grants.
2. [`supabase/migrations/002_disable_rls.sql`](./supabase/migrations/002_disable_rls.sql)  
   Only needed if inserts fail with RLS errors after an older `001`.
3. [`supabase/migrations/003_grant_delete.sql`](./supabase/migrations/003_grant_delete.sql)  
   Optional DELETE grants for test cleanup.

Verify:

```bash
npx tsx scripts/verify-migration.ts
```

RPC functions created:

- `create_inventory_reservation`
- `confirm_inventory_reservation`
- `cancel_inventory_reservation`
- `expire_inventory_reservations`

---

## Local Development

```bash
npm install
cp .env.example .env
# fill SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
npm run dev
```

Server: `http://localhost:3000`

```bash
curl http://localhost:3000/health
# → {"success":true,"data":{"status":"ok"}}
```

Other scripts:

```bash
npm run typecheck
npm run build
npm run start
npm test
npm run test:concurrency
npm run deploy
```

Quick happy-path curls:

```bash
# Create item
curl -s -X POST http://localhost:3000/v1/items \
  -H 'Content-Type: application/json' \
  -d '{"name":"White T-Shirt","initial_quantity":5}'

# Get status
curl -s http://localhost:3000/v1/items/<item-id>

# Reserve
curl -s -X POST http://localhost:3000/v1/reservations \
  -H 'Content-Type: application/json' \
  -d '{"item_id":"<item-id>","customer_id":"customer-001","quantity":2}'

# Confirm / cancel
curl -s -X POST http://localhost:3000/v1/reservations/<reservation-id>/confirm
curl -s -X POST http://localhost:3000/v1/reservations/<reservation-id>/cancel

# Expire stale holds
curl -s -X POST http://localhost:3000/v1/maintenance/expire-reservations
```

Docs locally:

- Swagger UI: http://localhost:3000/docs
- OpenAPI JSON: http://localhost:3000/openapi.json

---

## Test Instructions

Integration tests hit your real Supabase project using `.env`.

```bash
# All tests
npm test

# By area
npx vitest run tests/items.test.ts
npx vitest run tests/reservations.test.ts
npx vitest run tests/maintenance.test.ts
npx vitest run tests/concurrency.test.ts
```

Tests cover validation, availability math, confirm/cancel idempotency, expiration, and concurrency races.

---

## Concurrency Reproduction Commands

```bash
# Vitest suite (oversell, concurrent confirm/cancel, expire vs confirm)
npx vitest run tests/concurrency.test.ts

# Standalone script: item qty 5, 10 concurrent reserves of qty 1
npm run test:concurrency
```

Expected oversell outcome:

```text
5 successful reservations (HTTP 201)
5 HTTP 409 INSUFFICIENT_INVENTORY responses
available_quantity = 0
held_quantity = 5
No negative inventory / no oversell
```

---

## Vercel Deployment Instructions

Production deployment used in this submission:

**https://inventory-reservation-api-one.vercel.app**

1. Install/login CLI: `npx vercel login`
2. Link project (example scope shown — use your team):

```bash
npx vercel link --yes --project inventory-reservation-api --scope <your-team>
```

3. Set environment variables in the Vercel dashboard (or CLI) for Production/Preview:

   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `RESERVATION_TTL_MINUTES=10`
   - `NODE_ENV=production`

4. Deploy:

```bash
npm run deploy
# or: npx vercel --prod
```

5. Smoke test:

```bash
curl https://inventory-reservation-api-one.vercel.app/health
curl https://inventory-reservation-api-one.vercel.app/openapi.json
open https://inventory-reservation-api-one.vercel.app/docs
```

Entry point: [`api/index.ts`](./api/index.ts) (exports the Express app).  
Routing: [`vercel.json`](./vercel.json) rewrites all paths to `/api`.

---

## Endpoint Summary

| Method | Path | Description | Success |
|--------|------|-------------|---------|
| `GET` | `/health` | Liveness | 200 |
| `GET` | `/docs` | Swagger UI | 200 |
| `GET` | `/openapi.json` | OpenAPI document | 200 |
| `POST` | `/v1/items` | Create item | 201 |
| `GET` | `/v1/items/:id` | Item inventory status | 200 |
| `POST` | `/v1/reservations` | Create pending reservation | 201 |
| `POST` | `/v1/reservations/:id/confirm` | Confirm reservation | 200 |
| `POST` | `/v1/reservations/:id/cancel` | Cancel reservation | 200 |
| `POST` | `/v1/maintenance/expire-reservations` | Expire stale pendings | 200 |

### Response shapes

Success:

```json
{
  "success": true,
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_INVENTORY",
    "message": "The requested quantity is not available.",
    "details": null
  }
}
```

Common error codes: `VALIDATION_ERROR`, `ITEM_NOT_FOUND`, `RESERVATION_NOT_FOUND`, `INSUFFICIENT_INVENTORY`, `RESERVATION_EXPIRED`, `RESERVATION_ALREADY_CONFIRMED`, `INVALID_RESERVATION_STATE`, `DATABASE_ERROR`, `INTERNAL_SERVER_ERROR`, `NOT_FOUND`.

---

## Assumptions

- Reservation expiration defaults to **ten minutes** (`RESERVATION_TTL_MINUTES`)
- Customer IDs are external string identifiers (no user table)
- Authentication / authorization is outside the scope
- The maintenance expire endpoint is **manually** invoked (no cron/worker)
- Confirmed and cancelled rows are retained (not deleted)
- PostgreSQL `NOW()` is the source of truth for expiration decisions
- Reviewers apply SQL migrations in the Supabase SQL Editor

---

## Known Limitations and Trade-offs

- No authentication
- No automatic background expiration worker
- No inventory adjustment / restock endpoint after create
- No frontend
- No advanced monitoring / metrics beyond structured logs
- No pagination (datasets expected to stay small for this exercise)
- RLS is disabled for `items` / `reservations` because auth is out of scope; protect the service role key
- Implementation prioritized correctness and concurrency safety for a short take-home timebox

---

## Module Progress

See [TASK_PLAN.md](./TASK_PLAN.md) for the module-by-module checklist. Modules **1–13** are complete. Module **14** demo script is in [DEMO_CHECKLIST.md](./DEMO_CHECKLIST.md) — record the video, then paste the URL into Important Links above.
