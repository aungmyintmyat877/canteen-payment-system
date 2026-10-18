#!/usr/bin/env node
// ============================================================================
// End-to-end API smoke test.
//   npm run smoke            (against http://127.0.0.1:3000)
//   node scripts/smoke.mjs http://127.0.0.1:4000
//
// Verifies: login for all roles, role separation, QR signature verification
// (incl. forged signatures), top-up, idempotent replay (serial + concurrent),
// PIN-authorized payment, wrong-PIN rejection, insufficient-funds rejection,
// concurrency correctness under parallel mixed traffic (FOR UPDATE), refunds
// (incl. double-refund guard), audit log and admin summary.
//
// NOTE: mutates demo data. Re-run `npm run seed` for a fresh dataset.
// ============================================================================
import { randomUUID } from "node:crypto";

const BASE = process.argv[2] || process.env.BASE_URL || "http://127.0.0.1:3000";
const STUDENT_ID = "S001";
const PIN = "123456";

let passed = 0;
let failed = 0;

function check(name, cond, extra = "") {
  if (cond) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

function client() {
  let cookie = "";
  return async function req(method, path, body) {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      if (pair.startsWith("canteen_session=")) cookie = pair;
    }
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* empty body */
    }
    return { status: res.status, json };
  };
}

const asStudent = client();
const asCashier = client();
const asAdmin = client();
const asAnon = client();

async function balanceOf() {
  const r = await asCashier("POST", "/api/cashier/scan", { studentId: STUDENT_ID, manual: true });
  return r.json.student.balance;
}

console.log(`Smoke test against ${BASE}\n`);

// ---------------------------------------------------------------------------
console.log("[1] Authentication & role separation");
{
  const r = await asStudent("POST", "/api/auth/login", { role: "student", id: STUDENT_ID, pin: PIN });
  check("student login returns redirect", r.status === 200 && r.json.redirect === "/student");

  const bad = await asAnon("POST", "/api/auth/login", { role: "student", id: STUDENT_ID, pin: "999999" });
  check("wrong PIN rejected with 401", bad.status === 401);

  const forbidden = await asStudent("POST", "/api/cashier/scan", { studentId: STUDENT_ID, manual: true });
  check("student blocked from cashier scan (403)", forbidden.status === 403);

  const anonQr = await asAnon("GET", "/api/student/qr");
  check("anonymous blocked from student QR (401)", anonQr.status === 401);

  await asCashier("POST", "/api/auth/login", { role: "staff", id: "C001", pin: PIN });
  await asAdmin("POST", "/api/auth/login", { role: "staff", id: "A001", pin: PIN });

  const adminScan = await asAdmin("POST", "/api/cashier/topup", {
    studentId: STUDENT_ID,
    manual: true,
    amount: 100,
    idempotency_key: randomUUID(),
  });
  check("admin blocked from cashier top-up (403)", adminScan.status === 403);

  const cashierRefund = await asCashier("POST", "/api/admin/refund", { transaction_id: 1 });
  check("cashier blocked from admin refund (403)", cashierRefund.status === 403);
}

// ---------------------------------------------------------------------------
console.log("[2] QR signing");
let qrPayload = "";
{
  const r = await asStudent("GET", "/api/student/qr");
  qrPayload = r.json?.payload ?? "";
  check("student QR payload issued", r.status === 200 && qrPayload.startsWith(`${STUDENT_ID}.`));

  const forged = await asCashier("POST", "/api/cashier/scan", {
    payload: `${STUDENT_ID}.${"0".repeat(32)}`,
  });
  check("forged QR signature rejected", forged.status === 400 && forged.json?.error?.code === "QR_INVALID_SIGNATURE");

  const malformed = await asCashier("POST", "/api/cashier/scan", { payload: "garbage" });
  check("malformed QR rejected", malformed.status === 400);
}

// ---------------------------------------------------------------------------
console.log("[3] Top-up with idempotency");
{
  const before = await balanceOf();
  const key = randomUUID();

  const r1 = await asCashier("POST", "/api/cashier/topup", {
    payload: qrPayload,
    amount: 10000,
    idempotency_key: key,
  });
  check("top-up succeeds", r1.status === 200 && r1.json.transaction.type === "topup");
  check("balance increased by 10000", r1.json.student.balance === before + 10000);

  const r2 = await asCashier("POST", "/api/cashier/topup", {
    payload: qrPayload,
    amount: 10000,
    idempotency_key: key,
  });
  check(
    "replay returns duplicate:true with same tx id",
    r2.status === 200 &&
      r2.json.duplicate === true &&
      Number(r2.json.transaction.id) === Number(r1.json.transaction.id)
  );
  const after = await balanceOf();
  check("no double credit on replay", after === before + 10000, `balance ${after}, expected ${before + 10000}`);
}

// ---------------------------------------------------------------------------
console.log("[4] Payment with PIN");
let paymentTxId = 0;
{
  const before = await balanceOf();

  const wrongPin = await asCashier("POST", "/api/cashier/payment", {
    payload: qrPayload,
    amount: 2500,
    pin: "000000",
    idempotency_key: randomUUID(),
  });
  check("wrong PIN rejected (401)", wrongPin.status === 401 && wrongPin.json?.error?.code === "WRONG_PIN");

  const r = await asCashier("POST", "/api/cashier/payment", {
    payload: qrPayload,
    amount: 2500,
    pin: PIN,
    idempotency_key: randomUUID(),
  });
  check("payment succeeds with negative ledger amount", r.status === 200 && r.json.transaction.amount === -2500);
  check("balance decremented", r.json.student.balance === before - 2500);
  paymentTxId = r.json.transaction.id;

  // Above the balance (~30k here) but below the 5M per-tx cap.
  const broke = await asCashier("POST", "/api/cashier/payment", {
    payload: qrPayload,
    amount: 4_000_000,
    pin: PIN,
    idempotency_key: randomUUID(),
  });
  check("insufficient funds rejected", broke.status === 400 && broke.json?.error?.code === "INSUFFICIENT_FUNDS");

  const tooBig = await asCashier("POST", "/api/cashier/payment", {
    payload: qrPayload,
    amount: 99_999_999,
    pin: PIN,
    idempotency_key: randomUUID(),
  });
  check("amount above per-tx cap rejected", tooBig.status === 400 && tooBig.json?.error?.code === "AMOUNT_TOO_LARGE");
}

