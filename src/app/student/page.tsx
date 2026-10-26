import { asNumber } from "@/lib/db";
import Link from "next/link";
import { requireActiveStudent } from "@/lib/auth";
import { buildQrPayload } from "@/lib/qr";
import { formatMoney } from "@/lib/money";
import { DEBT_LIMIT_MINOR } from "@/lib/config";
import StudentQr from "@/components/StudentQr";
import T from "@/lib/i18n/T";


export const dynamic = "force-dynamic";

export default async function StudentHomePage() {
  let student;
  try {
    student = await requireActiveStudent();
  } catch {
    return (
      <p className="rounded-2xl bg-red-50 border border-red-200 p-6 text-red-700">
        <T k="student.blocked" />
      </p>
    );
  }
  const payload = buildQrPayload(student.id, student.qr_secret);
     const balance = asNumber(student.balance);
      // BIGINT arrives as string → convert
  const inDebt = balance < 0;
  const absBalance = Math.abs(balance);
  const allowance = DEBT_LIMIT_MINOR + balance; // အကြွေး ထပ်ခံနိုင်တဲ့ ပမာဏ

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section
        className={
          inDebt
            ? "flex flex-col rounded-2xl bg-gradient-to-br from-rose-600 to-red-700 p-8 text-white shadow-lg"
            : "flex flex-col rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 p-8 text-white shadow-lg"
        }
      >
        <p className="text-sm font-medium text-blue-100">
          <T k="student.balance" />
        </p>
        <p className="mt-1 text-5xl font-extrabold tracking-tight">
          {inDebt ? "-" : ""}
          {formatMoney(absBalance)}
        </p>
        {inDebt && (
          <p className="mt-2 inline-flex w-fit rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-wide">
            <T k="student.debt" /> — {formatMoney(absBalance)}
          </p>
        )}
        <p className="mt-8 text-lg font-semibold">{student.name}</p>
        <p className="text-sm text-blue-200">
          {student.id} · <T k="student.year" /> {student.year}
          {student.major ? ` · ${student.major}` : ""}
        </p>
        {inDebt && (
          <p className="mt-3 rounded-xl bg-black/20 p-3 text-xs leading-relaxed text-rose-50">
            <T k="student.debtHint" /> (<T k="student.debtAllowance" />: {formatMoney(allowance)})
          </p>
        )}

        <div className="mt-auto flex gap-3 pt-8">
          <Link
            href="/student/id-card"
            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
          >
            <T k="student.idcard" />
          </Link>
          <Link
            href="/student/transactions"
            className="rounded-xl border border-white/40 px-4 py-2 text-sm font-semibold hover:bg-white/10"
          >
            <T k="student.history" />
          </Link>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-8 text-center shadow">
        <h2 className="text-lg font-bold">
          <T k="student.myqr" />
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          <T k="student.qrHint" />
        </p>
        <StudentQr payload={payload} />
        <p className="mt-4 text-xs text-slate-400">
          <T k="student.qrNote" />
        </p>
      </section>
    </div>
  );
}