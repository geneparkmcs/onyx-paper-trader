"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { fetcher, type Market } from "@/lib/client";
import { usePrices } from "@/lib/usePrices";
import { LivePrice } from "@/components/LivePrice";
import { compactNumber, probPct } from "@/lib/format";

const PAGE = 60;

export default function MarketsPage() {
  const { data, error, isLoading } = useSWR<{ markets: Market[] }>("/api/markets", fetcher, {
    refreshInterval: 30_000,
  });
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [sort, setSort] = useState<"volume" | "closing" | "chance-high" | "chance-low">("volume");
  const [limit, setLimit] = useState(PAGE);

  const markets = data?.markets ?? [];

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of markets) counts.set(m.category, (counts.get(m.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [markets]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return markets.filter((m) => {
      if (cat && m.category !== cat) return false;
      if (!needle) return true;
      return (
        m.title.toLowerCase().includes(needle) ||
        (m.subtitle ?? "").toLowerCase().includes(needle) ||
        m.ticker.toLowerCase().includes(needle) ||
        m.category.toLowerCase().includes(needle)
      );
    });
  }, [markets, q, cat]);

  const sorted = useMemo(() => {
    const chance = (m: Market) => m.quote.lastCents ?? m.quote.yesAskCents ?? 0;
    const closeMs = (m: Market) => (m.closeTime ? new Date(m.closeTime).getTime() : Infinity);
    const arr = [...filtered];
    switch (sort) {
      case "closing":
        return arr.sort((a, b) => closeMs(a) - closeMs(b));
      case "chance-high":
        return arr.sort((a, b) => chance(b) - chance(a));
      case "chance-low":
        return arr.sort((a, b) => chance(a) - chance(b));
      default:
        return arr.sort((a, b) => b.volume - a.volume);
    }
  }, [filtered, sort]);

  const shown = sorted.slice(0, limit);
  const { quotes } = usePrices(shown.map((m) => m.ticker));

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Markets</h1>
        <p className="text-sm text-neutral-400 mt-1">
          Live prediction-market prices from Kalshi. Buy YES or NO with paper money — fills at the
          current price, nothing hits a real venue.
        </p>
      </div>

      <div className="flex flex-col gap-3 mb-4">
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setLimit(PAGE);
            }}
            placeholder="Search markets, teams, topics…"
            className="flex-1 rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-2.5 text-sm outline-none focus:border-neutral-600 placeholder:text-neutral-600"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2.5 text-sm outline-none focus:border-neutral-600 text-neutral-300"
            aria-label="Sort markets"
          >
            <option value="volume">Most traded</option>
            <option value="closing">Closing soon</option>
            <option value="chance-high">Highest chance</option>
            <option value="chance-low">Lowest chance</option>
          </select>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Chip active={cat === null} onClick={() => setCat(null)}>
            All
          </Chip>
          {categories.map((c) => (
            <Chip key={c} active={cat === c} onClick={() => setCat((p) => (p === c ? null : c))}>
              {c}
            </Chip>
          ))}
        </div>
      </div>

      {isLoading && <SkeletonList />}
      {error && (
        <div className="rounded-lg border border-amber-900/50 bg-amber-950/30 p-4 text-sm text-amber-300">
          Market data is temporarily unavailable. Retrying…
        </div>
      )}
      {!isLoading && !error && filtered.length === 0 && (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-8 text-center text-neutral-400">
          No markets match your search.
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {shown.map((m) => {
          const q2 = quotes[m.ticker];
          const yesAsk = q2?.yesAskCents ?? m.quote.yesAskCents;
          const noAsk = q2?.noAskCents ?? m.quote.noAskCents;
          const yesMark = q2?.yesMarkCents ?? m.quote.lastCents ?? yesAsk;
          return (
            <li key={m.ticker}>
              <Link
                href={`/markets/${encodeURIComponent(m.ticker)}`}
                className="group flex items-center gap-4 rounded-xl border border-neutral-800 bg-neutral-900/60 hover:bg-neutral-900 hover:border-neutral-700 px-4 py-3 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] uppercase tracking-wide text-neutral-500 bg-neutral-800 rounded px-1.5 py-0.5">
                      {m.category}
                    </span>
                    <span className="text-[11px] text-neutral-500">
                      {probPct(yesMark)} chance · {compactNumber(m.volume)} vol
                    </span>
                  </div>
                  <div className="truncate font-medium text-neutral-100">{m.title}</div>
                  {m.subtitle && m.subtitle !== m.title && (
                    <div className="truncate text-sm text-neutral-400">{m.subtitle}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <PriceChip label="YES" cents={yesAsk} tone="yes" />
                  <PriceChip label="NO" cents={noAsk} tone="no" />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {filtered.length > shown.length && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={() => setLimit((l) => l + PAGE)}
            className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-900"
          >
            Show more ({filtered.length - shown.length} more)
          </button>
        </div>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
        active
          ? "bg-white text-black border-white"
          : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:border-neutral-600"
      }`}
    >
      {children}
    </button>
  );
}

function PriceChip({
  label,
  cents,
  tone,
}: {
  label: string;
  cents: number | null;
  tone: "yes" | "no";
}) {
  const color =
    tone === "yes"
      ? "border-emerald-900/60 bg-emerald-950/40 text-emerald-300"
      : "border-rose-900/60 bg-rose-950/40 text-rose-300";
  return (
    <div className={`w-20 rounded-lg border ${color} px-2 py-1.5 text-center`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</div>
      <div className="font-mono text-base font-semibold">
        <LivePrice cents={cents} />
      </div>
    </div>
  );
}

function SkeletonList() {
  return (
    <ul className="flex flex-col gap-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <li
          key={i}
          className="h-[68px] rounded-xl border border-neutral-800 bg-neutral-900/40 animate-pulse"
        />
      ))}
    </ul>
  );
}
