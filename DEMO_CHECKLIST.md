# Module 14 — Demo Video Checklist

Record a **5–10 minute** walkthrough. Use this as a shot list + script.

**Target length:** ~7–8 minutes  
**Suggested tools:** Loom, QuickTime, OBS, or Zoom local recording  
**After recording:** upload (YouTube unlisted / Loom / Drive), paste the URL into README **Important Links** → Demo Video

---

## Before You Hit Record

- [ ] API runs locally: `npm run dev` → `http://localhost:3000/health` returns 200
- [ ] `.env` configured (do **not** show the service role key on screen)
- [ ] Supabase SQL Editor open in a browser tab (Tables: `items`, `reservations`)
- [ ] Deployed API works: https://inventory-reservation-api-one.vercel.app/health
- [ ] Terminal font large enough to read
- [ ] Hide secrets: zoom/crop away `.env` values; prefer showing `.env.example` only
- [ ] Optional: GitHub repo pushed and README link filled in

Warm-up commands (run once before recording so packages are cached):

```bash
npm run typecheck
curl -s http://localhost:3000/health
curl -s https://inventory-reservation-api-one.vercel.app/health
```

---

## Timed Shot List

### 1. Repository and README (~0:00–0:45)

- [ ] Show project folder / GitHub repo
- [ ] Open `README.md`
- [ ] Scroll **Important Links** (Deployed API, Swagger, OpenAPI)
- [ ] Briefly mention stack: Express, TypeScript, Supabase, Vercel

**Say:** “This is the Inventory Reservation API. The README has setup, architecture, and concurrency notes. Links for the live API and Swagger are at the top.”

---

### 2. `.env.example` (~0:45–1:00)

- [ ] Open `.env.example` (not `.env`)
- [ ] Point out `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESERVATION_TTL_MINUTES=10`

**Say:** “Local config comes from `.env.example`. The service role key stays server-side and is never committed.”

---

### 3. SQL migration (~1:00–1:45)

- [ ] Open `supabase/migrations/001_initial_schema.sql`
- [ ] Scroll to highlight: `reservation_status` enum, `items`, `reservations`, indexes
- [ ] Scroll to RPC names: `create_inventory_reservation`, `confirm_…`, `cancel_…`, `expire_…`
- [ ] Optional: show Supabase SQL Editor history / that migration already ran

**Say:** “Schema and atomic RPCs live in one SQL migration. Inventory checks use row locks inside PostgreSQL, not check-then-insert in Express.”

---

### 4. Starting the API locally (~1:45–2:15)

```bash
npm run dev
curl -s http://localhost:3000/health | jq .
```

- [ ] Show server listening log
- [ ] Show health JSON `{ "success": true, "data": { "status": "ok" } }`

---

### 5. Swagger UI (~2:15–2:45)

- [ ] Open http://localhost:3000/docs
- [ ] Show tags: Health, Items, Reservations, Maintenance
- [ ] Optional: open http://localhost:3000/openapi.json briefly

**Say:** “Swagger is served at `/docs`; the OpenAPI document is at `/openapi.json`.”

---

### 6–9. Create item → status → reserve → held/available (~2:45–4:30)

In terminal (or Swagger “Try it out”):

```bash
# Create item qty 5
curl -s -X POST http://localhost:3000/v1/items \
  -H 'Content-Type: application/json' \
  -d '{"name":"Demo White T-Shirt","initial_quantity":5}' | jq .

# Copy id into ITEM_ID
export ITEM_ID='<paste-id>'

curl -s http://localhost:3000/v1/items/$ITEM_ID | jq .
# Expect: available=5, held=0, confirmed=0

curl -s -X POST http://localhost:3000/v1/reservations \
  -H 'Content-Type: application/json' \
  -d "{\"item_id\":\"$ITEM_ID\",\"customer_id\":\"demo-customer\",\"quantity\":2}" | jq .

export RES_A='<paste-reservation-id>'

curl -s http://localhost:3000/v1/items/$ITEM_ID | jq .
# Expect: held=2, available=3, confirmed=0
```

- [ ] Show create item response
- [ ] Show get status before reserve
- [ ] Show create reservation (`PENDING`, `expires_at`)
- [ ] Show held=2 / available=3

