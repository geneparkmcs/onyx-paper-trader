import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { orderSchema } from "@/lib/validation";
import { placeOrder } from "@/lib/orders";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = orderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const r = await placeOrder(userId, parsed.data);
  switch (r.status) {
    case "filled":
      return NextResponse.json(
        { fill: r.fill, position: r.position, balanceCents: r.balanceCents },
        { status: 201 },
      );
    case "duplicate":
      return NextResponse.json({ fill: r.fill, duplicate: true }, { status: 200 });
    case "price_unavailable":
      return NextResponse.json(
        { error: "price unavailable or stale — try again in a moment" },
        { status: 409 },
      );
    case "not_tradeable":
      return NextResponse.json({ error: "no tradeable quote for that side" }, { status: 422 });
    case "slippage":
      return NextResponse.json(
        { error: "price moved", fillPriceCents: r.fillPriceCents },
        { status: 409 },
      );
    case "insufficient_funds":
      return NextResponse.json(
        { error: "insufficient funds", balanceCents: r.balanceCents, requiredCents: r.requiredCents },
        { status: 402 },
      );
  }
}

// Recent fills for the authenticated user (their order/trade history).
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  const fills = await prisma.fill.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ fills });
}
