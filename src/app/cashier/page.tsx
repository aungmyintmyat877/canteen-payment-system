import { redirect } from "next/navigation";
import { getSession, homeFor } from "@/lib/auth";
import CashierTerminal from "@/components/CashierTerminal";
import LogoutButton from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

export const metadata = { title: "Cashier Terminal" };

export default async function CashierPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "cashier") redirect(homeFor(session.role));

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <span className="font-extrabold text-blue-700">Cashier Terminal</span>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-500">
              Signed in: <strong className="text-slate-700">{session.name}</strong> ({session.id})
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <CashierTerminal
          cashierName={session.name}
          allowManual={process.env.ALLOW_MANUAL_ENTRY === "true"}
        />
      </main>
    </div>
  );
}
