import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, homeFor } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";
import { UNIVERSITY_NAME } from "@/lib/site";
import T from "@/lib/i18n/T";

export const dynamic = "force-dynamic";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "student") redirect(homeFor(session.role));

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/student" className="font-extrabold text-blue-700">
            {UNIVERSITY_NAME} · <T k="nav.studentPortal" />
          </Link>
          <nav className="flex items-center gap-1 text-sm font-medium">
            <Link href="/student" className="rounded-lg px-3 py-1.5 hover:bg-slate-100">
              <T k="nav.home" />
            </Link>
           <Link href="/student/id-card" className="rounded-lg px-3 py-1.5 hover:bg-slate-100">
  <T k="nav.idcard" />
</Link>
            <Link href="/student/transactions" className="rounded-lg px-3 py-1.5 hover:bg-slate-100">
              <T k="student.history" />
            </Link>
            <LogoutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}