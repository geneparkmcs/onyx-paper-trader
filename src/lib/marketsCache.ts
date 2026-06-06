// Browse cache: the market *set* changes slowly, so we cache the liquid-markets list for
// a short TTL (single-flight) and seed the price cache from it so the first price poll is
// warm. Live quote updates come separately via the price cache. (DESIGN.md §5)

import { fetchLiquidMarkets, type Market } from "./kalshi";
import { seedQuotes } from "./priceCache";

const TTL_MS = 30_000;
let cached: { at: number; markets: Market[] } | null = null;
let inflight: Promise<Market[]> | null = null;

export async function getMarkets(): Promise<Market[]> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.markets;
  if (inflight) return inflight;
  inflight = fetchLiquidMarkets()
    .then((markets) => {
      cached = { at: Date.now(), markets };
      seedQuotes(markets.map((m) => m.quote));
      return markets;
    })
    .catch((e) => {
      if (cached) return cached.markets; // serve last-good on upstream failure
      throw e;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
