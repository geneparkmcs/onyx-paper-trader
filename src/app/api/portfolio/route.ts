import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getQuotes } from "@/lib/priceCache";
import {
  yesMarkCents,
  markForSide,
  positionValueCents,
  unrealizedPnlCents,
  type Side,
} from "@/lib/money";

// Positions + live unrealized P&L for the authenticated user (DESIGN.md §3.4).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  const positions = await prisma.position.findMany({
    where: { userId: user.id, qty: { gt: 0 } },
  });
  const tickers = [...new Set(positions.map((p) => p.ticker))];
  const quotes = await getQuotes(tickers);

  let positionsValueCents = 0;
  let totalCostCents = 0;
  let totalUnrealizedCents = 0;

  const rows = positions.map((p) => {
    const q = quotes.get(p.ticker);
    const yesMark = q ? yesMarkCents(q.lastCents, q.yesBidCents, q.yesAskCents) : null;
    const markCents = markForSide(p.side as Side, yesMark);
    const costCents = p.avgCostCents * p.qty;
    const valueCents = markCents != null ? positionValueCents(p.qty, markCents) : null;
    const pnlCents = markCents != null ? unrealizedPnlCents(p.qty, p.avgCostCents, markCents) : null;

    totalCostCents += costCents;
    if (valueCents != null) positionsValueCents += valueCents;
    if (pnlCents != null) totalUnrealizedCents += pnlCents;

    return {
      ticker: p.ticker,
      side: p.side,
      qty: p.qty,
      avgCostCents: p.avgCostCents,
      markCents,
      costCents,
      valueCents,
      unrealizedPnlCents: pnlCents,
      stale: q?.stale ?? true,
    };
  });

  return NextResponse.json({
    balanceCents: user.balanceCents,
    positions: rows,
    totals: {
      balanceCents: user.balanceCents,
      positionsValueCents,
      equityCents: user.balanceCents + positionsValueCents,
      totalCostCents,
      totalUnrealizedCents,
    },
    asOf: Date.now(),
  });
}
