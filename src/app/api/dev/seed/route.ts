import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { getMarkets } from "@/lib/marketsCache";
import { placeOrder } from "@/lib/orders";
import { config } from "@/lib/config";
import { DEMO } from "@/lib/client";
import type { Side } from "@/lib/money";

// Demo-data seeder. Open in dev; in production requires ?token=SEED_TOKEN. Creates a `demo`
// user (password demo12345) with a handful of real positions placed through the live engine.
export async function POST(req: NextRequest) {
  const isProd = process.env.NODE_ENV === "production";
  if (isProd) {
    const token = req.nextUrl.searchParams.get("token");
    if (!process.env.SEED_TOKEN || token !== process.env.SEED_TOKEN) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const username = DEMO.username;
  // Reset the demo user.
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    await prisma.fill.deleteMany({ where: { userId: existing.id } });
    await prisma.position.deleteMany({ where: { userId: existing.id } });
    await prisma.user.delete({ where: { id: existing.id } });
  }
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: await hashPassword(DEMO.password),
      balanceCents: config.seedBalanceCents,
    },
  });

  const markets = await getMarkets();
  // Pick a varied set across categories for a realistic-looking book.
  const picks: { ticker: string; side: Side; qty: number }[] = [];
  const seenCat = new Set<string>();
  for (const m of markets) {
    if (picks.length >= 6) break;
    if (seenCat.has(m.category)) continue;
    if (m.quote.yesAskCents == null || m.quote.noAskCents == null) continue;
    seenCat.add(m.category);
    const side: Side = picks.length % 2 === 0 ? "YES" : "NO";
    const qty = [25, 50, 40, 15, 60, 30][picks.length] ?? 20;
    picks.push({ ticker: m.ticker, side, qty });
  }

  const results = [];
  for (let i = 0; i < picks.length; i++) {
    const p = picks[i];
    const r = await placeOrder(user.id, {
      ticker: p.ticker,
      side: p.side,
      qty: p.qty,
      idempotencyKey: `seed-${user.id}-${i}`,
    });
    results.push({ ...p, status: r.status });
  }

  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  return NextResponse.json({
    user: { username, password: DEMO.password, balanceCents: fresh.balanceCents },
    orders: results,
  });
}
