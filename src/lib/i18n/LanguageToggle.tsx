"use client";

import { useLang } from "./LanguageProvider";
import type { Lang } from "./dictionaries";

export default function LanguageToggle({ className = "" }: { className?: string }) {
  const { lang, setLang } = useLang();

  const btn = (value: Lang, label: string) => (
    <button
      type="button"
      onClick={() => setLang(value)}
      className={`px-3 py-1 text-xs font-semibold transition-colors ${
        lang === value ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div
      className={`inline-flex overflow-hidden rounded-full border border-slate-300 bg-white shadow-sm ${className}`}
    >
      {btn("en", "EN")}
      {btn("my", "မြန်မာ")}
    </div>
  );
}

export { LanguageToggle };