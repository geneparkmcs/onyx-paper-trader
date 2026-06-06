// Order engine: the only writer of money (DESIGN.md §5.3, §8). All money-moving steps
// run in ONE transaction. Guarantees:
//  - server-authoritative price (fetched here; client price is only a slippage reference)
//  - atomic, race-safe balance (conditional decrement; concurrent orders can't overdraw)
//  - idempotency (pre-check + UNIQUE(userId, idempotencyKey) backstop for the race)
//  - bounded staleness + slippage protection

import { Prisma, type Fill, type Position } from "@prisma/client";
import { prisma } from "./db";
import { config } from "./config";
import { getQuote } from "./priceCache";
import { askForSide } from "./kalshi";
import { orderCostCents, weightedAvgCostCents, buySlippageExceeded } from "./money";
import type { OrderInput } from "./validation";

export type PlaceResult =
  | { status: "filled"; fill: Fill; position: Position; balanceCents: number }
  | { status: "duplicate"; fill: Fill }
  | { status: "price_unavailable" }
  | { status: "not_tradeable" }
  | { status: "slippage"; fillPriceCents: number }
  | { status: "insufficient_funds"; balanceCents: number; requiredCents: number };

class InsufficientFunds extends Error {}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export async function placeOrder(userId: string, input: OrderInput): Promise<PlaceResult> {
  const { ticker, side, qty, idempotencyKey, expectedPriceCents } = input;

  // 1. Idempotency fast-path: replay returns the original fill, no new money movement.
  const prior = await prisma.fill.findUnique({
    where: { userId_idempotencyKey: { userId, idempotencyKey } },
  });
  if (prior) return { status: "duplicate", fill: prior };

  // 2. Server-authoritative price (refreshed if stale). Never trust a client price.
  const quote = await getQuote(ticker);
  if (!quote || quote.stale) return { status: "price_unavailable" };
  const fillPriceCents = askForSide(quote, side);
  if (fillPriceCents == null) return { status: "not_tradeable" };

  // 3. Slippage protection vs. the price the user saw.
  if (buySlippageExceeded(expectedPriceCents, fillPriceCents, config.slippageTolCents)) {
    return { status: "slippage", fillPriceCents };
  }

  const costCents = orderCostCents(fillPriceCents, qty);

  // 4. Atomic transaction: conditional debit -> fill -> position upsert.
  try {
    return await prisma.$transaction(async (tx) => {
      const debit = await tx.user.updateMany({
        where: { id: userId, balanceCents: { gte: costCents } },
        data: { balanceCents: { decrement: costCents } },
      });
      if (debit.count === 0) throw new InsufficientFunds();

      const fill = await tx.fill.create({
        data: { userId, ticker, side, qty, fillPriceCents, costCents, idempotencyKey },
      });

      const existing = await tx.position.findUnique({
        where: { userId_ticker_side: { userId, ticker, side } },
      });
      const newQty = (existing?.qty ?? 0) + qty;
      const newAvg = weightedAvgCostCents(
        existing?.qty ?? 0,
        existing?.avgCostCents ?? 0,
        qty,
        fillPriceCents,
      );
      const position = await tx.position.upsert({
        where: { userId_ticker_side: { userId, ticker, side } },
        create: { userId, ticker, side, qty: newQty, avgCostCents: newAvg },
        update: { qty: newQty, avgCostCents: newAvg },
      });

      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { balanceCents: true },
      });
      return { status: "filled" as const, fill, position, balanceCents: user.balanceCents };
    });
  } catch (e) {
    if (e instanceof InsufficientFunds) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { balanceCents: true },
      });
      return {
        status: "insufficient_funds",
        balanceCents: user?.balanceCents ?? 0,
        requiredCents: costCents,
      };
    }
    // Concurrent duplicate slipped past the pre-check: the UNIQUE backstop tripped and the
    // transaction rolled back (no debit). Return the original fill.
    if (isUniqueViolation(e)) {
      const orig = await prisma.fill.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey } },
      });
      if (orig) return { status: "duplicate", fill: orig };
    }
    throw e;
  }
}
