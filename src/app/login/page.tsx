"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Unified login: one form for students, cashiers and admins. The backend
 * detects the role from the ID and returns the dashboard to redirect to.
 */
export default function LoginPage() {
  const router = useRouter();
  const [id, setId] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "Sign-in failed.");
        return;
      }
      router.push(data.redirect as string);
      router.refresh();
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-800 to-indigo-900 px-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl bg-white p-8 shadow-2xl">
          <h1 className="text-2xl font-extrabold text-slate-900">Sign in</h1>
          <p className="mt-1 text-sm text-slate-500">
            One form for everyone — students, cashiers and admins. Your role is
            detected automatically from your ID.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-600" htmlFor="login-id">
                ID
              </label>
              <input
                id="login-id"
                value={id}
                onChange={(e) => setId(e.target.value.toUpperCase())}
                placeholder="e.g. S001, C001 or A001"
                autoComplete="username"
                className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600" htmlFor="login-pin">
                PIN
              </label>
              <input
                id="login-pin"
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="••••••"
                autoComplete="current-password"
                className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-2.5 tracking-widest outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <div className="mt-4 rounded-2xl bg-white/10 border border-white/15 p-4 text-sm text-blue-100">
          <p className="font-semibold text-white">Demo accounts</p>
          <p className="mt-1">Students: S001 – S005 · Cashier: C001 · Admin: A001</p>
          <p>PIN for all: 123456</p>
        </div>
      </div>
    </main>
  );
}
