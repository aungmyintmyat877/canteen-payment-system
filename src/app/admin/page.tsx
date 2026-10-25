import { redirect } from "next/navigation";
import { getSession, homeFor } from "@/lib/auth";
import AdminDashboard from "@/components/AdminDashboard";
import LogoutButton from "@/components/LogoutButton";
import T from "@/lib/i18n/T";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin Dashboard" };

/**
 * React child အနေနဲ့ လုံခြုံစွာ render လုပ်နိုင်ရန် helper —
 * object ဝင်လာရင် crash မဖြစ်ဘဲ JSON အနေနဲ့ ပြပေးတယ်။
 */
function safeText(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect(homeFor(session.role));

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <span className="font-extrabold text-blue-700">
            <T k="admin.header" />
          </span>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-500">
              <T k="admin.signedIn" />{" "}
              <strong className="text-slate-700">{safeText(session.name)}</strong>{" "}
              ({safeText(session.id)})
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <AdminDashboard />
      </main>
    </div>
  );
}