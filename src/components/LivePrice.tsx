"use client";

import { useEffect, useRef, useState } from "react";

/** Shows a cents price that briefly flashes green/red when it changes — the visible proof
 * that prices are live (DESIGN.md §8). */
export function LivePrice({
  cents,
  className = "",
  suffix = "¢",
}: {
  cents: number | null | undefined;
  className?: string;
  suffix?: string;
}) {
  const prev = useRef<number | null | undefined>(cents);
  const [flash, setFlash] = useState<"" | "flash-up" | "flash-down">("");

  useEffect(() => {
    if (cents != null && prev.current != null && cents !== prev.current) {
      setFlash(cents > prev.current ? "flash-up" : "flash-down");
      const t = setTimeout(() => setFlash(""), 700);
      prev.current = cents;
      return () => clearTimeout(t);
    }
    prev.current = cents;
  }, [cents]);

  return (
    <span className={`rounded px-1 tabular-nums ${flash} ${className}`}>
      {cents == null ? "—" : `${cents}${suffix}`}
    </span>
  );
}
