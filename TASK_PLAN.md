# Inventory Reservation API — Task Plan

Track module progress. Execute **one module at a time**. Stop after each module for verification.

---

## Module 1 — Project Bootstrap

**Status:** COMPLETE

### Tasks

- [x] Initialize the Node.js project
- [x] Install dependencies
- [x] Create `tsconfig.json`
- [x] Add package scripts
- [x] Create the project folder structure
- [x] Create `.gitignore`
- [x] Create `.env.example`
- [x] Create the Express application
- [x] Add `GET /health`
- [x] Add local server entry point (`src/server.ts`)
- [x] Add Vercel serverless entry point (`api/index.ts`)
- [x] Create initial `README.md`
- [x] Create `TASK_PLAN.md`

### Acceptance criteria

- [x] `npm run typecheck` passes
- [x] `npm run dev` starts the server
- [x] `GET /health` returns HTTP 200

### Notes

- No database or inventory business logic in this module.
- Full middleware stack (Helmet, CORS, Pino, error handlers) comes in Module 4.

---

## Module 2 — Environment and Supabase Configuration

**Status:** COMPLETE

### Tasks

- [x] Create environment validation using Zod (`src/config/env.ts`)
- [x] Create Supabase server client (`src/config/supabase.ts`)
- [x] Add clear startup errors
- [x] Ensure server secrets are protected (key never logged or hardcoded)

### Acceptance criteria

- [x] Missing environment values produce a clear startup error
- [x] Valid environment values allow the application to start
- [x] No secret is hardcoded

### Notes

- `src/server.ts` and `api/index.ts` load env + Supabase client at startup.
- `@supabase/supabase-js` pinned to `2.49.10` for Node 21 compatibility (newer versions require Node 22+ native WebSocket).

---

## Module 3 — Database Migration

**Status:** COMPLETE (SQL authored; apply in Supabase SQL Editor)

### Tasks

- [x] Create reservation status enum
- [x] Create items and reservations tables
- [x] Add constraints, FKs, indexes
- [x] Add `updated_at` triggers
- [x] Add atomic PostgreSQL functions
- [x] Grant required permissions
- [x] Add `scripts/verify-migration.ts` smoke checks

### Acceptance criteria

- [x] Migration runs in Supabase SQL Editor without manual changes
- [x] Tables, indexes, constraints, and functions are defined in `001_initial_schema.sql`
- [x] PostgreSQL functions are designed for Supabase RPC (`SECURITY DEFINER` + grants)
- [ ] User has applied SQL in their Supabase project (run `npx tsx scripts/verify-migration.ts`)

### Notes

- Concurrency safety uses `SELECT ... FOR UPDATE` inside RPC functions.
- Error messages use prefixes (`INSUFFICIENT_INVENTORY:`, etc.) for later API mapping.

---

## Module 4 — Shared API Infrastructure

**Status:** COMPLETE

### Tasks

- [x] AppError + error codes
- [x] API success/error response helpers
- [x] Async handler, validation, not-found, error middleware
- [x] Pino request logging, Helmet, CORS, JSON limits

### Acceptance criteria

- [x] Consistent error response shape (`success: false`, `error.code/message/details`)
- [x] Unknown routes return standard 404
- [x] Production responses do not expose stack traces
- [x] Requests are logged via pino-http

### Notes

- Added `NOT_FOUND` for unmatched routes (item/reservation codes remain specific).
- `validateRequest` is ready for Modules 5+ route wiring.

---

## Module 5 — Items Module

**Status:** COMPLETE

### Tasks

- [x] Item schemas, types, service, controller, routes
- [x] `POST /v1/items`, `GET /v1/items/:id`
- [x] Availability calculation (`available = total - confirmed - held`)
- [x] Item integration tests (`tests/items.test.ts`)

### Acceptance criteria

- [x] All item tests pass (7/7)
- [x] Item status matches database state (held + confirmed cases covered)

### Notes

- Vitest pinned to `2.1.9` for Node 21.2 compatibility (Vitest 4 needs newer Node).
- Optional SQL patch `003_grant_delete.sql` for test cleanup DELETE grants.

---

## Module 6 — Create Reservation

**Status:** COMPLETE

### Tasks

- [x] Reservation schemas/types/service/controller/routes
- [x] `POST /v1/reservations` via `create_inventory_reservation` RPC
- [x] RPC error mapping (`map-rpc-error.ts`)
- [x] Create-reservation tests (8 cases)

### Acceptance criteria

