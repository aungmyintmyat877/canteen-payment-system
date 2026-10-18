import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, homeFor } from "@/lib/auth";
import { UNIVERSITY_NAME } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const session = await getSession();
  if (session) redirect(homeFor(session.role));

  const features = [
    {
      title: "Students",
      body: "Check your balance, show your signed payment QR, download a printable student ID card, and browse your full transaction history.",
    },
    {
      title: "Cashier Terminal",
      body: "Scan a student's QR with the camera, verify their photo, take cash or PIN-authorized payments. Double-charge-proof by design.",
    },
    {
      title: "Admin Dashboard",
      body: "Daily summaries, a full audit trail of who did what, and safe refunds that never rewrite history.",
    },
  ];

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-800 via-blue-700 to-indigo-900 text-white">
      <div className="mx-auto max-w-5xl px-6 py-20">
        <p className="text-blue-200 font-semibold tracking-wide text-sm uppercase">
          {UNIVERSITY_NAME}
        </p>
        <h1 className="mt-3 text-4xl md:text-5xl font-extrabold leading-tight">
          Canteen Payment &amp; Student ID System
        </h1>
        <p className="mt-4 max-w-2xl text-blue-100 text-lg">
          Cashless canteen payments with HMAC-signed QR passes, a locked and
          idempotent MySQL ledger, and printable digital ID cards.
        </p>

        <div className="mt-8 flex gap-3">
          <Link
            href="/login"
            className="rounded-xl bg-white px-6 py-3 font-semibold text-blue-800 shadow hover:bg-blue-50"
          >
            Sign in
          </Link>
        </div>

        <div className="mt-16 grid gap-4 md:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl bg-white/10 backdrop-blur p-6 border border-white/15"
            >
              <h2 className="font-bold text-lg">{f.title}</h2>
              <p className="mt-2 text-sm text-blue-100 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
