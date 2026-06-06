"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { fetcher, type Market } from "@/lib/client";
import { usePrices } from "@/lib/usePrices";
import { OrderTicket } from "@/components/OrderTicket";
import { LivePrice } from "@/components/LivePrice";
import { Sparkline } from "@/components/Sparkline";
import { probPct, compactNumber, priceCents } from "@/lib/format";

type Me = { user: { id: string; username: string; balanceCents: number } | null };

export default function MarketDetailPage() {
  const params = useParams<{ ticker: string }>();
  const ticker = decodeURIComponent(params.ticker);

  const { data, error, isLoading } = useSWR<{ market: Market }>(
    `/api/markets/${encodeURIComponent(ticker)}`,
    fetcher,
  );
  const { data: me } = useSWR<Me>("/api/auth/me", fetcher, { shouldRetryOnError: false });
  const { data: hist } = useSWR<{ points: { ts: number; yesCents: number }[] }>(
    `/api/markets/${encodeURIComponent(ticker)}/history`,
    fetcher,
    { refreshInterval: 60_000 },
  );
  const { quotes } = usePrices([ticker]);
  const points = hist?.points ?? [];

  const market = data?.market;
  const live = quotes[ticker];
  const q = {
    yesBidCents: live?.yesBidCents ?? market?.quote.yesBidCents ?? null,
    yesAskCents: live?.yesAskCents ?? market?.quote.yesAskCents ?? null,
    noBidCents: live?.noBidCents ?? market?.quote.noBidCents ?? null,
    noAskCents: live?.noAskCents ?? market?.quote.noAskCents ?? null,
    lastCents: live?.lastCents ?? market?.quote.lastCents ?? null,
    yesMarkCents: live?.yesMarkCents ?? market?.quote.lastCents ?? null,
    stale: live?.stale ?? false,
  };

  return (
    <div>
      <Link href="/" className="text-sm text-neutral-400 hover:text-white">
        ← Markets
      </Link>

      {isLoading && <div className="mt-6 h-40 rounded-xl bg-neutral-900/50 animate-pulse" />}
      {error && (
        <div className="mt-6 rounded-lg border border-amber-900/50 bg-amber-950/30 p-4 text-sm text-amber-300">
          Couldn’t load this market.
        </div>
      )}

      {market && (
        <div className="mt-4 grid lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 space-y-5">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] uppercase tracking-wide text-neutral-400 bg-neutral-800 rounded px-1.5 py-0.5">
                  {market.category}
                </span>
                {q.stale && (
                  <span className="text-[10px] uppercase tracking-wide text-amber-300 bg-amber-950/50 border border-amber-900/50 rounded px-1.5 py-0.5">
                    Price stale
                  </span>
                )}
                <span className="text-xs text-neutral-500 font-mono">{market.ticker}</span>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">{market.title}</h1>
              {market.subtitle && market.subtitle !== market.title && (
                <p className="text-neutral-400 mt-1">{market.subtitle}</p>
              )}
            </div>

            <div className="flex items-end gap-6">
              <div>
                <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">
                  Implied chance (YES)
                </div>
                <div className="text-4xl font-semibold tabular-nums">
                  {probPct(q.yesMarkCents)}
                </div>
              </div>
              <div className="text-sm text-neutral-400 pb-1">
                {compactNumber(market.volume)} contracts traded
                {market.closeTime && (
                  <> · closes {new Date(market.closeTime).toLocaleDateString()}</>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase tracking-wide text-neutral-500">
                  Price history · 7d (YES)
                </span>
                {points.length >= 2 && (
                  <span className="text-xs text-neutral-500 font-mono">
                    low {Math.min(...points.map((p) => p.yesCents))}¢ · high{" "}
                    {Math.max(...points.map((p) => p.yesCents))}¢
                  </span>
                )}
              </div>
              <Sparkline points={points} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <QuoteBox
                tone="yes"
                label="YES"
                bid={q.yesBidCents}
                ask={q.yesAskCents}
              />
              <QuoteBox tone="no" label="NO" bid={q.noBidCents} ask={q.noAskCents} />
            </div>

            <p className="text-xs text-neutral-500 leading-relaxed">
              You buy at the <span className="text-neutral-300">ask</span> and could close at the{" "}
              <span className="text-neutral-300">bid</span>; the gap is the spread. Each contract
              settles at $1.00 if it resolves your way, $0.00 otherwise. Orders are simulated — your
              fill is recorded against the live price but never sent to a real venue.
            </p>
          </div>

          <div className="lg:sticky lg:top-20">
            <OrderTicket ticker={ticker} quote={q} user={me?.user ?? null} />
          </div>
        </div>
      )}
    </div>
  );
}

function QuoteBox({
  tone,
  label,
  bid,
  ask,
}: {
  tone: "yes" | "no";
  label: string;
  bid: number | null;
  ask: number | null;
}) {
  const color =
    tone === "yes"
      ? "border-emerald-900/50 bg-emerald-950/20"
      : "border-rose-900/50 bg-rose-950/20";
  const text = tone === "yes" ? "text-emerald-300" : "text-rose-300";
  return (
    <div className={`rounded-xl border ${color} p-4`}>
      <div className={`text-xs font-semibold uppercase tracking-wide ${text} mb-2`}>{label}</div>
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-[10px] uppercase text-neutral-500">Ask (buy)</div>
          <div className={`text-2xl font-semibold font-mono ${text}`}>
            <LivePrice cents={ask} />
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase text-neutral-500">Bid (sell)</div>
          <div className="text-lg font-mono text-neutral-400">{priceCents(bid)}</div>
        </div>
      </div>
    </div>
  );
}
