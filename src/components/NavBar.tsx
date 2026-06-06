"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import useSWR from "swr";
import { fetcher, postJson } from "@/lib/client";
import { usd } from "@/lib/format";

type Me = { user: { id: string; username: string; balanceCents: number } | null };

export function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data, mutate } = useSWR<Me>("/api/auth/me", fetcher, {
    shouldRetryOnError: false,
    refreshInterval: 5000,
  });
  const user = data?.user ?? null;

  async function logout() {
    await postJson("/api/auth/logout", {});
    await mutate({ user: null }, { revalidate: false });
    router.push("/");
  }

  const link = (href: string, label: string) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
          active ? "bg-neutral-800 text-white" : "text-neutral-400 hover:text-white"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-20 border-b border-neutral-800 bg-[#0a0a0b]/90 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-2">
        <Link href="/" className="flex items-center gap-2 mr-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500 text-black font-black text-sm">
            O
          </span>
          <span className="font-semibold tracking-tight">Onyx Paper Trader</span>
        </Link>
        <nav className="flex items-center gap-1">
          {link("/", "Markets")}
          {user && link("/portfolio", "Portfolio")}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <>
              <div className="text-right leading-tight hidden sm:block">
                <div className="text-[11px] uppercase tracking-wide text-neutral-500">Balance</div>
                <div className="font-mono text-sm text-emerald-400">{usd(user.balanceCents)}</div>
              </div>
              <span className="text-sm text-neutral-300">{user.username}</span>
              <button
                onClick={logout}
                className="px-3 py-1.5 rounded-md text-sm text-neutral-400 hover:text-white hover:bg-neutral-800"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="px-3 py-1.5 rounded-md text-sm text-neutral-300 hover:text-white"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="px-3 py-1.5 rounded-md text-sm font-medium bg-emerald-500 text-black hover:bg-emerald-400"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
