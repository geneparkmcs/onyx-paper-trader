import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the price oracle so order-engine tests are deterministic (no network).
vi.mock("./priceCache", () => ({ getQuote: vi.fn() }));

import { getQuote, type CachedQuote } from "./priceCache";
import { prisma } from "./db";
import { placeOrder } from "./orders";
import { config } from "./config";

const mockGetQuote = vi.mocked(getQuote);

function quote(over: Partial<CachedQuote> = {}): CachedQuote {
  return {
    ticker: "T",
    yesBidCents: 46,
    yesAskCents: 47,
    noBidCents: 53,
    noAskCents: 54,
    lastCents: 47,
    fetchedAt: Date.now(),
    ageMs: 0,
    stale: false,
    ...over,
  };
}

let userCounter = 0;
async function newUser(balanceCents = 100_000) {
  userCounter += 1;
  return prisma.user.create({
    data: { username: `u${userCounter}_${process.pid}`, passwordHash: "x", balanceCents },
  });
}

beforeEach(() => {
  mockGetQuote.mockReset();
  mockGetQuote.mockResolvedValue(quote());
});

describe("placeOrder — happy path", () => {
  it("debits balance, writes a fill, and upserts a position consistently", async () => {
    const u = await newUser(100_000);
    const r = await placeOrder(u.id, {
      ticker: "NBA-X",
      side: "YES",
      qty: 10,
      idempotencyKey: `k-${u.id}`,
    });
    expect(r.status).toBe("filled");
    if (r.status !== "filled") return;
    expect(r.fill.fillPriceCents).toBe(47); // YES ask
    expect(r.fill.costCents).toBe(470);
    expect(r.balanceCents).toBe(100_000 - 470);
    expect(r.position.qty).toBe(10);
    expect(r.position.avgCostCents).toBe(47);

    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(fresh.balanceCents).toBe(100_000 - 470);
  });

  it("buys NO at the no-ask and averages cost across fills", async () => {
    const u = await newUser();
    await placeOrder(u.id, { ticker: "T", side: "NO", qty: 10, idempotencyKey: `a-${u.id}` });
    mockGetQuote.mockResolvedValue(quote({ noAskCents: 60 }));
    const r = await placeOrder(u.id, { ticker: "T", side: "NO", qty: 10, idempotencyKey: `b-${u.id}` });
    expect(r.status).toBe("filled");
    if (r.status !== "filled") return;
    // 10 @ 54, 10 @ 60 -> avg 57
    expect(r.position.qty).toBe(20);
    expect(r.position.avgCostCents).toBe(57);
  });
});

describe("placeOrder — guards", () => {
  it("rejects insufficient funds with NO balance change and NO fill", async () => {
    const u = await newUser(100); // can't afford 10 @ 47 = 470
    const r = await placeOrder(u.id, { ticker: "T", side: "YES", qty: 10, idempotencyKey: `k-${u.id}` });
    expect(r.status).toBe("insufficient_funds");
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(fresh.balanceCents).toBe(100);
    expect(await prisma.fill.count({ where: { userId: u.id } })).toBe(0);
  });

  it("rejects a stale price with no state change", async () => {
    mockGetQuote.mockResolvedValue(quote({ stale: true, ageMs: 9_999 }));
    const u = await newUser();
    const r = await placeOrder(u.id, { ticker: "T", side: "YES", qty: 1, idempotencyKey: `k-${u.id}` });
    expect(r.status).toBe("price_unavailable");
    expect(await prisma.fill.count({ where: { userId: u.id } })).toBe(0);
  });

  it("rejects when the side has no tradeable ask", async () => {
    mockGetQuote.mockResolvedValue(quote({ yesAskCents: null }));
    const u = await newUser();
    const r = await placeOrder(u.id, { ticker: "T", side: "YES", qty: 1, idempotencyKey: `k-${u.id}` });
    expect(r.status).toBe("not_tradeable");
  });

  it("rejects on adverse slippage beyond tolerance", async () => {
    const u = await newUser();
    // saw 44, actual ask 47 -> +3 > tol(2)
    const r = await placeOrder(u.id, {
      ticker: "T",
      side: "YES",
      qty: 1,
      idempotencyKey: `k-${u.id}`,
      expectedPriceCents: 44,
    });
    expect(r.status).toBe("slippage");
    if (r.status === "slippage") expect(r.fillPriceCents).toBe(47);
    expect(await prisma.fill.count({ where: { userId: u.id } })).toBe(0);
  });
});

describe("placeOrder — idempotency", () => {
  it("same key twice yields one fill and one debit; replay returns the original", async () => {
    const u = await newUser();
    const key = `dup-${u.id}`;
    const r1 = await placeOrder(u.id, { ticker: "T", side: "YES", qty: 5, idempotencyKey: key });
    const r2 = await placeOrder(u.id, { ticker: "T", side: "YES", qty: 5, idempotencyKey: key });
    expect(r1.status).toBe("filled");
    expect(r2.status).toBe("duplicate");
    if (r1.status === "filled" && r2.status === "duplicate") {
      expect(r2.fill.id).toBe(r1.fill.id);
    }
    expect(await prisma.fill.count({ where: { userId: u.id } })).toBe(1);
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(fresh.balanceCents).toBe(100_000 - 5 * 47);
  });
});

describe("placeOrder — concurrency", () => {
  it("two racing orders on a one-order balance: exactly one fills, no overdraw", async () => {
    const u = await newUser(470); // exactly enough for one 10 @ 47
    const [a, b] = await Promise.all([
      placeOrder(u.id, { ticker: "T", side: "YES", qty: 10, idempotencyKey: `a-${u.id}` }),
      placeOrder(u.id, { ticker: "T", side: "YES", qty: 10, idempotencyKey: `b-${u.id}` }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual(["filled", "insufficient_funds"]);
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(fresh.balanceCents).toBe(0); // never negative
    expect(await prisma.fill.count({ where: { userId: u.id } })).toBe(1);
  });
});

describe("ledger invariant", () => {
  it("balance + sum(fill costs) == seed", async () => {
    const seed = 100_000;
    const u = await newUser(seed);
    await placeOrder(u.id, { ticker: "T", side: "YES", qty: 3, idempotencyKey: `1-${u.id}` });
    await placeOrder(u.id, { ticker: "T", side: "NO", qty: 7, idempotencyKey: `2-${u.id}` });
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    const fills = await prisma.fill.findMany({ where: { userId: u.id } });
    const spent = fills.reduce((s, f) => s + f.costCents, 0);
    expect(fresh.balanceCents + spent).toBe(seed);
  });
});
