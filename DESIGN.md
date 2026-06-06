# Paper-Trading App — Build Plan

A deployed web app for simulated ("paper") trading against live prediction-market prices.
Users sign up, get a paper balance, browse live markets, buy YES/NO, and track positions and
P&L. No order ever hits a real venue.

---

## 1. Data source

**Kalshi public API** (`https://api.elections.kalshi.com/trade-api/v2`) — primary.
(Onyx dev API is down for our purposes: market prices return `null` and auth endpoints hang,
so it can't fill an order. Kalshi reads are public, no key, and carry live quotes.)

Mechanics we rely on:
- Money is dollar-strings `"0.0000".."1.0000"`. **Buy YES → `yes_ask_dollars`, buy NO →
  `no_ask_dollars`.** Mark P&L at the bid/last for the held side.
- `GET /markets?tickers=a,b,c` returns many quotes in one call → cheap live fan-in.
- Filter to liquid binaries (`yes_ask_dollars` present **and** `volume_fp > 0`); the first
  page is mostly zero-quote parlays.

---

## 2. Tech choices & why

| Layer | Choice | Why | Trade-off / alternative |
|---|---|---|---|
| Framework | **Next.js** (App Router) | One deployable holds UI + API; clean `create-next-app` satisfies the "no pre-wired auth/db/deploy template" rule; React for live-updating UI. | A split SPA + API server is more "correct" at scale but doubles deploy/wiring under the clock. |
| DB | **SQLite** on a Fly volume, via **Prisma** | Zero provisioning, ACID transactions (all we need for atomic balance), single file, instant local dev. Prisma gives typed queries + migrations + parameterized SQL (injection-safe). | Single-instance only. Postgres needed for horizontal scale — deferred (see §9 scaling boundary). |
| Auth | **Rolled**: bcrypt + JWT in httpOnly cookie | Full control, no "pre-wired auth" dependency, small surface. bcrypt = slow hash; JWT in httpOnly+`SameSite` cookie = no token in JS (XSS-resistant). | Hand-rolled auth is easy to get subtly wrong; mitigated by tests (§10) and keeping it minimal. |
| Live data | **SWR client polling** → our cached `/api/prices` | Defensible, shippable, degrades gracefully; the server cache makes N viewers ≈ 1 upstream call. | WebSocket/SSE is lower-latency but more failure surface and Kalshi's WS needs RSA-signed auth — deferred. |
| Deploy | **Fly.io** (Dockerfile + 1 machine + volume) | Have creds; container + persistent volume fits SQLite; single region is fine for a demo. | No multi-region/HA — out of scope. |
| Money | **integer cents** everywhere | Floats drift across avg-cost/P&L; money math must be exact and reproducible. | Slightly more conversion code at the Kalshi string boundary. |

---

## 3. High-level architecture

```
  ┌─────────── Browser (React / Next client) ───────────┐
  │  market list · market detail + ticket · portfolio    │
  └───────┬───────────────────────────────▲─────────────┘
          │ SWR poll ~2s (/api/prices)     │ place order (/api/orders)
          ▼                                │
  ┌──────────────────────── Next.js server ─────────────────────────┐
  │  /api/prices ──▶ Price Cache ──single-flight batch──▶ Kalshi     │
  │                  {ticker: quote, fetchedAt}          (read-only  │
  │  /api/orders ──▶ Order Engine (authoritative price + atomic txn) │   oracle)
  │  /api/auth/*  ──▶ Auth (bcrypt, JWT cookie)                      │
  │                         │                                        │
  │                         ▼                                        │
  │   Prisma ──▶ SQLite:  users · fills · positions                  │
  └─────────────────────────────────────────────────────────────────┘
```

Component responsibilities:
- **Price Cache** — the single fan-in point to Kalshi; owns freshness, batching, single-flight,
  and timeouts. Nothing else talks to Kalshi.
- **Order Engine** — the only writer of money; owns the atomic fill transaction and every
  correctness guarantee in §7.
- **Auth** — issues/validates the session; every protected handler derives `user_id` from it.
- **Client** — expresses intent only; never holds an API key, never decides price or balance.

---

## 4. Data model

```
users
  id            pk
  username      unique
  password_hash
  balance_cents int   CHECK >= 0      -- seed 100_000 ($1,000)
  created_at

fills                                 -- append-only ledger = source of truth
  id               pk
  user_id          fk
  ticker
  side             YES | NO
  qty              int  CHECK > 0
  fill_price_cents int                -- snapshot of exact price used
  cost_cents       int
  idempotency_key
  created_at
  UNIQUE (user_id, idempotency_key)   -- dedup enforced by the DB, not just app code

positions                             -- projection of fills, updated in the fill's txn
  user_id  fk
  ticker
  side     YES | NO
  qty      int
  avg_cost_cents int
  PK (user_id, ticker, side)
```

`fills` is immutable and authoritative; `positions` is a convenience projection kept in sync
in the same transaction. Balance and P&L are reconstructable from the ledger alone. Invariants
(`CHECK`, `UNIQUE`, FK) live in the schema so the DB enforces safety even if app logic slips.

---

## 5. Flows

**Auth.** `register` → bcrypt hash + insert user (balance 100_000) → JWT cookie. `login` →
verify → JWT cookie. Every protected route resolves `user_id` from the session cookie, never
from a request param.

**Live prices.** Client computes visible ∪ held tickers → SWR-polls `/api/prices?tickers=…`
every ~2s → server serves from Price Cache, refreshing any entry older than the TTL via one
single-flight batched Kalshi call. N users on the same market = ~1 upstream call/sec.

**Place order (the money path) — one DB transaction:**
```
POST /api/orders { ticker, side, qty, idempotency_key, expected_price? }
  0. validate input (side ∈ {YES,NO}, qty > 0, fields present).   (boundary validation)
  1. user_id from session.                                        (authz)
  2. idempotency_key seen for this user? → return original fill, stop.
  3. price = PriceCache.fresh(ticker) or reject 409 if stale beyond bound.   (server price)
  4. fill_price = ask for side; if |fill_price - expected_price| > tolerance → reject 409.
                                                                  (slippage protection)
  5. cost = fill_price_cents * qty.
  6. UPDATE users SET balance = balance - cost
       WHERE id = ? AND balance >= cost     -- 0 rows → reject 402 insufficient funds
                                                                  (atomic, race-safe)
  7. INSERT fill (immutable; UNIQUE key is the idempotency backstop).
  8. UPSERT position: avg_cost = weighted avg of old + new.
  commit → return fill, new balance, updated position.
```

**Positions & P&L.** Per position: `mark = last_price for the held side`;
`unrealized = (mark - avg_cost) * qty`. Portfolio value = `balance + Σ(mark * qty)`. Updates
live on the same ~2s poll.

---

## 6. Execution & fill pricing (settled)

- **Fill at the ask** (buy YES @ `yes_ask`, buy NO @ `no_ask`), fetched server-side, snapshotted
  on the fill. The ask is not "a worse price" — it's the only price a buy can happen at; the
  bid is where you sell. Mid-price taker fills are not a real thing.
- **The spread is real, not a bug** (`yes_ask + no_ask ≈ 1 + spread`). We do **not** hide it by
  mispricing the fill. Instead we **mark at `last_price`** so a fresh position doesn't read as a
  phantom loss — fill convention (ask) and mark convention (last) are separate knobs.
- **Slippage protection** (v1): the order carries the price the user saw (`expected_price`);
  reject if the live ask has moved beyond a tolerance. The correct answer to "don't surprise
  the user with a worse price" — refuse and let them retry, don't fake the price.
- **Market order only** in v1. Limit orders (rest the order, watch the live price, fill on
  cross) are the flagship stretch but need a background watcher — out of scope for the clock.

---

## 7. Runtime behavior & timing

How the key parts behave over wall-clock time.

**Tunable constants (env-driven, §9 config):**
| Constant | Default | Meaning |
|---|---|---|
| `POLL_INTERVAL` | 2s | client SWR refresh cadence |
| `PRICE_TTL` | 1s | cache entry refreshed from Kalshi if older than this on access |
| `STALE_BOUND` | 5s | older than this → UI shows "stale", **orders reject** (no fill against it) |
| `SLIPPAGE_TOL` | 2¢ | max ask drift between view and fill before reject |
| `KALSHI_TIMEOUT` | 1.5s | per upstream request; on timeout serve last-good + mark stale |

**Startup:** app boots → Prisma applies migrations → empty in-memory Price Cache. No background
threads required; the cache fills lazily, driven by client demand.

**Steady state (per ~2s tick):** each client requests only the tickers it's showing/holding →
`/api/prices` reads the cache; any entry older than `PRICE_TTL` triggers **one** batched Kalshi
refresh for the stale set (single-flight: concurrent requests for the same stale ticker await
the same in-flight fetch, they don't each call Kalshi). Cache-hit path is pure memory (sub-ms);
miss path is one Kalshi round-trip (~100–300ms) shared across all waiters.

**A fill, end to end:** `POST /api/orders` → validate → idempotency check → price read (cache
hit ≈ sub-ms; if >`PRICE_TTL`, one refresh) → atomic SQLite transaction (conditional debit +
fill insert + position upsert). Typical total well under ~10ms on a cache hit; the only variable
latency is a cold price refresh. The transaction is the serialization point — concurrent orders
on one balance are ordered by the DB, so they can't overdraw.

**Degradation timeline (Kalshi slow/down):** request times out at `KALSHI_TIMEOUT` → cache
keeps serving the last-good quote, now flagged stale → as entries age past `STALE_BOUND`, the UI
shows "prices delayed / trading paused" and the **order path rejects** rather than filling
against an unknown price. Reads degrade; writes refuse. When Kalshi recovers, the next access
refreshes and the stale flags clear. (This is exactly the Onyx-is-down scenario, handled.)

**Live-data transport — two independent hops (key note).** Freshness is the sum of two hops,
each independently poll-or-push:
| Design | Upstream (us↔Kalshi) | Downstream (us↔browser) | End-to-end staleness |
|---|---|---|---|
| v1 (chosen) | REST poll, `PRICE_TTL` | SWR poll, `POLL_INTERVAL` | ~`PRICE_TTL` + `POLL_INTERVAL` (≈3s worst) |
| +SSE down | REST poll | **SSE push** | ~`PRICE_TTL` (≈1s) — removes the client interval |
| full real-time | **Kalshi WS push** | SSE/WS push | sub-second, no rate limits |

Only the **upstream** is gated (Kalshi WS needs an API key; public access is REST-only). The
**downstream is ours** — SSE is available today, ungated. SSE downstream ~halves worst-case
staleness and turns N polling clients into one server loop pushing deltas (a real server-scale
/ bandwidth win), but **can't beat the upstream freshness floor** — the dramatic win needs
upstream WS. Cost of SSE: a server-side poll loop to drive pushes + a deploy allowing long-lived
connections (Fly does; serverless would time the stream out). v1 stays poll/poll for zero
credentials and minimal moving parts under the clock; SSE-downstream then upstream-WS is the
upgrade order.

---

## 8. Correctness non-negotiables

The guarantees the order path must satisfy (each covered by tests in §10):

1. **Server-authoritative price** — fill price is the server's fresh quote; a client `price` is
   never the fill price (only the slippage reference).
2. **Atomic, race-safe balance** — conditional `UPDATE ... WHERE balance >= cost` inside the txn;
   two concurrent orders can't overdraw.
3. **Idempotent orders** — same `idempotency_key` returns the original fill; no double-debit
   (app check + `UNIQUE` backstop).
4. **Bounded staleness** — never fill against a quote older than `STALE_BOUND`.
5. **Authz** — a user can only read/act on their own account, positions, and orders.
6. **Integer-cents money math** — no floats; avg-cost and P&L exact.

---

## 9. Cross-cutting engineering principles

Applied throughout, beyond the order-path guarantees:

- **Single-flight / cache-stampede prevention** — one in-flight refresh per ticker; concurrent
  callers share it. Protects Kalshi and bounds our own latency under load.
- **Defense in depth** — money invariants enforced in the schema (`CHECK`, `UNIQUE`, FK), not
  only in app code.
- **Validation at the boundary** — every request schema-validated before any money logic runs;
  malformed input is rejected, not coerced.
- **Security beyond authz** — bcrypt password hashing; JWT in httpOnly + `SameSite` cookie
  (XSS/CSRF posture); Prisma-parameterized queries (no SQL injection); escaping external Kalshi
  strings on render; secrets in env, never committed.
- **Observability** — structured logs of the order lifecycle (intent → price → fill/reject) and
  metrics on upstream latency, error rate, and cache-hit rate. Every fill is explainable after
  the fact.
- **Separation of concerns / testable core** — pure domain logic (money math) isolated from I/O
  adapters (DB, Kalshi HTTP). This is *why* §10's logic tests are fast and exhaustive.
- **12-factor config** — `STALE_BOUND`, `POLL_INTERVAL`, seed balance, JWT secret, etc. are
  env-driven; behavior tunes without code changes.
- **Known scaling boundary** — in-memory cache + SQLite = single-instance by design. The
  documented horizontal-scale path is externalize cache → Redis and DB → Postgres; called out
  rather than pretended away.

---

## 10. Testing (unit-first, money paths covered heavily)

Money correctness is mostly **pure functions** — test them exhaustively, fast, no I/O.

**Pure logic (the bulk):**
- `cost(price_cents, qty)` — rounding, boundaries (1¢, 99¢), zero/negative qty rejected.
- `weightedAvgCost(oldQty, oldAvg, newQty, fill)` — first buy, averaging up/down, large numbers.
- `unrealizedPnl(qty, avgCost, mark)` — up, down, flat, after multiple fills.
- `portfolioValue(balance, positions, marks)`.
- `dollarsToCents` / parse Kalshi `"0.4700"` — rounding, malformed input.
- `slippageExceeded(expected, actual, tol)` — at/over/under bound, both directions.
- `liquidMarketFilter` — keeps real binaries, drops zero-quote parlays.

**Order engine (in-memory / test transaction):**
- Successful buy debits balance, writes fill, upserts position — all consistent.
- Insufficient funds → rejected, no balance change, no fill.
- Idempotency: same key twice → one fill, one debit; second returns the original.
- Concurrency: two orders racing one balance → exactly one succeeds (no overdraw).
- Stale price → rejected, no state change.
- Slippage beyond tolerance → rejected, no state change.
- Ledger invariant: `balance + Σ cost_cents == seed`.

**Auth / authz:** password hashed (never returned plaintext); wrong password rejected; protected
route without/with bad token → 401; user A cannot touch user B's account/positions (IDOR).

**Kalshi client (mocked HTTP):** parses quotes; timeout/5xx → serve last-good + mark stale, no
crash; single-flight collapses concurrent refreshes to one call.

Target: every §8 guarantee has a test that fails if it breaks. Pure-logic tests run in ms.

---

## 11. Scope

**v1 (build):** auth · seeded balance · browse + search/filter · live prices · market buy
YES/NO with server price + idempotency + slippage protection · positions · unrealized P&L ·
the §10 tests · deploy to Fly · README.

**Stretch (if clock allows):** close/sell at bid (realizes P&L) · limit orders.

**Out of scope (name in README):** settlement/resolution payout · WebSocket feed ·
multi-instance scaling · password reset · charts.

---

## 12. Build sequence

1. `create-next-app` (clean) → first commit (starts the clock) · Prisma schema + SQLite.
2. Auth (register/login/session) + seeded balance + authz helper.
3. Pure money-logic module + its unit tests (§10 logic).
4. Kalshi client + Price Cache (single-flight) + `/api/prices`.
5. Order engine (`/api/orders`) + its tests (§10 order engine).
6. UI: market list (search/filter, live ticking) → market detail + order ticket (payout
   preview) → portfolio (live P&L).
7. README (run locally, design decisions, next steps) · Dockerfile · deploy to Fly.
