"use client";

import { useRouter } from "next/navigation";
import { useLang } from "@/lib/i18n/LanguageProvider";

export default function LogoutButton() {
  const router = useRouter();
  const { t } = useLang();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={logout}
      className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-200"
    >
      {t("nav.signout")}
    </button>
  );
}