// Pure money math. No I/O. Money is ALWAYS integer cents (1 contract resolves to
// 100c). These functions are exhaustively unit-tested (see money.test.ts) because
// every balance and P&L number in the app is built from them. (DESIGN.md §8, §10)

export type Side = "YES" | "NO";

/** A tradeable price is an integer 1..99 cents. 0 / 100 mean "no real market" for our purposes. */
export const MIN_PRICE_CENTS = 1;
export const MAX_PRICE_CENTS = 99;

export function isTradeablePriceCents(c: number): boolean {
  return Number.isInteger(c) && c >= MIN_PRICE_CENTS && c <= MAX_PRICE_CENTS;
}

/** Parse a Kalshi dollar string/number ("0.4700") into integer cents (47). Rounds to nearest cent. */
export function dollarsToCents(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "string" && v.trim() === "") return null; // Number("") === 0, guard it
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/** Format integer cents as a dollar string: 47 -> "0.47". */
export function centsToDollars(c: number): string {
  return (c / 100).toFixed(2);
}

/** Implied probability (%) of a YES price. 47c -> 47%. */
export function impliedProbabilityPct(yesCents: number): number {
  return yesCents;
}

/** Midpoint of a bid/ask in cents, rounded; null if either side is missing. */
export function midCents(bid: number | null, ask: number | null): number | null {
  if (bid == null || ask == null) return null;
  return Math.round((bid + ask) / 2);
}

/** Cost in cents to buy `qty` contracts at `priceCents`. Throws on invalid input. */
export function orderCostCents(priceCents: number, qty: number): number {
  if (!Number.isInteger(qty) || qty <= 0) throw new Error("qty must be a positive integer");
  if (!isTradeablePriceCents(priceCents)) throw new Error(`price ${priceCents}c is not tradeable (1..99)`);
  return priceCents * qty;
}

/**
 * New weighted-average cost (cents) after adding `addQty` contracts at `addPriceCents`
 * to an existing position of `oldQty` @ `oldAvgCents`. Rounded to the nearest cent.
 */
export function weightedAvgCostCents(
  oldQty: number,
  oldAvgCents: number,
  addQty: number,
  addPriceCents: number,
): number {
  if (oldQty < 0 || addQty <= 0) throw new Error("invalid quantities");
  const totalQty = oldQty + addQty;
  if (totalQty === 0) return 0;
  const totalCost = oldQty * oldAvgCents + addQty * addPriceCents;
  return Math.round(totalCost / totalQty);
}

/** Unrealized P&L (cents) of a position marked at `markCents`. */
export function unrealizedPnlCents(qty: number, avgCostCents: number, markCents: number): number {
  return (markCents - avgCostCents) * qty;
}

/** Current value (cents) of a position marked at `markCents`. */
export function positionValueCents(qty: number, markCents: number): number {
  return markCents * qty;
}

/**
 * Mark for a YES exposure given the available quote signals, using the "last" convention
 * (DESIGN.md §6): prefer last trade, fall back to mid, then to a one-sided quote.
 * Returns null if nothing usable. A NO mark is `100 - yesMark` (YES + NO = $1).
 */
export function yesMarkCents(
  lastCents: number | null,
  yesBidCents: number | null,
  yesAskCents: number | null,
): number | null {
  if (lastCents != null) return lastCents;
  const mid = midCents(yesBidCents, yesAskCents);
  if (mid != null) return mid;
  return yesBidCents ?? yesAskCents ?? null;
}

/** Mark for a given side derived from the YES mark. */
export function markForSide(side: Side, yesMark: number | null): number | null {
  if (yesMark == null) return null;
  return side === "YES" ? yesMark : 100 - yesMark;
}

/**
 * Adverse slippage check for a BUY: true if the actual ask is more than `tolCents`
 * ABOVE the price the user expected. A better (lower) price never blocks the fill.
 */
export function buySlippageExceeded(
  expectedCents: number | null | undefined,
  actualCents: number,
  tolCents: number,
): boolean {
  if (expectedCents == null) return false; // user didn't pin a price -> no protection requested
  return actualCents - expectedCents > tolCents;
}
