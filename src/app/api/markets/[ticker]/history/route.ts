import { NextResponse } from "next/server";
import { fetchHistory, type HistoryPoint } from "@/lib/kalshi";

// History changes slowly — cache per ticker for 60s so many viewers don't each hit Kalshi.
const TTL_MS = 60_000;
const cache = new Map<string, { at: number; points: HistoryPoint[] }>();

export async function GET(_req: Request, ctx: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await ctx.params;
  const hit = cache.get(ticker);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ points: hit.points, cached: true });
  }
  try {
    const points = await fetchHistory(ticker);
    cache.set(ticker, { at: Date.now(), points });
    return NextResponse.json({ points });
  } catch {
    if (hit) return NextResponse.json({ points: hit.points, stale: true });
    return NextResponse.json({ points: [] }, { status: 503 });
  }
}
