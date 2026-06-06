"use client";

import useSWR from "swr";
import { fetcher, type Quote } from "@/lib/client";

/** Poll live quotes for a set of tickers. The set should be the on-screen/held tickers. */
export function usePrices(tickers: string[]) {
  const sorted = [...new Set(tickers)].sort();
  const key = sorted.length ? `/api/prices?tickers=${sorted.join(",")}` : null;
  const { data } = useSWR<{ quotes: Record<string, Quote>; asOf: number }>(key, fetcher, {
    refreshInterval: 2000,
    dedupingInterval: 1500,
    keepPreviousData: true,
  });
  return { quotes: data?.quotes ?? {}, asOf: data?.asOf };
}
