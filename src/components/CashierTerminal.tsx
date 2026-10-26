"use client";

import { useEffect, useRef, useState } from "react";
import QRScanner from "@/components/QRScanner";
import PinPad from "@/components/PinPad";
import { formatMoney, parseMajorToMinor } from "@/lib/money";
import { DEBT_LIMIT_MINOR } from "@/lib/config";
import { useLang } from "@/lib/i18n/LanguageProvider";

interface ScannedStudent {
  id: string;
  name: string;
  year: number;
  photo_url: string | null;
  balance: number;
  status: string;
}

interface StudentRef {
  payload?: string;
  studentId?: string;
  manual?: boolean;
}

interface LogEntry {
  at: string;
  kind: "ok" | "err" | "info";
  text: string;
}

type Mode = "topup" | "payment";

/**
 * Cashier terminal: scan → verify student → top-up or PIN-authorized payment.
 *
 * Idempotency-key lifecycle: a fresh UUID is generated whenever the intent
 * changes (student, mode, or amount) and reused across retries of the same
 * intent, so a double-click or network retry can never double-charge. After
 * a successful operation the key is rotated for the next one.
 */
export default function CashierTerminal({
  cashierName,
  allowManual,
}: {
  cashierName: string;
  allowManual: boolean;
}) {
  const { t } = useLang();
  const [student, setStudent] = useState<ScannedStudent | null>(null);
  const studentRef = useRef<StudentRef>({});
  const [mode, setMode] = useState<Mode>("topup");
  const [amountText, setAmountText] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [manualId, setManualId] = useState("");
  const [scanning, setScanning] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const idemRef = useRef<string>("");

  const amountMinor = parseMajorToMinor(amountText);

  // Rotate the idempotency key whenever the transaction intent changes.
  useEffect(() => {
    idemRef.current =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }, [student?.id, mode, amountText]);

  function addLog(kind: LogEntry["kind"], text: string) {
    setLog((prev) =>
      [{ at: new Date().toLocaleTimeString("en-US", { hour12: false }), kind, text }, ...prev].slice(0, 8)
    );
  }

  async function handleScanText(payload: string) {
    setScanning(true);
    setNotice(null);
    try {
      const res = await fetch("/api/cashier/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        addLog("err", data?.error?.message ?? t("cashier.scanFailed"));
        return;
      }
      studentRef.current = { payload };
      applyStudent(data.student, data.via === "manual");
    } catch {
      addLog("err", t("cashier.networkScan"));
    } finally {
      setScanning(false);
    }
  }

  async function handleManualLookup() {
    const id = manualId.trim();
    if (!id) return;
    setScanning(true);
    setNotice(null);
    try {
      const res = await fetch("/api/cashier/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: id, manual: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        addLog("err", data?.error?.message ?? t("cashier.lookupFailed"));
        return;
      }
      studentRef.current = { studentId: id, manual: true };
      applyStudent(data.student, true);
    } catch {
      addLog("err", t("cashier.networkLookup"));
    } finally {
      setScanning(false);
    }
  }

  function applyStudent(s: ScannedStudent, manual: boolean) {
    setStudent(s);
    setAmountText("");
    setPin("");
    setNotice(null);
    addLog(
      "info",
      `${manual ? t("cashier.lookedUp") : t("cashier.scanned")} ${s.name} (${s.id}) — ${t("cashier.balanceShort")} ${formatMoney(s.balance)}`
    );
  }

  function resetTerminal() {
    setStudent(null);
    studentRef.current = {};
    setAmountText("");
    setPin("");
    setNotice(null);
  }

  async function submit() {
    if (!student || busy) return;
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      setNotice({ kind: "err", text: t("cashier.invalidAmount") });
      return;
    }
        if (pin.length < 4) {
      setNotice({
        kind: "err",
        text: mode === "topup" ? t("cashier.askCashierPin") : t("cashier.askPin"),
      });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(mode === "topup" ? "/api/cashier/topup" : "/api/cashier/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...studentRef.current,
                   amount: amountMinor,
          pin: mode === "payment" ? pin : undefined,
          operator_pin: mode === "topup" ? pin : undefined,
          idempotency_key: idemRef.current,
        }),
      });
      const data = await res.json();

           if (!res.ok) {
        const code = data?.error?.code as string | undefined;
        let text: string;
        if (code === "WRONG_STAFF_PIN" || code === "BAD_STAFF_PIN") {
          text = t("cashier.wrongCashierPin");
        } else if (code === "DEBT_LIMIT_EXCEEDED") {
          text = `${t("cashier.debtLimitHit")} (${t("cashier.debtAllowanceLeft")}: ${formatMoney(
            DEBT_LIMIT_MINOR + student.balance
          )})`;
        } else {
          const extra =
            code === "INSUFFICIENT_FUNDS"
              ? ` (${t("cashier.balanceShort")} ${formatMoney(data.error.balance)})`
              : "";
          text = (data?.error?.message ?? t("cashier.requestFailed")) + extra;
        }
        setNotice({ kind: "err", text });
        
        addLog(
          "err",
          `${mode === "topup" ? t("type.topup") : t("type.payment")} ${t("cashier.failedWord")}: ${data?.error?.message ?? "?"}`
        );
        return; // key is intentionally kept: retrying the same intent dedupes server-side
      }

      // RENAMED t -> tx so it can never shadow the translation function t()
      const tx = data.transaction;
      if (data.duplicate) {
        setNotice({
          kind: "ok",
          text: `${t("cashier.dupAlready")} (tx #${tx.id}) — ${t("cashier.noDouble")} ${t("cashier.newBalance")} ${formatMoney(tx.balance_after)}.`,
        });
        addLog(
          "ok",
          `${t("cashier.replayLog")} ${tx.type === "topup" ? t("type.topup") : t("type.payment")} tx #${tx.id} — ${t("cashier.noDouble")}`
        );
      } else {
        setNotice({
          kind: "ok",
          text: `${formatMoney(tx.amount)} ${tx.type === "topup" ? t("type.topup") : t("type.payment")} ${t("cashier.recorded")} (tx #${tx.id}). ${t("cashier.newBalance")} ${formatMoney(tx.balance_after)}.`,
        });
        addLog(
          "ok",
          `${tx.type === "topup" ? t("type.topup") : t("type.payment")} ${formatMoney(tx.amount)} ${student.name} ${t("cashier.forWord")} — tx #${tx.id}`
        );
      }
      setStudent({ ...student, balance: tx.student.balance });
      idemRef.current =
        typeof crypto.randomUUID === "function" ? crypto.randomUUID() : String(Date.now());
      setPin("");
    } catch {
      setNotice({ kind: "err", text: t("cashier.networkRetry") });
      addLog("err", t("cashier.networkSubmit"));
    } finally {
      setBusy(false);
    }
  }

  const labelCls = "text-sm font-medium text-slate-600";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Left: scanning */}
      <section className="rounded-2xl bg-white p-6 shadow">
        <h2 className="text-lg font-bold">{t("cashier.step1")}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {t("admin.signedIn")} <strong className="text-slate-700">{cashierName}</strong>.{" "}
          {t("cashier.hmacNote")}
        </p>
        <div className="mt-4">
          <QRScanner onResult={handleScanText} paused={busy || scanning} />
        </div>

        {allowManual && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className={labelCls}>{t("cashier.manualEntry")}</p>
            <div className="mt-2 flex gap-2">
              <input
                value={manualId}
                onChange={(e) => setManualId(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && handleManualLookup()}
                placeholder={t("cashier.manualPlaceholder")}
                className="w-40 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={handleManualLookup}
                disabled={scanning}
                className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
              >
                {t("cashier.lookup")}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Right: student + action */}
      <section className="space-y-4">
        {!student ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white/60 p-10 text-center text-slate-400">
            {t("cashier.waiting")}
          </div>
        ) : (
          <>
            <div className="rounded-2xl bg-white p-6 shadow">
              <div className="flex items-center gap-4">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-200">
                  {student.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={student.photo_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xl font-bold text-slate-500">
                      {student.name
                        .split(/\s+/)
                        .map((w) => w[0])
                        .slice(0, 2)
                        .join("")}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                                   <p className="truncate text-lg font-bold">
                    {student.name}{" "}
                    {student.status !== "active" && (
                      <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                        {t("cashier.blockedBadge")}
                      </span>
                    )}
                    {student.balance < 0 && (
                      <span className="ml-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                        {t("cashier.debtBadge")}
                      </span>
                    )}
                  </p>
                                  <p className="text-sm text-slate-500">
                    {student.id} · {t("student.year")} {student.year}
                  </p>
                  <p
                    className={`mt-1 text-2xl font-extrabold tabular-nums ${
                      student.balance < 0 ? "text-rose-700" : "text-blue-700"
                    }`}
                  >
                    {formatMoney(student.balance)}
                  </p>
                  {student.balance < 0 && (
                    <p className="text-xs font-semibold text-rose-500">
                      {t("cashier.debtAllowanceLeft")}: {formatMoney(DEBT_LIMIT_MINOR + student.balance)}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={resetTerminal}
                  className="ml-auto self-start rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                >
                  {t("cashier.new")}
                </button>
              </div>
              <p className="mt-3 text-xs text-slate-400">{t("cashier.verifyPhoto")}</p>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow">
              <h2 className="text-lg font-bold">{t("cashier.step2")}</h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(["topup", "payment"] as Mode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`rounded-xl border-2 px-4 py-3 text-sm font-bold capitalize transition ${
                      mode === m
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-slate-200 text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    {m === "topup" ? t("cashier.modeTopup") : t("cashier.modePayment")}
                  </button>
                ))}
              </div>

              <div className="mt-4">
                <label className={labelCls} htmlFor="amount">
                  {t("cashier.amount")}
                </label>
                <div className="mt-1 flex items-center rounded-xl border border-slate-300 px-4 focus-within:border-blue-500">
                  <span className="text-lg font-semibold text-slate-400">$</span>
                  <input
                    id="amount"
                    inputMode="decimal"
                    value={amountText}
                    onChange={(e) => setAmountText(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-transparent px-2 py-2.5 text-2xl font-bold tabular-nums outline-none"
                  />
                </div>
              </div>

                           <div
                className={`mt-4 rounded-xl p-4 ${
                  mode === "topup" ? "border border-amber-200 bg-amber-50" : "bg-slate-50"
                }`}
              >
                <p
                  className={`text-sm font-semibold ${
                    mode === "topup" ? "text-amber-800" : "text-slate-700"
                  }`}
                >
                  {mode === "topup" ? t("cashier.cashierPinTitle") : t("cashier.step3")}
                </p>
                <p className={`mb-3 text-xs ${mode === "topup" ? "text-amber-600" : "text-slate-500"}`}>
                  {mode === "topup" ? t("cashier.cashierPinNote") : t("cashier.pinNote")}
                </p>
                <PinPad value={pin} onChange={setPin} disabled={busy} />
              </div>

              {notice && (
                <p
                  className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
                    notice.kind === "ok"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-red-200 bg-red-50 text-red-700"
                  }`}
                >
                  {notice.text}
                </p>
              )}

              <button
                type="button"
                onClick={submit}
                disabled={busy}
                className={`mt-4 w-full rounded-xl py-3.5 text-base font-bold text-white disabled:opacity-50 ${
                  mode === "topup" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {busy
                  ? t("cashier.processing")
                  : mode === "topup"
                    ? `${t("cashier.topupBtn")} ${Number.isFinite(amountMinor) && amountMinor > 0 ? formatMoney(amountMinor) : ""}`
                    : `${t("cashier.chargeBtn")} ${Number.isFinite(amountMinor) && amountMinor > 0 ? formatMoney(amountMinor) : ""} ${t("cashier.pinRequired")}`}
              </button>
            </div>
          </>
        )}

        <div className="rounded-2xl bg-white p-5 shadow">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t("cashier.sessionLog")}
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            {log.length === 0 && <li className="text-slate-300">{t("cashier.nothingYet")}</li>}
            {log.map((l, i) => (
              <li
                key={i}
                className={
                  l.kind === "ok"
                    ? "text-emerald-700"
                    : l.kind === "err"
                      ? "text-red-600"
                      : "text-slate-500"
                }
              >
                <span className="mr-2 font-mono text-slate-400">{l.at}</span>
                {l.text}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}