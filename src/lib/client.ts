// Client-side data types (kept local so we never import server modules into the bundle)
// and a small fetcher for SWR.

export type Quote = {
  yesBidCents: number | null;
  yesAskCents: number | null;
  noBidCents: number | null;
  noAskCents: number | null;
  lastCents: number | null;
  yesMarkCents?: number | null;
  ageMs?: number;
  stale?: boolean;
};

export type Market = {
  ticker: string;
  title: string;
  subtitle: string | null;
  category: string;
  status: string;
  closeTime: string | null;
  volume: number;
  quote: Quote;
};

export type Side = "YES" | "NO";

export class ApiError extends Error {
  status: number;
  info: Record<string, unknown>;
  constructor(status: number, info: Record<string, unknown>) {
    super(typeof info.error === "string" ? info.error : "request failed");
    this.status = status;
    this.info = info;
  }
}

export const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new ApiError(r.status, await r.json().catch(() => ({})));
  return r.json();
};

export async function postJson(url: string, body: unknown) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const info = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, info);
  return info;
}

/** A random idempotency key for an order attempt. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
