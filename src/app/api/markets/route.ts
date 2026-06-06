import { NextResponse } from "next/server";
import { getMarkets } from "@/lib/marketsCache";

// Browse list. Quotes here are the snapshot at fetch; live updates come from /api/prices.
export async function GET() {
  try {
    const markets = await getMarkets();
    return NextResponse.json({ markets, asOf: Date.now() });
  } catch {
    return NextResponse.json(
      { error: "market data temporarily unavailable", markets: [] },
      { status: 503 },
    );
  }
}
