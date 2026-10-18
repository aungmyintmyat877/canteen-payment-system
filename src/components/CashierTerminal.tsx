"use client";

import { useEffect, useRef, useState } from "react";
import QRScanner from "@/components/QRScanner";
import PinPad from "@/components/PinPad";
import { formatMoney, parseMajorToMinor } from "@/lib/money";

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
        addLog("err", data?.error?.message ?? "Scan failed.");
        return;
      }
      studentRef.current = { payload };
      applyStudent(data.student, data.via === "manual");
    } catch {
      addLog("err", "Network error while verifying the QR code.");
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
        addLog("err", data?.error?.message ?? "Lookup failed.");
        return;
      }
      studentRef.current = { studentId: id, manual: true };
      applyStudent(data.student, true);
    } catch {
      addLog("err", "Network error while looking up the student.");
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
      `${manual ? "Looked up" : "Scanned"} ${s.name} (${s.id}) — balance ${formatMoney(s.balance)}`
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
      setNotice({ kind: "err", text: "Enter a valid amount, e.g. 12.50" });
      return;
    }
    if (mode === "payment" && pin.length < 4) {
      setNotice({ kind: "err", text: "Ask the student to enter their PIN." });
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
          idempotency_key: idemRef.current,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        const extra =
          data?.error?.code === "INSUFFICIENT_FUNDS"
            ? ` (balance ${formatMoney(data.error.balance)})`
            : "";
        setNotice({ kind: "err", text: (data?.error?.message ?? "Request failed.") + extra });
        addLog("err", `${mode === "topup" ? "Top-up" : "Payment"} failed: ${data?.error?.message ?? "?"}`);
        return; // key is intentionally kept: retrying the same intent dedupes server-side
      }

      const t = data.transaction;
      if (data.duplicate) {
        setNotice({
          kind: "ok",
          text: `Already processed earlier (tx #${t.id}) — no double charge. New balance ${formatMoney(t.balance_after)}.`,
        });
        addLog("ok", `Replayed duplicate ${t.type} tx #${t.id} — no double charge.`);
      } else {
        setNotice({
          kind: "ok",
          text: `${t.type === "topup" ? "Top-up" : "Payment"} of ${formatMoney(t.amount)} recorded (tx #${t.id}). New balance ${formatMoney(t.balance_after)}.`,
        });
        addLog("ok", `${t.type} ${formatMoney(t.amount)} for ${student.name} — tx #${t.id}`);
      }
      setStudent({ ...student, balance: t.student.balance });
      idemRef.current =
        typeof crypto.randomUUID === "function" ? crypto.randomUUID() : String(Date.now());
      setPin("");
    } catch {
      setNotice({ kind: "err", text: "Network error — safe to retry, the server deduplicates." });
      addLog("err", "Network error during submission.");
    } finally {
      setBusy(false);
    }
  }

  const labelCls = "text-sm font-medium text-slate-600";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Left: scanning */}
      <section className="rounded-2xl bg-white p-6 shadow">
        <h2 className="text-lg font-bold">1 · Scan student pass</h2>
        <p className="mt-1 text-sm text-slate-500">
          Signed at {cashierName}&apos;s terminal. The server verifies the HMAC
          signature before anything else happens.
        </p>
        <div className="mt-4">
          <QRScanner onResult={handleScanText} paused={busy || scanning} />
        </div>

        {allowManual && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className={labelCls}>Manual entry (dev mode)</p>
            <div className="mt-2 flex gap-2">
              <input
                value={manualId}
                onChange={(e) => setManualId(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && handleManualLookup()}
                placeholder="e.g. S001"
                className="w-40 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={handleManualLookup}
                disabled={scanning}
                className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
              >
                Look up
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Right: student + action */}
      <section className="space-y-4">
        {!student ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white/60 p-10 text-center text-slate-400">
            Waiting for a scan…
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
                        BLOCKED
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-slate-500">
                    {student.id} · Year {student.year}
                  </p>
                  <p className="mt-1 text-2xl font-extrabold text-blue-700 tabular-nums">
                    {formatMoney(student.balance)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetTerminal}
                  className="ml-auto self-start rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                >
                  New
                </button>
              </div>
              <p className="mt-3 text-xs text-slate-400">
                Verify the photo against the person in front of you before
                continuing.
              </p>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow">
              <h2 className="text-lg font-bold">2 · Choose transaction</h2>
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
                    {m === "topup" ? "Top-up (cash in)" : "Payment (spend)"}
                  </button>
                ))}
              </div>

              <div className="mt-4">
                <label className={labelCls} htmlFor="amount">
                  Amount
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

              {mode === "payment" && (
                <div className="mt-4 rounded-xl bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-700">
                    3 · Student authorizes with PIN
                  </p>
                  <p className="mb-3 text-xs text-slate-500">
                    Hand the device to the student. The PIN is verified against
                    the stored bcrypt hash — it is never stored or logged.
                  </p>
                  <PinPad value={pin} onChange={setPin} disabled={busy} />
                </div>
              )}

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
                  ? "Processing…"
                  : mode === "topup"
                    ? `Top up ${Number.isFinite(amountMinor) && amountMinor > 0 ? formatMoney(amountMinor) : ""}`
                    : `Charge ${Number.isFinite(amountMinor) && amountMinor > 0 ? formatMoney(amountMinor) : ""} (PIN required)`}
              </button>
            </div>
          </>
        )}

        <div className="rounded-2xl bg-white p-5 shadow">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Session log
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            {log.length === 0 && <li className="text-slate-300">Nothing yet.</li>}
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