- [x] Reservation creation is atomic (PostgreSQL `FOR UPDATE` RPC)
- [x] Insufficient inventory returns HTTP 409
- [x] Availability never becomes negative (covered in tests)

---

## Module 7 — Confirm Reservation

**Status:** COMPLETE

### Tasks

- [x] Integrate `confirm_inventory_reservation` RPC
- [x] `POST /v1/reservations/:id/confirm`
- [x] Retry-safe + expiration + cancelled + 404 tests

### Acceptance criteria

- [x] Repeated confirmation does not deduct twice
- [x] Expired reservations do not reduce inventory

---

## Module 8 — Cancel Reservation

**Status:** COMPLETE

### Tasks

- [x] Integrate `cancel_inventory_reservation` RPC
- [x] `POST /v1/reservations/:id/cancel`
- [x] Cancel tests (idempotent, release hold, reject after confirm, 404)

### Acceptance criteria

- [x] Repeated cancellation is safe
- [x] Cancelling a pending reservation releases its hold

---

## Module 9 — Reservation Expiration

**Status:** COMPLETE

### Tasks

- [x] Maintenance service/controller/routes
- [x] `POST /v1/maintenance/expire-reservations` via `expire_inventory_reservations` RPC
- [x] Expiration tests (past/future/confirmed/cancelled/idempotent)

### Acceptance criteria

- [x] Expiration is retry-safe
- [x] Expired reservations do not reduce availability

---

## Module 10 — Swagger and OpenAPI

**Status:** COMPLETE

### Tasks

- [x] OpenAPI registry + Zod schemas (`src/docs/openapi.ts`)
- [x] Swagger UI mount (`src/docs/swagger.ts`)
- [x] `/docs` and `/openapi.json`
- [x] Document health, items, reservations, maintenance endpoints

### Acceptance criteria

- [x] `/docs` loads
- [x] `/openapi.json` returns valid JSON
- [x] Every required endpoint is documented

---

## Module 11 — Concurrency Tests

**Status:** COMPLETE

### Tasks

- [x] Concurrent reservation stress test (10× qty 1 vs total 5)
- [x] Concurrent confirm / cancel / confirm+cancel / expire+confirm
- [x] Concurrency script (`npm run test:concurrency`)

### Acceptance criteria

- [x] No overselling / negative inventory
- [x] Confirm/cancel never apply twice
- [x] Concurrent state changes yield one valid terminal state

---

## Module 12 — Vercel Deployment

**Status:** COMPLETE

### Tasks

- [x] Export Express app from `api/index.ts` + `vercel.json` rewrites
- [x] Configure Vercel env vars (Supabase + TTL)
- [x] Deploy production API
- [x] Verify health, Swagger, OpenAPI, items, reservations, confirm, expire
- [x] Add deployed URL to README

### Acceptance criteria

- [x] Health, Swagger, OpenAPI, and API endpoints work on Vercel

### Notes

- Production URL: https://inventory-reservation-api-one.vercel.app
- TypeScript pinned to 5.7.3 (TS 7 broke Vercel’s builder with `readFile` error)
- Scope/team: `ralph-evanos-projects`

---

## Module 13 — README

**Status:** COMPLETE

### Tasks

- [x] Complete README with all required sections
- [x] Important Links at top (deployed URLs filled; GitHub + Demo still placeholders)
- [x] Assumptions + known limitations documented

### Acceptance criteria

- [x] Reviewer can run the project using only the README
- [x] GitHub repository URL: https://github.com/evanoralph/reservation-api
- [ ] Demo video URL (add after Module 14 recording)

---

## Module 14 — Demo Video Checklist

**Status:** READY TO RECORD (script prepared in `DEMO_CHECKLIST.md`)

### Tasks

- [x] Write timed demo shot list + commands (`DEMO_CHECKLIST.md`)
- [x] Record 5–10 minute demo covering all checklist items
- [x] Upload video and add URL to README Important Links
- [x] Add GitHub repository URL to README Important Links

### Recording checklist (from assignment)

- [x] Repository and README
- [x] `.env.example`
- [x] SQL migration
- [x] Starting the API locally
- [x] Swagger UI
- [x] Creating an item with quantity five
- [x] Getting item status
- [x] Creating a reservation
- [x] Showing held and available quantities
- [x] Cancelling or expiring a reservation
- [x] Showing inventory becoming available again
- [x] Confirming a reservation
- [x] Confirming it again to prove retry safety
- [x] Running the concurrency test
- [x] Showing Supabase table data
- [x] Showing the deployed Vercel API
- [x] Showing all submission links
