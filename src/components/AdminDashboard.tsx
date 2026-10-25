"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMoney } from "@/lib/money";
import { useLang } from "@/lib/i18n/LanguageProvider";

interface Summary {
  today: Record<"topup" | "payment" | "refund", { count: number; total: number }>;
  week: { day: string; topup: number; payment: number; refund: number }[];
  students: { count: number; liabilities: number };
}

interface TxItem {
  id: number;
  student_id: string;
  student_name: string;
  type: "topup" | "payment" | "refund";
  amount: string | number;
  balance_after: string | number;
  operator_id: string | null;
  note: string | null;
  created_at: string;
  refund_id: number | null;
}

interface AuditItem {
  id: number;
  actor_id: string;
  actor_role: string;
  action: string;
  entity: string | null;
  entity_id: string | null;
  detail: string | null;
  created_at: string;
}

function txt(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function money(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return txt(value);
  let out: unknown;
  try {
    out = formatMoney(n);
  } catch {
    out = n.toLocaleString("en-US");
  }
  return typeof out === "string" ? out : txt(out);
}

function when(value: unknown): string {
  const d = new Date(String(value));
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" });
}

function pickErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "error" in (data as Record<string, unknown>)) {
    const raw = (data as { error?: { message?: unknown } }).error?.message;
    if (typeof raw === "string" && raw.trim() !== "") return raw;
    if (raw !== null && raw !== undefined && typeof raw === "object") {
      const s = JSON.stringify(raw);
      if (s && s !== "{}") return s;
    }
  }
  return fallback;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data: unknown = await res.json();
  if (!res.ok) throw new Error(pickErrorMessage(data, "Request failed"));
  return data as T;
}

