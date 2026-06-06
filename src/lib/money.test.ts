import { describe, it, expect } from "vitest";
import {
  dollarsToCents,
  centsToDollars,
  isTradeablePriceCents,
  orderCostCents,
  weightedAvgCostCents,
  unrealizedPnlCents,
  positionValueCents,
  midCents,
  yesMarkCents,
  markForSide,
  buySlippageExceeded,
} from "./money";

describe("dollarsToCents", () => {
  it("parses Kalshi dollar strings", () => {
    expect(dollarsToCents("0.4700")).toBe(47);
    expect(dollarsToCents("0.01")).toBe(1);
    expect(dollarsToCents("0.99")).toBe(99);
    expect(dollarsToCents("1.0000")).toBe(100);
    expect(dollarsToCents("0.0000")).toBe(0);
  });
  it("rounds to the nearest cent", () => {
    expect(dollarsToCents("0.466")).toBe(47);
    expect(dollarsToCents("0.464")).toBe(46);
  });
  it("returns null for malformed input", () => {
    expect(dollarsToCents(null)).toBeNull();
    expect(dollarsToCents(undefined)).toBeNull();
    expect(dollarsToCents("abc")).toBeNull();
    expect(dollarsToCents("")).toBeNull();
  });
});

describe("centsToDollars", () => {
  it("formats cents as dollars", () => {
    expect(centsToDollars(47)).toBe("0.47");
    expect(centsToDollars(100)).toBe("1.00");
    expect(centsToDollars(5)).toBe("0.05");
  });
});

describe("isTradeablePriceCents", () => {
  it("accepts 1..99 integers only", () => {
    expect(isTradeablePriceCents(1)).toBe(true);
    expect(isTradeablePriceCents(99)).toBe(true);
    expect(isTradeablePriceCents(47)).toBe(true);
    expect(isTradeablePriceCents(0)).toBe(false);
    expect(isTradeablePriceCents(100)).toBe(false);
    expect(isTradeablePriceCents(47.5)).toBe(false);
  });
});

describe("orderCostCents", () => {
  it("multiplies price by quantity", () => {
    expect(orderCostCents(47, 10)).toBe(470);
    expect(orderCostCents(1, 1)).toBe(1);
    expect(orderCostCents(99, 3)).toBe(297);
  });
  it("rejects non-positive or non-integer qty", () => {
    expect(() => orderCostCents(47, 0)).toThrow();
    expect(() => orderCostCents(47, -1)).toThrow();
    expect(() => orderCostCents(47, 1.5)).toThrow();
  });
  it("rejects untradeable prices", () => {
    expect(() => orderCostCents(0, 1)).toThrow();
    expect(() => orderCostCents(100, 1)).toThrow();
  });
});

describe("weightedAvgCostCents", () => {
  it("first buy returns the fill price", () => {
    expect(weightedAvgCostCents(0, 0, 10, 47)).toBe(47);
  });
  it("averages up", () => {
    // 10 @ 40, then 10 @ 50 -> 45
    expect(weightedAvgCostCents(10, 40, 10, 50)).toBe(45);
  });
  it("averages down", () => {
    // 10 @ 60, then 30 @ 40 -> (600 + 1200)/40 = 45
    expect(weightedAvgCostCents(10, 60, 30, 40)).toBe(45);
  });
  it("rounds to the nearest cent", () => {
    // 1 @ 33, 1 @ 34 -> 33.5 -> 34
    expect(weightedAvgCostCents(1, 33, 1, 34)).toBe(34);
  });
  it("stays exact on large quantities (no float drift)", () => {
    expect(weightedAvgCostCents(1_000_000, 50, 1_000_000, 50)).toBe(50);
  });
});

describe("unrealizedPnlCents", () => {
  it("is positive when mark > avg cost", () => {
    expect(unrealizedPnlCents(10, 47, 55)).toBe(80);
  });
  it("is negative when mark < avg cost", () => {
    expect(unrealizedPnlCents(10, 47, 40)).toBe(-70);
  });
  it("is zero when flat", () => {
    expect(unrealizedPnlCents(10, 47, 47)).toBe(0);
  });
});

describe("positionValueCents", () => {
  it("marks the position", () => {
    expect(positionValueCents(10, 55)).toBe(550);
  });
});

describe("midCents", () => {
  it("rounds the midpoint", () => {
    expect(midCents(46, 47)).toBe(47); // 46.5 -> 47
    expect(midCents(40, 50)).toBe(45);
  });
  it("is null when a side is missing", () => {
    expect(midCents(null, 47)).toBeNull();
    expect(midCents(46, null)).toBeNull();
  });
});

describe("yesMarkCents / markForSide", () => {
  it("prefers last, then mid, then one-sided", () => {
    expect(yesMarkCents(47, 40, 50)).toBe(47);
    expect(yesMarkCents(null, 46, 48)).toBe(47);
    expect(yesMarkCents(null, 46, null)).toBe(46);
    expect(yesMarkCents(null, null, null)).toBeNull();
  });
  it("NO mark is 100 - YES mark", () => {
    expect(markForSide("YES", 47)).toBe(47);
    expect(markForSide("NO", 47)).toBe(53);
    expect(markForSide("NO", null)).toBeNull();
  });
});

describe("buySlippageExceeded", () => {
  it("blocks an adverse upward move beyond tolerance", () => {
    expect(buySlippageExceeded(47, 50, 2)).toBe(true); // +3 > 2
    expect(buySlippageExceeded(47, 49, 2)).toBe(false); // +2 == tol, allowed
  });
  it("never blocks a better (lower) price", () => {
    expect(buySlippageExceeded(47, 44, 2)).toBe(false);
  });
  it("is a no-op when no expected price was pinned", () => {
    expect(buySlippageExceeded(null, 99, 2)).toBe(false);
    expect(buySlippageExceeded(undefined, 99, 2)).toBe(false);
  });
});
