"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { UNIVERSITY_NAME } from "@/lib/site";
import { useLang } from "@/lib/i18n/LanguageProvider";
import LanguageToggle from "@/lib/i18n/LanguageToggle";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useLang();
  const [id, setId] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: id.trim(), pin }),
      });

      let data: { redirect?: string; error?: string; message?: string } | null = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (res.ok && data && data.redirect) {
        router.push(data.redirect);
        router.refresh();
        return;
      }
const errorMessage = 
  typeof data?.error === 'string' ? data.error : 
  typeof data?.message === 'string' ? data.message : 
  (data?.error as any)?.message || t("login.networkError");

setError(String(errorMessage));

      setBusy(false);
    } catch {
      setError(t("login.networkError"));
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="absolute right-4 top-4">
        <LanguageToggle />
      </div>

      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="text-center text-2xl font-bold text-slate-900">
          {t("login.title")}
        </h1>
        <p className="mt-1 text-center text-sm text-slate-500">{UNIVERSITY_NAME}</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="login-id" className="block text-sm font-medium text-slate-700">
              {t("login.id")}
            </label>
            <input
              id="login-id"
              value={id}
              onChange={(e) => setId(e.target.value)}
              autoComplete="username"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-900"
              required
            />
          </div>

          <div>
            <label htmlFor="login-pin" className="block text-sm font-medium text-slate-700">
              {t("login.pin")}
            </label>
            <input
              id="login-pin"
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-900"
              required
            />
          </div>

          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-slate-900 py-2.5 font-semibold text-white disabled:opacity-60"
          >
            {busy ? t("login.busy") : t("login.signin")}
          </button>
        </form>

        
      </div>
    </main>
  );
}