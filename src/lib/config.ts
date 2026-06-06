// Env-driven runtime knobs (DESIGN.md §7). Centralized so behavior tunes without
// code changes and tests can reason about the same constants the app uses.

function num(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  /** Seed paper balance for a new account, in cents ($1,000). */
  seedBalanceCents: num("SEED_BALANCE_CENTS", 100_000),
  /** Client SWR refresh cadence (ms). */
  pollIntervalMs: num("POLL_INTERVAL_MS", 2_000),
  /** A cached quote older than this is refreshed from Kalshi on access (ms). */
  priceTtlMs: num("PRICE_TTL_MS", 1_000),
  /** Older than this -> UI shows "stale" and orders refuse to fill (ms). */
  staleBoundMs: num("STALE_BOUND_MS", 5_000),
  /** Max adverse ask drift between the price the user saw and the fill, in cents. */
  slippageTolCents: num("SLIPPAGE_TOL_CENTS", 2),
  /** Per-request timeout when calling Kalshi (ms). */
  kalshiTimeoutMs: num("KALSHI_TIMEOUT_MS", 1_500),
  kalshiBase: process.env.KALSHI_BASE ?? "https://api.elections.kalshi.com/trade-api/v2",
} as const;
