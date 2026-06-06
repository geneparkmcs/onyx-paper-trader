import { NextResponse } from "next/server";
import { getMarkets } from "@/lib/marketsCache";
import { fetchMarket } from "@/lib/kalshi";

export async function GET(_req: Request, ctx: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await ctx.params;
  try {
    const markets = await getMarkets();
    let market = markets.find((m) => m.ticker === ticker);
    if (!market) market = (await fetchMarket(ticker)) ?? undefined;
    if (!market) return NextResponse.json({ error: "market not found" }, { status: 404 });
    return NextResponse.json({ market });
  } catch {
    return NextResponse.json({ error: "market data unavailable" }, { status: 503 });
  }
}
