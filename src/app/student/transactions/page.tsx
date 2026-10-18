import Link from "next/link";
import { pool } from "@/lib/db";
import { requireActiveStudent } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import type { RowDataPacket } from "mysql2/promise";

export const dynamic = "force-dynamic";

const TYPE_STYLES: Record<string, string> = {
  topup: "bg-emerald-100 text-emerald-700",
  payment: "bg-red-100 text-red-700",
  refund: "bg-blue-100 text-blue-700",
};

export default async function StudentTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Math.min(Number(sp.page) || 1, 10_000));
  const pageSize = 10;
  const offset = (page - 1) * pageSize;

  const student = await requireActiveStudent();

  const [items] = await pool.query<RowDataPacket[]>(
    `SELECT id, type, amount, balance_after, note, refund_of, created_at
     FROM transactions
     WHERE student_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT ${pageSize} OFFSET ${offset}`,
    [student.id]
  );
  const [countRows] = await pool.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS total FROM transactions WHERE student_id = ?",
    [student.id]
  );
  const total = Number(countRows[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold">Transaction history</h1>
        <p className="text-sm text-slate-500">
          {total} record{total === 1 ? "" : "s"} · page {page} of {totalPages}
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">When</th>
              <th className="px-5 py-3">Type</th>
              <th className="px-5 py-3 text-right">Amount</th>
              <th className="px-5 py-3 text-right">Balance after</th>
              <th className="px-5 py-3">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-slate-400">
                  No transactions yet — top up at the canteen cashier.
                </td>
              </tr>
            )}
            {items.map((t) => {
              const amount = Number(t.amount);
              const type = String(t.type);
              return (
                <tr key={String(t.id)}>
                  <td className="whitespace-nowrap px-5 py-3 text-slate-600">
                    {new Date(String(t.created_at)).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${TYPE_STYLES[type] ?? "bg-slate-100"}`}
                    >
                      {type}
                    </span>
                    {t.refund_of ? (
                      <span className="ml-2 text-xs text-slate-400">
                        for #{String(t.refund_of)}
                      </span>
                    ) : null}
                  </td>
                  <td
                    className={`px-5 py-3 text-right font-semibold tabular-nums ${
                      amount < 0 ? "text-red-600" : "text-emerald-600"
                    }`}
                  >
                    {formatMoney(amount)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    {formatMoney(t.balance_after as number)}
                  </td>
                  <td className="max-w-[16rem] truncate px-5 py-3 text-slate-500">
                    {(t.note as string | null) ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between">
        {page > 1 ? (
          <Link
            href={`/student/transactions?page=${page - 1}`}
            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold shadow hover:bg-slate-50"
          >
            ← Previous
          </Link>
        ) : (
          <span />
        )}
        {page < totalPages ? (
          <Link
            href={`/student/transactions?page=${page + 1}`}
            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold shadow hover:bg-slate-50"
          >
            Next →
          </Link>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}
