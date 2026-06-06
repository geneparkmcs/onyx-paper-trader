"use client";

import { useState } from "react";
import Link from "next/link";
import { mutate } from "swr";
import { postJson, newIdempotencyKey, ApiError, type Quote, type Side } from "@/lib/client";
import { usd, probPct } from "@/lib/format";

type Me = { id: string; username: string; balanceCents: number } | null;

type Confirmation = {
  side: Side;
  qty: number;
  fillPriceCents: number;
  costCents: number;
  balanceCents?: number;
  moved?: boolean;
  duplicate?: boolean;
};

export function OrderTicket({
  ticker,
  quote,
  user,
}: {
  ticker: string;
  quote: Quote | undefined;
  user: Me;
}) {
  const [side, setSide] = useState<Side>("YES");
  const [qty, setQty] = useState(10);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Confirmation | null>(null);

  const ask = side === "YES" ? quote?.yesAskCents ?? null : quote?.noAskCents ?? null;
  const stale = quote?.stale ?? false;
  const tradeable = ask != null && qty > 0 && !stale;

  const costCents = ask != null ? ask * qty : null;
  const maxPayoutCents = qty * 100;
  const profitCents = costCents != null ? maxPayoutCents - costCents : null;

  async function submit() {
    if (ask == null) return;
    setSubmitting(true);
    setError(null);
    setDone(null);
    try {
      const res = await postJson("/api/orders", {
        ticker,
        side,
        qty,
        idempotencyKey: newIdempotencyKey(),
        expectedPriceCents: ask,
      });
      if (res.duplicate) {
        setDone({
          side,
          qty: res.fill.qty,
          fillPriceCents: res.fill.fillPriceCents,
          costCents: res.fill.costCents,
          duplicate: true,
        });
      } else {
        setDone({
          side,
          qty: res.fill.qty,
          fillPriceCents: res.fill.fillPriceCents,
          costCents: res.fill.costCents,
          balanceCents: res.balanceCents,
          moved: res.fill.fillPriceCents !== ask,
        });
      }
      // refresh balance + portfolio everywhere
      mutate("/api/auth/me");
      mutate("/api/portfolio");
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 402) {
          const need = e.info.requiredCents as number;
          const have = e.info.balanceCents as number;
          setError(`Insufficient funds — need ${usd(need)}, you have ${usd(have)}.`);
        } else if (e.status === 409 && typeof e.info.fillPriceCents === "number") {
          setError(`Price moved to ${e.info.fillPriceCents}¢ before filling. Review and try again.`);
        } else {
          setError(e.message);
        }
      } else {
        setError("Something went wrong. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <div className="text-sm text-neutral-300 mb-3">Log in to place paper orders.</div>
        <div className="flex gap-2">
          <Link
            href="/login"
            className="flex-1 text-center rounded-lg bg-emerald-500 text-black font-medium py-2 hover:bg-emerald-400"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="flex-1 text-center rounded-lg border border-neutral-700 py-2 hover:bg-neutral-800"
          >
            Sign up
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Place order</h3>
        <span className="text-xs text-neutral-500">Balance {usd(user.balanceCents)}</span>
      </div>

      {/* side toggle */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {(["YES", "NO"] as Side[]).map((s) => {
          const a = s === "YES" ? quote?.yesAskCents : quote?.noAskCents;
          const on = side === s;
          const tone =
            s === "YES"
              ? on
                ? "bg-emerald-500 text-black border-emerald-500"
                : "border-emerald-900/60 text-emerald-300 hover:border-emerald-700"
              : on
                ? "bg-rose-500 text-black border-rose-500"
                : "border-rose-900/60 text-rose-300 hover:border-rose-700";
          return (
            <button
              key={s}
              onClick={() => {
                setSide(s);
                setDone(null);
                setError(null);
              }}
              className={`rounded-lg border py-2.5 font-semibold transition-colors ${tone}`}
            >
              {s} · {a == null ? "—" : `${a}¢`}
            </button>
          );
        })}
      </div>

      {/* quantity */}
      <label className="block text-xs uppercase tracking-wide text-neutral-500 mb-1">
        Contracts
      </label>
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setQty((q) => Math.max(1, q - 10))}
          className="h-9 w-9 rounded-lg border border-neutral-700 text-neutral-300 hover:bg-neutral-800"
        >
          −
        </button>
        <input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
          className="flex-1 rounded-lg bg-neutral-950 border border-neutral-800 px-3 py-2 text-center font-mono outline-none focus:border-neutral-600"
        />
        <button
          onClick={() => setQty((q) => q + 10)}
          className="h-9 w-9 rounded-lg border border-neutral-700 text-neutral-300 hover:bg-neutral-800"
        >
          +
        </button>
      </div>

      {/* payout preview */}
      <div className="rounded-lg bg-neutral-950 border border-neutral-800 p-3 text-sm space-y-1.5 mb-4">
        <Row label={`Fill price (${side} ask)`} value={ask == null ? "—" : `${ask}¢ · ${probPct(side === "YES" ? ask : 100 - ask)}`} />
        <Row label="Cost" value={costCents == null ? "—" : usd(costCents)} strong />
        <Row label={`Max payout if ${side}`} value={usd(maxPayoutCents)} />
        <Row
          label="Profit if right"
          value={profitCents == null ? "—" : `+${usd(profitCents)}`}
          tone="pos"
        />
      </div>

      {stale && (
        <div className="rounded-lg border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-300 mb-3">
          Price is stale — trading paused until a fresh quote arrives.
        </div>
      )}

      <button
        disabled={!tradeable || submitting}
        onClick={submit}
        className={`w-full rounded-lg py-2.5 font-semibold transition-colors ${
          side === "YES"
            ? "bg-emerald-500 text-black hover:bg-emerald-400"
            : "bg-rose-500 text-black hover:bg-rose-400"
        } disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        {submitting ? "Placing…" : `Buy ${qty} ${side} · ${costCents == null ? "—" : usd(costCents)}`}
      </button>

      {error && (
        <div className="mt-3 rounded-lg border border-rose-900/50 bg-rose-950/30 px-3 py-2 text-sm text-rose-300">
          {error}
        </div>
      )}

      {done && (
        <div className="mt-3 rounded-lg border border-emerald-900/50 bg-emerald-950/30 px-3 py-3 text-sm text-emerald-200">
          <div className="font-semibold mb-1">
            {done.duplicate ? "Already filled" : "Filled"} · {done.qty} {done.side} @ {done.fillPriceCents}¢
          </div>
          <div className="text-emerald-300/90">
            Cost {usd(done.costCents)}
            {done.balanceCents != null && <> · New balance {usd(done.balanceCents)}</>}
            {done.moved && <> · price moved before fill</>}
          </div>
          <Link href="/portfolio" className="inline-block mt-2 underline underline-offset-2">
            View portfolio →
          </Link>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "pos";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-neutral-400">{label}</span>
      <span
        className={`font-mono ${strong ? "text-white font-semibold" : "text-neutral-200"} ${
          tone === "pos" ? "text-emerald-400" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}
