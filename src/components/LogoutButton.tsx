"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
        router.refresh();
      }}
      className="ml-2 rounded-lg bg-slate-100 px-3 py-1.5 text-slate-600 hover:bg-slate-200"
    >
      Sign out
    </button>
  );
}
