// Kalshi public API client (read-only price oracle). The ONLY module that talks to
// Kalshi (DESIGN.md §3). Normalizes raw dollar-strings into integer cents and filters
// to liquid binary markets — the first pages of /markets are mostly zero-quote parlays.

import { config } from "./config";
import { dollarsToCents, isTradeablePriceCents, type Side } from "./money";

export type Quote = {
  ticker: string;
  yesBidCents: number | null;
  yesAskCents: number | null;
  noBidCents: number | null;
  noAskCents: number | null;
  lastCents: number | null;
  fetchedAt: number; // ms epoch when this quote was fetched from Kalshi
};

export type Market = {
  ticker: string;
  title: string;
  subtitle: string | null;
  category: string;
  status: string;
  closeTime: string | null;
  volume: number;
  quote: Quote;
};

type RawMarket = {
  ticker: string;
  title?: string;
  yes_sub_title?: string;
  subtitle?: string;
  category?: string;
  status?: string;
  close_time?: string;
  volume_fp?: number | string;
  yes_bid_dollars?: string | number;
  yes_ask_dollars?: string | number;
  no_bid_dollars?: string | number;
  no_ask_dollars?: string | number;
  last_price_dollars?: string | number;
  mve_collection_ticker?: string; // present => multivariate parlay, skip
};

type RawEvent = {
  event_ticker?: string;
  title?: string;
  category?: string;
  markets?: RawMarket[];
};

async function kalshiGet(path: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(config.kalshiBase + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.kalshiTimeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`Kalshi ${path} -> HTTP ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Friendly category chip from the ticker, e.g. KXNBAGAME-... -> "NBA". */
function deriveCategory(ticker: string): string {
  const head = ticker.replace(/^KX/, "").split("-")[0] ?? ticker;
  return head.replace(/GAME$/, "") || "OTHER";
}

function toQuote(m: RawMarket, fetchedAt: number): Quote {
  return {
    ticker: m.ticker,
    yesBidCents: dollarsToCents(m.yes_bid_dollars),
    yesAskCents: dollarsToCents(m.yes_ask_dollars),
    noBidCents: dollarsToCents(m.no_bid_dollars),
    noAskCents: dollarsToCents(m.no_ask_dollars),
    lastCents: dollarsToCents(m.last_price_dollars),
    fetchedAt,
  };
}

/** A market is tradeable for us if both YES and NO have an ask in 1..99c and it isn't a parlay. */
export function isLiquidBinary(m: RawMarket): boolean {
  if (m.mve_collection_ticker) return false;
  const yesAsk = dollarsToCents(m.yes_ask_dollars);
  const noAsk = dollarsToCents(m.no_ask_dollars);
  const vol = Number(m.volume_fp ?? 0);
  return (
    yesAsk != null &&
    noAsk != null &&
    isTradeablePriceCents(yesAsk) &&
    isTradeablePriceCents(noAsk) &&
    vol > 0
  );
}

function toMarket(m: RawMarket, e: RawEvent, fetchedAt: number): Market {
  return {
    ticker: m.ticker,
    // The event title is the question ("Who will the next Pope be?"); the market's
    // yes_sub_title is the specific option ("Pizzaballa").
    title: e.title ?? m.title ?? m.ticker,
    subtitle: m.yes_sub_title ?? m.title ?? null,
    category: e.category || m.category || deriveCategory(m.ticker),
    status: m.status ?? "unknown",
    closeTime: m.close_time ?? null,
    volume: Math.round(Number(m.volume_fp ?? 0)),
    quote: toQuote(m, fetchedAt),
  };
}

/**
 * Browse source. The default /markets feed is ~100% multivariate parlays; the liquid,
 * recognizable markets live nested under /events. We page events with nested markets,
 * flatten to liquid binaries, sort by volume, and return the top `target`. (Capping to
 * liquid + top-by-volume is a deliberate scoping choice — see README.)
 */
export async function fetchLiquidMarkets(target = 300, maxPages = 2): Promise<Market[]> {
  const fetchedAt = Date.now();
  const out: Market[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const params: Record<string, string> = {
      status: "open",
      limit: "200",
      with_nested_markets: "true",
    };
    if (cursor) params.cursor = cursor;
    const data = (await kalshiGet("/events", params)) as { events?: RawEvent[]; cursor?: string };
    for (const e of data.events ?? []) {
      for (const m of e.markets ?? []) if (isLiquidBinary(m)) out.push(toMarket(m, e, fetchedAt));
    }
    cursor = data.cursor || undefined;
    if (!cursor || out.length >= target * 3) break;
  }
  out.sort((a, b) => b.volume - a.volume);
  return out.slice(0, target);
}

/** Fetch a single market by ticker (used for detail pages of markets not in the browse set). */
export async function fetchMarket(ticker: string): Promise<Market | null> {
  const data = (await kalshiGet(`/markets/${encodeURIComponent(ticker)}`, {})) as {
    market?: RawMarket;
  };
  const m = data.market;
  if (!m) return null;
  return toMarket(m, { title: m.title, category: m.category }, Date.now());
}

/** Batch-fetch quotes for specific tickers in a single Kalshi call (DESIGN.md §1). */
export async function fetchQuotes(tickers: string[]): Promise<Quote[]> {
  if (tickers.length === 0) return [];
  const fetchedAt = Date.now();
  const data = (await kalshiGet("/markets", { tickers: tickers.join(",") })) as {
    markets?: RawMarket[];
  };
  return (data.markets ?? []).map((m) => toQuote(m, fetchedAt));
}

export type HistoryPoint = { ts: number; yesCents: number };

type RawCandle = {
  end_period_ts?: number;
  price?: { close_dollars?: string | number };
  yes_bid?: { close_dollars?: string | number };
  yes_ask?: { close_dollars?: string | number };
};

/**
 * Price history (YES, in cents) for a market via Kalshi candlesticks. Carries the last
 * known price forward across quiet buckets so the line never breaks. The series ticker is
 * the first segment of the market ticker (KXCITRINI-28JUL01 -> KXCITRINI).
 */
export async function fetchHistory(
  ticker: string,
  { lookbackSec = 7 * 86400, intervalMin = 60 }: { lookbackSec?: number; intervalMin?: number } = {},
): Promise<HistoryPoint[]> {
  const series = ticker.split("-")[0];
  const end = Math.floor(Date.now() / 1000);
  const start = end - lookbackSec;
  const data = (await kalshiGet(`/series/${series}/markets/${encodeURIComponent(ticker)}/candlesticks`, {
    start_ts: String(start),
    end_ts: String(end),
    period_interval: String(intervalMin),
  })) as { candlesticks?: RawCandle[] };

  const points: HistoryPoint[] = [];
  let last: number | null = null;
  for (const c of data.candlesticks ?? []) {
    const close = dollarsToCents(c.price?.close_dollars);
    const bid = dollarsToCents(c.yes_bid?.close_dollars);
    const ask = dollarsToCents(c.yes_ask?.close_dollars);
    const mid = bid != null && ask != null ? Math.round((bid + ask) / 2) : null;
    const v: number | null = close ?? mid ?? last;
    if (v != null && c.end_period_ts != null) {
      last = v;
      points.push({ ts: c.end_period_ts, yesCents: v });
    }
  }
  return points;
}

/** The ask (fill price) for a side, in cents, or null if not tradeable. */
export function askForSide(q: Quote, side: Side): number | null {
  const ask = side === "YES" ? q.yesAskCents : q.noAskCents;
  return ask != null && isTradeablePriceCents(ask) ? ask : null;
}
