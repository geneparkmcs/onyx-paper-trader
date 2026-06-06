"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { mutate } from "swr";
import { postJson, ApiError, DEMO } from "@/lib/client";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignup = mode === "signup";

  async function login(u: string, p: string) {
    setBusy(true);
    setError(null);
    try {
      await postJson(isSignup ? "/api/auth/register" : "/api/auth/login", {
        username: u,
        password: p,
      });
      await mutate("/api/auth/me");
      router.push("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await login(username, password);
  }

  return (
    <div className="max-w-sm mx-auto mt-10">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6">
        <h1 className="text-xl font-semibold tracking-tight mb-1">
          {isSignup ? "Create your account" : "Welcome back"}
        </h1>
        <p className="text-sm text-neutral-400 mb-5">
          {isSignup
            ? "Start with $1,000 in paper money."
            : "Log in to trade and track your positions."}
        </p>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs uppercase tracking-wide text-neutral-500 mb-1">
              Username
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="w-full rounded-lg bg-neutral-950 border border-neutral-800 px-3 py-2 text-sm outline-none focus:border-neutral-600"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-neutral-500 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isSignup ? "new-password" : "current-password"}
              className="w-full rounded-lg bg-neutral-950 border border-neutral-800 px-3 py-2 text-sm outline-none focus:border-neutral-600"
            />
          </div>
          {error && (
            <div className="rounded-lg border border-rose-900/50 bg-rose-950/30 px-3 py-2 text-sm text-rose-300">
              {error}
            </div>
          )}
          <button
            disabled={busy || !username || !password}
            className="w-full rounded-lg bg-emerald-500 text-black font-medium py-2.5 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? "…" : isSignup ? "Create account" : "Log in"}
          </button>
        </form>
        {!isSignup && (
          <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-950 p-3">
            <div className="text-xs font-medium text-neutral-300 mb-1">Demo account</div>
            <div className="font-mono text-xs text-neutral-400">
              {DEMO.username} / {DEMO.password}
            </div>
            <button
              type="button"
              onClick={() => login(DEMO.username, DEMO.password)}
              disabled={busy}
              className="mt-2 w-full rounded-md border border-neutral-700 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-40"
            >
              Use demo account
            </button>
          </div>
        )}

        <div className="text-sm text-neutral-400 mt-4 text-center">
          {isSignup ? (
            <>
              Already have an account?{" "}
              <Link href="/login" className="text-emerald-400 hover:underline">
                Log in
              </Link>
            </>
          ) : (
            <>
              New here?{" "}
              <Link href="/signup" className="text-emerald-400 hover:underline">
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
