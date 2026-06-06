import { NextRequest, NextResponse } from "next/server";
import { getQuotes } from "@/lib/priceCache";
import { yesMarkCents } from "@/lib/money";

// Live quotes for a set of tickers. The client polls this for the tickers it's showing
// or holding; the price cache collapses the upstream calls. (DESIGN.md §5)
const MAX_TICKERS = 150;

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("tickers") ?? "";
  const tickers = [...new Set(raw.split(",").map((t) => t.trim()).filter(Boolean))].slice(0, MAX_TICKERS);
  if (tickers.length === 0) return NextResponse.json({ quotes: {}, asOf: Date.now() });

  const map = await getQuotes(tickers);
  const quotes: Record<string, unknown> = {};
  for (const [ticker, q] of map) {
    quotes[ticker] = {
      yesBidCents: q.yesBidCents,
      yesAskCents: q.yesAskCents,
      noBidCents: q.noBidCents,
      noAskCents: q.noAskCents,
      lastCents: q.lastCents,
      yesMarkCents: yesMarkCents(q.lastCents, q.yesBidCents, q.yesAskCents),
      ageMs: q.ageMs,
      stale: q.stale,
    };
  }
  return NextResponse.json({ quotes, asOf: Date.now() });
}
