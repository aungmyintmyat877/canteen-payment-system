import Link from "next/link";
import { requireActiveStudent } from "@/lib/auth";
import { buildQrPayload } from "@/lib/qr";
import { formatMoney } from "@/lib/money";
import StudentQr from "@/components/StudentQr";

export const dynamic = "force-dynamic";

export default async function StudentHomePage() {
  let student;
  try {
    student = await requireActiveStudent();
  } catch {
    return (
      <p className="rounded-2xl bg-red-50 border border-red-200 p-6 text-red-700">
        Your account is blocked or no longer exists. Please contact the
        administration office.
      </p>
    );
  }

  const payload = buildQrPayload(student.id, student.qr_secret);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="flex flex-col rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 p-8 text-white shadow-lg">
        <p className="text-sm font-medium text-blue-200">Current balance</p>
        <p className="mt-1 text-5xl font-extrabold tracking-tight">
          {formatMoney(student.balance)}
        </p>
        <p className="mt-8 text-lg font-semibold">{student.name}</p>
        <p className="text-sm text-blue-200">
          {student.id} · Year {student.year}
          {student.major ? ` · ${student.major}` : ""}
        </p>

        <div className="mt-auto flex gap-3 pt-8">
          <Link
            href="/student/id-card"
            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
          >
            My ID card
          </Link>
          <Link
            href="/student/transactions"
            className="rounded-xl border border-white/40 px-4 py-2 text-sm font-semibold hover:bg-white/10"
          >
            Transaction history
          </Link>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-8 text-center shadow">
        <h2 className="text-lg font-bold">My payment QR</h2>
        <p className="mt-1 text-sm text-slate-500">
          Show this at the cashier to top up or pay.
        </p>
        <StudentQr payload={payload} />
        <p className="mt-4 text-xs text-slate-400">
          The QR encodes your student ID plus an HMAC-SHA256 signature — it
          cannot be forged without the server secret.
        </p>
      </section>
    </div>
  );
}
