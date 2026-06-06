// In-memory price cache: the single fan-in point to Kalshi (DESIGN.md §3, §7).
// - serves quotes from memory, refreshing entries older than PRICE_TTL on access
// - single-flight: concurrent refreshes for the same ticker share ONE upstream call
// - on upstream failure, keeps serving the last-good quote (which simply ages out)

import { config } from "./config";
import { fetchQuotes, type Quote } from "./kalshi";
import { log } from "./logger";

const cache = new Map<string, Quote>();
const pending = new Map<string, Promise<void>>(); // ticker -> in-flight refresh

export type CachedQuote = Quote & { ageMs: number; stale: boolean };

/** Seed the cache from a markets fetch so the first price poll is warm. */
export function seedQuotes(quotes: Quote[]): void {
  for (const q of quotes) cache.set(q.ticker, q);
}

async function refresh(tickers: string[]): Promise<void> {
  const need = tickers.filter((t) => !pending.has(t));
  if (need.length > 0) {
    const p = fetchQuotes(need)
      .then((quotes) => {
        for (const q of quotes) cache.set(q.ticker, q);
      })
      .catch((e) => {
        // keep last-good; the entry's age will grow and mark it stale
        log.warn("kalshi.prices.refresh_failed", { count: need.length, error: String(e) });
      })
      .finally(() => {
        for (const t of need) pending.delete(t);
      });
    for (const t of need) pending.set(t, p);
  }
  // Wait on every in-flight refresh covering a requested ticker (collapses duplicates).
  await Promise.all(tickers.map((t) => pending.get(t)).filter(Boolean) as Promise<void>[]);
}

/** Return current quotes for the tickers, refreshing any older than PRICE_TTL first. */
export async function getQuotes(tickers: string[]): Promise<Map<string, CachedQuote>> {
  const now = Date.now();
  const stale = tickers.filter((t) => {
    const q = cache.get(t);
    return !q || now - q.fetchedAt > config.priceTtlMs;
  });
  if (stale.length > 0) await refresh(stale);

  const out = new Map<string, CachedQuote>();
  const t1 = Date.now();
  for (const ticker of tickers) {
    const q = cache.get(ticker);
    if (!q) continue;
    const ageMs = t1 - q.fetchedAt;
    out.set(ticker, { ...q, ageMs, stale: ageMs > config.staleBoundMs });
  }
  return out;
}

/** Single quote, refreshed if stale. Used by the order engine for the authoritative price. */
export async function getQuote(ticker: string): Promise<CachedQuote | null> {
  const m = await getQuotes([ticker]);
  return m.get(ticker) ?? null;
}
