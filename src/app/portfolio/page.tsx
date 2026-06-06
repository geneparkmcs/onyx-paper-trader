"use client";

import Link from "next/link";
import useSWR from "swr";
import { fetcher, ApiError } from "@/lib/client";
import { usd, signedUsd, priceCents } from "@/lib/format";

type PortfolioRow = {
  ticker: string;
  side: string;
  qty: number;
  avgCostCents: number;
  markCents: number | null;
  costCents: number;
  valueCents: number | null;
  unrealizedPnlCents: number | null;
  stale: boolean;
};

type Portfolio = {
  positions: PortfolioRow[];
  totals: {
    balanceCents: number;
    positionsValueCents: number;
    equityCents: number;
    totalCostCents: number;
    totalUnrealizedCents: number;
  };
};

export default function PortfolioPage() {
  const { data, error, isLoading } = useSWR<Portfolio>("/api/portfolio", fetcher, {
    refreshInterval: 2000,
    keepPreviousData: true,
    shouldRetryOnError: false,
  });

  if (error instanceof ApiError && error.status === 401) {
    return (
      <Empty
        title="Log in to see your portfolio"
        cta={
          <Link
            href="/login"
            className="rounded-lg bg-emerald-500 text-black font-medium px-4 py-2 hover:bg-emerald-400"
          >
            Log in
          </Link>
        }
      />
    );
  }

  if (isLoading && !data) {
    return <div className="h-40 rounded-xl bg-neutral-900/50 animate-pulse" />;
  }

  const t = data?.totals;
  const positions = data?.positions ?? [];

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight mb-5">Portfolio</h1>

      <div className="grid sm:grid-cols-4 gap-3 mb-6">
        <Stat label="Equity" value={usd(t?.equityCents ?? 0)} big />
        <Stat label="Cash" value={usd(t?.balanceCents ?? 0)} />
        <Stat label="Invested" value={usd(t?.positionsValueCents ?? 0)} />
        <Stat
          label="Unrealized P&L"
          value={signedUsd(t?.totalUnrealizedCents ?? 0)}
          tone={(t?.totalUnrealizedCents ?? 0) >= 0 ? "pos" : "neg"}
        />
      </div>

      {positions.length === 0 ? (
        <Empty
          title="No positions yet"
          subtitle="Browse markets and place your first paper order."
          cta={
            <Link
              href="/"
              className="rounded-lg bg-emerald-500 text-black font-medium px-4 py-2 hover:bg-emerald-400"
            >
              Browse markets
            </Link>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900 text-neutral-400">
              <tr className="text-left">
                <th className="px-4 py-2.5 font-medium">Market</th>
                <th className="px-4 py-2.5 font-medium">Side</th>
                <th className="px-4 py-2.5 font-medium text-right">Qty</th>
                <th className="px-4 py-2.5 font-medium text-right">Avg</th>
                <th className="px-4 py-2.5 font-medium text-right">Mark</th>
                <th className="px-4 py-2.5 font-medium text-right">Value</th>
                <th className="px-4 py-2.5 font-medium text-right">P&L</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => {
                const pnl = p.unrealizedPnlCents ?? 0;
                return (
                  <tr key={`${p.ticker}-${p.side}`} className="border-t border-neutral-800/80 hover:bg-neutral-900/50">
                    <td className="px-4 py-3 max-w-[280px]">
                      <Link
                        href={`/markets/${encodeURIComponent(p.ticker)}`}
                        className="font-mono text-xs text-neutral-300 hover:text-white truncate block"
                      >
                        {p.ticker}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                          p.side === "YES"
                            ? "bg-emerald-950/50 text-emerald-300"
                            : "bg-rose-950/50 text-rose-300"
                        }`}
                      >
                        {p.side}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{p.qty}</td>
                    <td className="px-4 py-3 text-right font-mono text-neutral-400">
                      {priceCents(p.avgCostCents)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{priceCents(p.markCents)}</td>
                    <td className="px-4 py-3 text-right font-mono">{usd(p.valueCents)}</td>
                    <td
                      className={`px-4 py-3 text-right font-mono font-semibold ${
                        pnl >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {signedUsd(p.unrealizedPnlCents)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  big,
  tone,
}: {
  label: string;
  value: string;
  big?: boolean;
  tone?: "pos" | "neg";
}) {
  const color = tone === "pos" ? "text-emerald-400" : tone === "neg" ? "text-rose-400" : "text-white";
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
      <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">{label}</div>
      <div className={`font-mono ${big ? "text-2xl" : "text-lg"} font-semibold ${color}`}>
        {value}
      </div>
    </div>
  );
}

function Empty({
  title,
  subtitle,
  cta,
}: {
  title: string;
  subtitle?: string;
  cta: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-10 text-center">
      <div className="text-lg font-medium">{title}</div>
      {subtitle && <div className="text-sm text-neutral-400 mt-1 mb-4">{subtitle}</div>}
      <div className="mt-4 flex justify-center">{cta}</div>
    </div>
  );
}
