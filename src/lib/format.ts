// Client-safe formatting helpers. Prices are shown as both cents and implied probability,
// money as dollars (DESIGN.md §8).

export function usd(cents: number | null | undefined): string {
  if (cents == null) return "—";
  const v = Math.abs(cents) / 100;
  return `${cents < 0 ? "-" : ""}$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function signedUsd(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `${cents >= 0 ? "+" : "-"}$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function priceCents(cents: number | null | undefined): string {
  return cents == null ? "—" : `${cents}¢`;
}

/** Implied probability label for a YES price. */
export function probPct(yesCents: number | null | undefined): string {
  return yesCents == null ? "—" : `${yesCents}%`;
}

export function compactNumber(n: number): string {
  return n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });
}