// ---------------------------------------------------------------------------
console.log("[5] Concurrency: parallel mixed traffic (FOR UPDATE)");
{
  const before = await balanceOf();
  const payments = 6;
  const topups = 2;
  const tasks = [];
  for (let i = 0; i < payments; i += 1) {
    tasks.push(
      asCashier("POST", "/api/cashier/payment", {
        payload: qrPayload,
        amount: 1000,
        pin: PIN,
        idempotency_key: randomUUID(),
      })
    );
  }
  for (let i = 0; i < topups; i += 1) {
    tasks.push(
      asCashier("POST", "/api/cashier/topup", {
        payload: qrPayload,
        amount: 500,
        idempotency_key: randomUUID(),
      })
    );
  }
  const results = await Promise.all(tasks);
  const allOk = results.every((r) => r.status === 200);
  check("all 8 parallel operations succeed", allOk, JSON.stringify(results.map((r) => r.status)));

  const expected = before - payments * 1000 + topups * 500;
  const final = await balanceOf();
  check(
    "no lost updates — balance exactly matches ledger sum",
    final === expected,
    `balance ${final}, expected ${expected}`
  );

  // Same idempotency key fired 3 times in parallel → exactly one charge.
  const before3 = await balanceOf();
  const sharedKey = randomUUID();
  const triplicate = await Promise.all([
    asCashier("POST", "/api/cashier/payment", { payload: qrPayload, amount: 300, pin: PIN, idempotency_key: sharedKey }),
    asCashier("POST", "/api/cashier/payment", { payload: qrPayload, amount: 300, pin: PIN, idempotency_key: sharedKey }),
    asCashier("POST", "/api/cashier/payment", { payload: qrPayload, amount: 300, pin: PIN, idempotency_key: sharedKey }),
  ]);
  const oneReal = triplicate.filter((r) => r.status === 200 && r.json.duplicate === false).length;
  const sameTx = new Set(triplicate.map((r) => Number(r.json?.transaction?.id ?? 0))).size === 1;
  const final3 = await balanceOf();
  check(
    "3 concurrent same-key requests → exactly one charge",
    oneReal === 1 && sameTx && final3 === before3 - 300,
    `statuses ${JSON.stringify(triplicate.map((r) => r.status))}, ids ${JSON.stringify(triplicate.map((r) => r.json?.transaction?.id))}`
  );
}

// ---------------------------------------------------------------------------
console.log("[6] Refunds (admin)");
{
  const before = await balanceOf();

  // Explicit client key so we can also test replay of the refund request.
  const refundKey = randomUUID();
  const r = await asAdmin("POST", "/api/admin/refund", {
    transaction_id: paymentTxId,
    idempotency_key: refundKey,
    note: "smoke test refund",
  });
  check("refund creates new positive ledger row", r.status === 200 && r.json.transaction.type === "refund" && r.json.transaction.amount === 2500);
  check("refund links to original payment", r.json.transaction.refund_of === paymentTxId);
  check("balance credited", r.json.student.balance === before + 2500);

  const replay = await asAdmin("POST", "/api/admin/refund", {
    transaction_id: paymentTxId,
    idempotency_key: refundKey,
  });
  check(
    "refund replay with same key returns duplicate (no double credit)",
    replay.status === 200 && replay.json.duplicate === true
  );

  const again = await asAdmin("POST", "/api/admin/refund", {
    transaction_id: paymentTxId,
    idempotency_key: randomUUID(),
  });
  check("second refund with a NEW key rejected (409)", again.status === 409 && again.json?.error?.code === "ALREADY_REFUNDED");

  const notPayment = await asAdmin("POST", "/api/admin/refund", { transaction_id: r.json.transaction.id });
  check("refunding a refund rejected", notPayment.status === 400 && notPayment.json?.error?.code === "NOT_A_PAYMENT");

  const missing = await asAdmin("POST", "/api/admin/refund", { transaction_id: 99999999 });
  check("unknown transaction 404", missing.status === 404);
}

// ---------------------------------------------------------------------------
console.log("[7] Student data & admin reporting");
{
  const hist = await asStudent("GET", "/api/student/transactions?page=1&pageSize=50");
  check("student history paginated", hist.status === 200 && hist.json.items.length > 0 && hist.json.total >= hist.json.items.length);

  const card = await asStudent("GET", "/api/student/id-card");
  check("ID card data includes signed QR payload", card.status === 200 && typeof card.json.qr_payload === "string");
  check("ID card payload never leaks qr_secret", !JSON.stringify(card.json).includes("qr_secret"));

  const summary = await asAdmin("GET", "/api/admin/summary");
  check("admin summary has today's totals", summary.status === 200 && summary.json.today.topup.total > 0);

  const audit = await asAdmin("GET", "/api/admin/audit?page=1&pageSize=100");
  const actions = new Set(audit.json.items.map((a) => a.action));
  check(
    "audit log records topup/payment/refund/scan",
    audit.status === 200 &&
      actions.has("topup") &&
      actions.has("payment") &&
      actions.has("refund") &&
      actions.has("scan")
  );
}

console.log(`\nResult: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