**Say:** “Available equals total minus confirmed minus active held. Only non-expired PENDING rows count as held.”

---

### 10–11. Cancel (or expire) → inventory free again (~4:30–5:15)

**Option A — Cancel (clearest for demo):**

```bash
curl -s -X POST http://localhost:3000/v1/reservations/$RES_A/cancel | jq .
curl -s http://localhost:3000/v1/items/$ITEM_ID | jq .
# Expect: held=0, available=5
```

**Option B — Expire:**

```bash
# In Supabase SQL Editor (or Table Editor), set that reservation's expires_at to the past
curl -s -X POST http://localhost:3000/v1/maintenance/expire-reservations | jq .
curl -s http://localhost:3000/v1/items/$ITEM_ID | jq .
```

- [ ] Show cancel/expire response
- [ ] Show availability restored

---

### 12–13. Confirm + retry-safe second confirm (~5:15–6:15)

```bash
# New reservation
curl -s -X POST http://localhost:3000/v1/reservations \
  -H 'Content-Type: application/json' \
  -d "{\"item_id\":\"$ITEM_ID\",\"customer_id\":\"demo-confirm\",\"quantity\":2}" | jq .

export RES_B='<paste-id>'

curl -s -X POST http://localhost:3000/v1/reservations/$RES_B/confirm | jq .
curl -s http://localhost:3000/v1/items/$ITEM_ID | jq .
# Expect: confirmed=2, held=0, available=3

# Confirm AGAIN (retry-safe)
curl -s -X POST http://localhost:3000/v1/reservations/$RES_B/confirm | jq .
curl -s http://localhost:3000/v1/items/$ITEM_ID | jq .
# Expect: confirmed still 2 (not 4)
```

- [ ] First confirm → `CONFIRMED`, confirmed_quantity increases once
- [ ] Second confirm → still success, confirmed_quantity unchanged

**Say:** “Confirm is idempotent. Retrying the same reservation does not deduct inventory twice.”

---

### 14. Concurrency test (~6:15–7:15)

```bash
npm run test:concurrency
```

- [ ] Show output: **5** successes, **5** HTTP 409s
- [ ] Show final `available_quantity: 0`, `held_quantity: 5`
- [ ] Say “PASSED — no overselling”

Optional (if time):

```bash
npx vitest run tests/concurrency.test.ts
```

---

### 15. Supabase table data (~7:15–7:45)

- [ ] Supabase → Table Editor → `items` (show demo item totals/confirmed)
- [ ] `reservations` (show PENDING / CONFIRMED / CANCELLED rows)
- [ ] Do not linger on API keys

---

### 16. Deployed Vercel API (~7:45–8:30)

```bash
curl -s https://inventory-reservation-api-one.vercel.app/health | jq .
```

- [ ] Open https://inventory-reservation-api-one.vercel.app/docs
- [ ] Optional: Try it out → create a small item on production
- [ ] Mention env vars are set in Vercel (Supabase URL + service role)

---

### 17. Submission links wrap-up (~8:30–9:00)

- [ ] Return to README **Important Links**
- [ ] Read aloud:
  - GitHub repo
  - Deployed API
  - Swagger `/docs`
  - OpenAPI `/openapi.json`
  - Demo video (this recording)

**Say:** “That’s the full submission set — thanks for watching.”

---

## Post-Recording Checklist

- [ ] Upload video (unlisted YouTube / Loom / Drive with link access)
- [ ] Paste URL into [`README.md`](./README.md) → **Demo Video**
- [ ] Paste GitHub URL into README if not already done
- [ ] Re-deploy optional (only if README on Vercel matters; README is in the repo for reviewers)
- [ ] Watch once at 1.5x — confirm no secrets visible
- [ ] Mark Module 14 complete in [`TASK_PLAN.md`](./TASK_PLAN.md)

---

## If You Run Short on Time (priority order)

1. Create item qty 5 → reserve → show held/available  
2. Confirm twice (retry safety)  
3. `npm run test:concurrency`  
4. Deployed `/docs` + health  
5. README Important Links  

Skip polish (long SQL scrolling, full vitest suite) if needed.