export default function AdminDashboard() {
  const { t } = useLang();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [txs, setTxs] = useState<TxItem[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txPage, setTxPage] = useState(1);
  const [txType, setTxType] = useState<"all" | "topup" | "payment" | "refund">("payment");
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [refunding, setRefunding] = useState<number | null>(null);
  const pageSize = 8;

  const load = useCallback(async () => {
    try {
      setError(null);
      const [s, t, a] = await Promise.all([
        getJson<Summary>("/api/admin/summary"),
        getJson<{ items: TxItem[]; total: number }>(
          `/api/admin/transactions?type=${txType}&page=${txPage}&pageSize=${pageSize}`
        ),
        getJson<{ items: AuditItem[]; total: number }>(
          `/api/admin/audit?page=${auditPage}&pageSize=${pageSize}`
        ),
      ]);
      setSummary(s);
      setTxs(Array.isArray(t.items) ? t.items : []);
      setTxTotal(num(t.total));
      setAudit(Array.isArray(a.items) ? a.items : []);
      setAuditTotal(num(a.total));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("admin.loadFailed"));
    }
  }, [txType, txPage, auditPage, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function refund(txId: number) {
    if (!confirm(`${t("admin.refundConfirm")} #${txId}${t("admin.refundNote")}`)) return;
    setRefunding(txId);
    try {
      const res = await fetch("/api/admin/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction_id: txId }),
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        alert(pickErrorMessage(data, t("admin.refundFailed")));
      } else {
        const payload = data as {
          transaction?: { amount?: unknown };
          student?: { balance?: unknown };
        };
        alert(
          `${t("admin.refundedWord")} ${money(payload.transaction?.amount)} — ${t("admin.newBalance")} ${money(payload.student?.balance)}.`
        );
      }
      await load();
    } finally {
      setRefunding(null);
    }
  }

  if (error) {
    return <p className="rounded-2xl bg-red-50 border border-red-200 p-6 text-red-700">{error}</p>;
  }
  if (!summary) {
    return <p className="animate-pulse text-slate-400">{t("admin.loading")}</p>;
  }

  const emptyStat = { count: 0, total: 0 };
  const weekData = Array.isArray(summary.week) ? summary.week : [];
  const todayData = summary.today ?? {
    topup: emptyStat,
    payment: emptyStat,
    refund: emptyStat,
  };
  const studentData = summary.students ?? { count: 0, liabilities: 0 };

  const maxWeek = Math.max(
    1,
    ...weekData.map((d) => Math.max(Math.abs(num(d.topup)), Math.abs(num(d.payment))))
  );
  const txPages = Math.max(1, Math.ceil(txTotal / pageSize));
  const auditPages = Math.max(1, Math.ceil(auditTotal / pageSize));

  const card = "rounded-2xl bg-white p-5 shadow";
  const btn =
    "rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t("admin.title")}</h1>
        <button type="button" onClick={load} className={btn}>
          {t("admin.refresh")}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className={card}>
          <p className="text-xs font-semibold uppercase text-slate-400">{t("admin.topupsToday")}</p>
          <p className="mt-1 text-2xl font-extrabold text-emerald-600">
            {money(todayData.topup?.total)}
          </p>
          <p className="text-xs text-slate-400">
            {txt(todayData.topup?.count ?? 0)} {t("admin.transactions")}
          </p>
        </div>
        <div className={card}>
          <p className="text-xs font-semibold uppercase text-slate-400">{t("admin.paymentsToday")}</p>
          <p className="mt-1 text-2xl font-extrabold text-red-600">
            {money(todayData.payment?.total)}
          </p>
          <p className="text-xs text-slate-400">
            {txt(todayData.payment?.count ?? 0)} {t("admin.transactions")}
          </p>
        </div>
        <div className={card}>
          <p className="text-xs font-semibold uppercase text-slate-400">{t("admin.refundsToday")}</p>
          <p className="mt-1 text-2xl font-extrabold text-blue-600">
            {money(todayData.refund?.total)}
          </p>
          <p className="text-xs text-slate-400">
            {txt(todayData.refund?.count ?? 0)} {t("admin.transactions")}
          </p>
        </div>
        <div className={card}>
          <p className="text-xs font-semibold uppercase text-slate-400">{t("admin.liabilities")}</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-800">
            {money(studentData.liabilities)}
          </p>
          <p className="text-xs text-slate-400">
            {txt(studentData.count ?? 0)} {t("admin.students")}
          </p>
        </div>
      </div>

      <div className={card}>
        <p className="text-sm font-bold">{t("admin.last7")}</p>
        {weekData.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">{t("admin.noActivity")}</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="py-1 text-left">{t("admin.day")}</th>
                <th className="py-1 text-left">{t("admin.weekTopups")}</th>
                <th className="py-1 text-left">{t("admin.weekPayments")}</th>
              </tr>
            </thead>
            <tbody>
              {weekData.map((d, i) => (
                <tr key={typeof d.day === "string" && d.day ? d.day : `week-row-${i}`}>
                  <td className="whitespace-nowrap py-1.5 pr-4 text-slate-600">{txt(d.day)}</td>
                  <td className="py-1.5 pr-4">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 rounded bg-emerald-400"
                        style={{
                          width: `${(Math.abs(num(d.topup)) / maxWeek) * 60}%`,
                          minWidth: num(d.topup) ? 4 : 0,
                        }}
                      />
                      <span className="tabular-nums text-emerald-700">{money(d.topup)}</span>
                    </div>
                  </td>
                  <td className="py-1.5">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 rounded bg-red-400"
                        style={{
                          width: `${(Math.abs(num(d.payment)) / maxWeek) * 60}%`,
                          minWidth: num(d.payment) ? 4 : 0,
                        }}
                      />
                      <span className="tabular-nums text-red-700">{money(d.payment)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold">{t("admin.ledger")}</p>
          <div className="flex gap-1 text-xs">
            {(["payment", "topup", "refund", "all"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  setTxType(opt);
                  setTxPage(1);
                }}
                className={`rounded-lg px-3 py-1.5 font-semibold ${
                  txType === opt ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {t(`type.${opt}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">{t("tx.time")}</th>
                <th className="py-2 pr-3">{t("admin.student")}</th>
                <th className="py-2 pr-3">{t("tx.type")}</th>
                <th className="py-2 pr-3 text-right">{t("tx.amount")}</th>
                <th className="py-2 pr-3">{t("admin.operator")}</th>
                <th className="py-2 text-right">{t("admin.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {txs.map((row, i) => {
                const amount = num(row.amount);
                return (
                  <tr key={`${txt(row.id)}-${i}`}>
                    <td className="py-2 pr-3 font-mono text-xs text-slate-400">{txt(row.id)}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-slate-500">
                      {when(row.created_at)}
                    </td>
                    <td className="py-2 pr-3">
                      {txt(row.student_name)}{" "}
                      <span className="text-xs text-slate-400">({txt(row.student_id)})</span>
                    </td>
                    <td className="py-2 pr-3">
                      <span>{t(`type.${row.type}`)}</span>
                      {row.refund_id ? (
                        <span className="ml-1 text-xs text-blue-500">{t("tx.refunded")}</span>
                      ) : null}
                    </td>
                    <td
                      className={`py-2 pr-3 text-right font-semibold tabular-nums ${
                        amount < 0 ? "text-red-600" : "text-emerald-600"
                      }`}
                    >
                      {money(amount)}
                    </td>
                    <td className="py-2 pr-3 text-slate-500">{txt(row.operator_id)}</td>
                    <td className="py-2 text-right">
                      {row.type === "payment" && !row.refund_id ? (
                        <button
                          type="button"
                          className={btn}
                          disabled={refunding !== null}
                          onClick={() => refund(row.id)}
                        >
                          {refunding === row.id ? "…" : t("type.refund")}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span>
            {t("admin.page")} {txPage} / {txPages} · {txTotal} {t("admin.records")}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={txPage <= 1}
              onClick={() => setTxPage((p) => p - 1)}
              className="rounded-lg bg-slate-100 px-3 py-1.5 font-semibold disabled:opacity-40"
            >
              {t("admin.prev")}
            </button>
            <button
              type="button"
              disabled={txPage >= txPages}
              onClick={() => setTxPage((p) => p + 1)}
              className="rounded-lg bg-slate-100 px-3 py-1.5 font-semibold disabled:opacity-40"
            >
              {t("admin.next")}
            </button>
          </div>
        </div>
      </div>

      <div className={card}>
        <p className="text-sm font-bold">{t("admin.auditTitle")}</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2 pr-3">{t("tx.time")}</th>
                <th className="py-2 pr-3">{t("admin.operator")}</th>
                <th className="py-2 pr-3">{t("admin.role")}</th>
                <th className="py-2 pr-3">{t("admin.actions")}</th>
                <th className="py-2 pr-3">{t("admin.entity")}</th>
                <th className="py-2">{t("admin.detail")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {audit.map((a, i) => (
                <tr key={`${txt(a.id)}-${i}`}>
                  <td className="whitespace-nowrap py-2 pr-3 text-slate-500">
                    {when(a.created_at)}
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs">{txt(a.actor_id)}</td>
                  <td className="py-2 pr-3 capitalize text-slate-500">{txt(a.actor_role)}</td>
                  <td className="py-2 pr-3 font-semibold">{txt(a.action)}</td>
                  <td className="py-2 pr-3 text-slate-500">
                    {a.entity
                      ? `${txt(a.entity)} ${a.entity_id == null ? "" : txt(a.entity_id)}`
                      : "—"}
                  </td>
                  <td className="max-w-[18rem] truncate py-2 font-mono text-xs text-slate-400">
                    {txt(a.detail)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span>
            {t("admin.page")} {auditPage} / {auditPages} · {auditTotal} {t("admin.entries")}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={auditPage <= 1}
              onClick={() => setAuditPage((p) => p - 1)}
              className="rounded-lg bg-slate-100 px-3 py-1.5 font-semibold disabled:opacity-40"
            >
              {t("admin.prev")}
            </button>
            <button
              type="button"
              disabled={auditPage >= auditPages}
              onClick={() => setAuditPage((p) => p + 1)}
              className="rounded-lg bg-slate-100 px-3 py-1.5 font-semibold disabled:opacity-40"
            >
              {t("admin.next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}