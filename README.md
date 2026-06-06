# Onyx Paper Trader

Paper-trade YES/NO on **live prediction-market prices**. Simulated orders fill instantly at the
current upstream price and are recorded against your own balance, positions, and P&L — nothing
ever hits a real venue.

**Live:** https://onyx-paper-trader.fly.dev — sign up to start with $1,000, or use the demo
account (credentials shared separately).

- Auth with per-user balance, order history, and positions (seeded with $1,000).
- Browse all liquid markets with search, category filters, and sort; **prices update live**.
- Buy YES/NO market orders that fill at the current ask; positions, fills, and **unrealized P&L**
  tracked against the latest price. A price-history chart on each market.

## Run locally

Requires Node 20+.

```bash
npm install
cp .env.example .env          # set JWT_SECRET; DATABASE_URL defaults to a local SQLite file
npx prisma migrate dev        # create the SQLite db + schema
npm run dev                   # http://localhost:3000

npm test                      # 32 unit tests (money math + order engine)
curl -X POST localhost:3000/api/dev/seed   # optional: seed the demo user (dev only; 404 in prod)
```

## Stack & key design decisions

Full architecture, runtime/timing, and the engineering rubric are in **[DESIGN.md](./DESIGN.md)**.
The short version:

- **Data source — Kalshi public API.** The Onyx dev API returns null prices and its auth endpoints
  hang, so it can't fill an order; Kalshi's public reads carry live quotes with no key. We browse
  via `/events` (the raw `/markets` feed is ~100% multivariate parlays) and filter to liquid
  binaries.
- **Next.js + SQLite/Prisma + rolled auth (bcrypt + httpOnly JWT).** One deployable, zero DB
  provisioning, ACID transactions — the simplest thing that's correct for paper trading. Single
  instance by design (documented scaling path: Redis + Postgres).
- **Money correctness is the spine.** Server-authoritative pricing (the client never names its own
  fill price), an atomic conditional debit (`UPDATE … WHERE balance >= cost`, so concurrent orders
  can't overdraw), and idempotent orders (key + a UNIQUE backstop). Money is integer cents
  end-to-end. These are the most-tested paths.
- **Live prices via polling + a single-flight server cache.** N viewers collapse to ~1 upstream
  call/sec; quotes refresh on access and serve last-good (then mark stale) when Kalshi hiccups.
  Defensible and shippable; see "next" for the push upgrade.
- **Honest execution.** Buy fills at the ask (the real price a buy happens at), mark P&L at last
  price, and reject on adverse slippage rather than surprising the user with a worse fill.

## What I'd do next

- **AI position advisor.** An LLM that reads the user's positions, balance, and live prices via
  read-only tools and returns natural-language guidance — portfolio concentration/risk, positions
  that have moved against their entry, and markets worth a look based on the user's activity.
  Clearly labeled paper-only, not financial advice.
- **Richer filtering** — probability buckets (toss-ups, longshots), close-date ranges, volume
  floors, and saved searches.
- **Close/sell + limit orders.** Selling at the bid to realize P&L, and limit orders (a background
  watcher fills when the live price crosses).
- **Settlement.** Pay out $1.00 per winning contract when a market resolves; today positions are
  marked but never settled.
- **Live-data upgrade.** Push instead of poll — SSE downstream (ungated, ~halves staleness) then
  Kalshi's WebSocket upstream (needs an API key) for true sub-second prices. (DESIGN.md §7.)
- **Observability.** Structured JSON logs of the order lifecycle and upstream failures already ship
  to stdout (`fly logs`); next is error tracking (Sentry) and latency/cache-hit metrics.
