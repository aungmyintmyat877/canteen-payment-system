import bcrypt from "bcryptjs";
import { withTransaction, pool, asNumber, asString } from "./db";
import { ApiError } from "./api";
import { resolveStudentRef, qrSignature } from "./qr";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";

/**
 * LEDGER CORE
 * -----------
 * All balance mutations share the same shape:
 *
 *   BEGIN TRANSACTION
 *     SELECT ... FROM students WHERE id = ? FOR UPDATE   ← row lock:
 *         any other transaction touching this student blocks here until
 *         COMMIT/ROLLBACK, so two cashiers can never interleave writes.
 *     re-check idempotency key under the lock
 *     UPDATE students SET balance = balance ± ?
 *     INSERT INTO transactions (...)                     ← ledger row carries
 *         balance_after, written atomically with the update
 *     INSERT INTO audit_logs (...)
 *   COMMIT
 *
 * The UNIQUE(idempotency_key) index is the final authority against
 * double-charging: even if two identical requests race past the pre-checks,
 * exactly one INSERT succeeds; the loser is turned into a replay response.
 */

export const MAX_AMOUNT_MINOR = 5_000_000; // hard cap per operation (50,000.00)

export interface Actor {
  id: string;
  name: string;
  role: "student" | "cashier" | "admin";
}

export interface TxRecord {
  id: number;
  student_id: string;
  type: "topup" | "payment" | "refund";
  amount: number;
  balance_after: number;
  operator_id: string | null;
  note: string | null;
  refund_of: number | null;
  created_at: Date | string;
}

export interface TxResult {
  duplicate: boolean;
  transaction: TxRecord;
  student: { id: string; name: string; balance: number };
}

interface StudentLockedRow extends RowDataPacket {
  id: string;
  name: string;
  balance: string;
  status: string;
  qr_secret: string;
}

interface TxRow extends RowDataPacket {
  id: number;
  student_id: string;
  type: "topup" | "payment" | "refund";
  amount: string;
  balance_after: string;
  operator_id: string | null;
  note: string | null;
  refund_of: number | null;
  created_at: Date;
}

const TX_COLUMNS =
  "id, student_id, type, amount, balance_after, operator_id, note, refund_of, created_at";

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function assertAmount(amount: unknown): number {
  const n = asNumber(amount);
  if (!Number.isSafeInteger(n) || n <= 0) {
    throw new ApiError(
      400,
      "BAD_AMOUNT",
      "Amount must be a positive integer in minor units (e.g. 1250 = $12.50)."
    );
  }
  if (n > MAX_AMOUNT_MINOR) {
    throw new ApiError(
      400,
      "AMOUNT_TOO_LARGE",
      `A single transaction is capped at ${MAX_AMOUNT_MINOR} minor units.`
    );
  }
  return n;
}

function assertIdempotencyKey(value: unknown): string {
  const key = asString(value).trim();
  if (!/^[A-Za-z0-9._:-]{8,64}$/.test(key)) {
    throw new ApiError(
      400,
      "BAD_IDEMPOTENCY_KEY",
      "idempotency_key must be 8-64 characters of [A-Za-z0-9._:-] (a UUID works)."
    );
  }
  return key;
}

function isDuplicateEntry(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "ER_DUP_ENTRY"
  );
}

// ---------------------------------------------------------------------------
// Shared queries
// ---------------------------------------------------------------------------

async function findTransactionByKey(key: string): Promise<TxRow | null> {
  const [rows] = await pool.execute<TxRow[]>(
    `SELECT ${TX_COLUMNS} FROM transactions WHERE idempotency_key = ? LIMIT 1`,
    [key]
  );
  return rows[0] ?? null;
}

/**
 * Lock the student's row for the rest of the transaction. This is the
 * concurrency keystone: with InnoDB's default REPEATABLE READ, every other
 * balance-modifying transaction for this student waits here until we commit.
 */
async function lockStudentForUpdate(
  conn: PoolConnection,
  studentId: string
): Promise<StudentLockedRow> {
  const [rows] = await conn.execute<StudentLockedRow[]>(
    "SELECT id, name, balance, status, qr_secret FROM students WHERE id = ? FOR UPDATE",
    [studentId]
  );
  if (rows.length === 0) {
    throw new ApiError(404, "STUDENT_NOT_FOUND", "Student record not found.");
  }
  return rows[0];
}

async function insertAudit(
  conn: PoolConnection,
  entry: {
    actor: Actor;
    action: string;
    entity?: string;
    entityId?: string;
    detail?: Record<string, unknown>;
  }
): Promise<void> {
  await conn.execute(
    `INSERT INTO audit_logs (actor_id, actor_role, action, entity, entity_id, detail)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      entry.actor.id,
      entry.actor.role,
      entry.action,
      entry.entity ?? null,
      entry.entityId ?? null,
      entry.detail ? JSON.stringify(entry.detail) : null,
    ]
  );
}

function txPublic(t: TxRow): TxRecord {
  return {
    id: asNumber(t.id),
    student_id: t.student_id,
    type: t.type,
    amount: asNumber(t.amount),
    balance_after: asNumber(t.balance_after),
    operator_id: t.operator_id,
    note: t.note,
    refund_of: t.refund_of === null ? null : asNumber(t.refund_of),
    created_at: t.created_at,
  };
}

async function studentSnapshot(
  studentId: string
): Promise<{ id: string; name: string; balance: number }> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT id, name, balance FROM students WHERE id = ?",
    [studentId]
  );
  return {
    id: asString(rows[0]?.id),
    name: asString(rows[0]?.name),
    balance: asNumber(rows[0]?.balance),
  };
}

/**
 * Re-verify the QR signature against the qr_secret on the row we just locked.
 * Closes the tiny window where a pass could be verified, then its secret
 * rotated, before the money moved. Skipped for manual (dev-only) lookups.
 */
function verifyLockedStudentQr(
  student: StudentLockedRow,
  ref: Record<string, unknown>
): void {
  const payload = typeof ref.payload === "string" ? ref.payload : "";
  if (!payload) return; // manual entry path
  const dot = payload.indexOf(".");
  const signature = dot > 0 ? payload.slice(dot + 1) : "";
  const expected = qrSignature(student.id, asString(student.qr_secret));
  if (
    dot <= 0 ||
    signature.length !== expected.length ||
    signature !== expected
  ) {
    throw new ApiError(
      400,
      "QR_INVALID_SIGNATURE",
      "QR signature check failed — this pass may be forged."
    );
  }
}

/** Shared replay path when the idempotency index says "already done". */
async function replayResult(key: string): Promise<TxResult> {
  const existing = await findTransactionByKey(key);
  if (!existing) {
    throw new ApiError(
      409,
      "IDEMPOTENCY_CONFLICT",
      "This idempotency key exists but its transaction could not be read."
    );
  }
  return {
    duplicate: true,
    transaction: txPublic(existing),
    student: await studentSnapshot(existing.student_id),
  };
}

// ---------------------------------------------------------------------------
// Top-up (cashier)
// ---------------------------------------------------------------------------

export async function processTopup(input: {
  ref: Record<string, unknown>;
  amount: unknown;
  idempotencyKey: unknown;
  operator: Actor;
}): Promise<TxResult> {
  const amount = assertAmount(input.amount);
  const key = assertIdempotencyKey(input.idempotencyKey);
  const { studentId } = await resolveStudentRef(input.ref);

  // Fast path: this exact request was already committed — replay it.
  if (await findTransactionByKey(key)) {
    return replayResult(key);
  }

  try {
    return await withTransaction(async (conn) => {
      const student = await lockStudentForUpdate(conn, studentId);
      if (asString(student.status) !== "active") {
        throw new ApiError(403, "STUDENT_BLOCKED", "This student account is blocked.");
      }

      // Race closer: another request may have committed this key while we
      // waited for the row lock.
      const [dupe] = await conn.execute<TxRow[]>(
        `SELECT ${TX_COLUMNS} FROM transactions WHERE idempotency_key = ? LIMIT 1`,
        [key]
      );
      if (dupe[0]) {
        return {
          duplicate: true,
          transaction: txPublic(dupe[0]),
          student: {
            id: student.id,
            name: student.name,
            balance: asNumber(student.balance),
          },
        };
      }

      verifyLockedStudentQr(student, input.ref);

      const newBalance = asNumber(student.balance) + amount;
      await conn.execute(
        "UPDATE students SET balance = balance + ? WHERE id = ?",
        [amount, studentId]
      );
      const [ins] = await conn.execute<ResultSetHeader>(
        `INSERT INTO transactions (student_id, type, amount, balance_after, operator_id, idempotency_key)
         VALUES (?, 'topup', ?, ?, ?, ?)`,
        [studentId, amount, newBalance, input.operator.id, key]
      );
      await insertAudit(conn, {
        actor: input.operator,
        action: "topup",
        entity: "transaction",
        entityId: String(ins.insertId),
        detail: { student_id: studentId, amount },
      });

      return {
        duplicate: false,
        transaction: {
          id: ins.insertId,
          student_id: studentId,
          type: "topup",
          amount,
          balance_after: newBalance,
          operator_id: input.operator.id,
          note: null,
          refund_of: null,
          created_at: new Date(),
        },
        student: { id: student.id, name: student.name, balance: newBalance },
      };
    });
  } catch (err) {
    if (isDuplicateEntry(err)) return replayResult(key);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Payment (cashier + student PIN)
// ---------------------------------------------------------------------------

export async function processPayment(input: {
  ref: Record<string, unknown>;
  amount: unknown;
  pin: unknown;
  idempotencyKey: unknown;
  operator: Actor;
}): Promise<TxResult> {
  const amount = assertAmount(input.amount);
  const key = assertIdempotencyKey(input.idempotencyKey);
  const { studentId } = await resolveStudentRef(input.ref);

  if (await findTransactionByKey(key)) {
    return replayResult(key);
  }

  // Verify the PIN *before* opening the transaction: bcrypt costs ~100ms and
  // must never hold a row lock. The authoritative balance check happens under
  // the lock below.
  const pin = asString(input.pin);
  if (!/^\d{4,8}$/.test(pin)) {
    throw new ApiError(400, "BAD_PIN", "PIN must be 4-8 digits.");
  }
  const [pinRows] = await pool.execute<RowDataPacket[]>(
    "SELECT pin_hash FROM students WHERE id = ?",
    [studentId]
  );
  if (pinRows.length === 0) {
    throw new ApiError(404, "STUDENT_NOT_FOUND", "Student record not found.");
  }
  const pinOk = await bcrypt.compare(pin, asString(pinRows[0].pin_hash));
  if (!pinOk) {
    await pool.execute(
      `INSERT INTO audit_logs (actor_id, actor_role, action, entity, entity_id, detail)
       VALUES (?, ?, 'payment_pin_failed', 'student', ?, ?)`,
      [input.operator.id, input.operator.role, studentId, JSON.stringify({})]
    );
    throw new ApiError(401, "WRONG_PIN", "The PIN entered is incorrect. Payment declined.");
  }

  try {
    return await withTransaction(async (conn) => {
      const student = await lockStudentForUpdate(conn, studentId);
      if (asString(student.status) !== "active") {
        throw new ApiError(403, "STUDENT_BLOCKED", "This student account is blocked.");
      }

      const [dupe] = await conn.execute<TxRow[]>(
        `SELECT ${TX_COLUMNS} FROM transactions WHERE idempotency_key = ? LIMIT 1`,
        [key]
      );
      if (dupe[0]) {
        return {
          duplicate: true,
          transaction: txPublic(dupe[0]),
          student: {
            id: student.id,
            name: student.name,
            balance: asNumber(student.balance),
          },
        };
      }

      verifyLockedStudentQr(student, input.ref);

      const current = asNumber(student.balance);
      if (current < amount) {
        throw new ApiError(400, "INSUFFICIENT_FUNDS", "Insufficient balance for this payment.", {
          balance: current,
          required: amount,
        });
      }

      const newBalance = current - amount;
      await conn.execute(
        "UPDATE students SET balance = balance - ? WHERE id = ?",
        [amount, studentId]
      );
      const [ins] = await conn.execute<ResultSetHeader>(
        `INSERT INTO transactions (student_id, type, amount, balance_after, operator_id, idempotency_key)
         VALUES (?, 'payment', ?, ?, ?, ?)`,
        [studentId, -amount, newBalance, input.operator.id, key]
      );
      await insertAudit(conn, {
        actor: input.operator,
        action: "payment",
        entity: "transaction",
        entityId: String(ins.insertId),
        detail: { student_id: studentId, amount: -amount },
      });

      return {
        duplicate: false,
        transaction: {
          id: ins.insertId,
          student_id: studentId,
          type: "payment",
          amount: -amount,
          balance_after: newBalance,
          operator_id: input.operator.id,
          note: null,
          refund_of: null,
          created_at: new Date(),
        },
        student: { id: student.id, name: student.name, balance: newBalance },
      };
    });
  } catch (err) {
    if (isDuplicateEntry(err)) return replayResult(key);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Refund (admin) — creates a NEW positive ledger row linked to the payment
// ---------------------------------------------------------------------------

export async function issueRefund(input: {
  transactionId: unknown;
  idempotencyKey?: unknown;
  note?: unknown;
  operator: Actor;
}): Promise<TxResult & { original: { id: number; amount: number; created_at: Date | string } }> {
  const txId = asNumber(input.transactionId);
  if (!Number.isSafeInteger(txId) || txId <= 0) {
    throw new ApiError(400, "BAD_TRANSACTION_ID", "transaction_id must be a positive integer.");
  }
  // Deterministic key when the client doesn't send one → double-click is
  // inherently idempotent for refunds.
  const key =
    asString(input.idempotencyKey ?? "").trim() || `refund:${txId}`;
  assertIdempotencyKey(key);
  const note = asString(input.note ?? "").trim().slice(0, 255) || null;

  if (await findTransactionByKey(key)) {
    const result = await replayResult(key);
    return {
      ...result,
      original: {
        id: result.transaction.refund_of ?? txId,
        amount: -result.transaction.amount,
        created_at: result.transaction.created_at,
      },
    };
  }

  try {
    return await withTransaction(async (conn) => {
      // 1) Lock the original payment row so two admins can't refund concurrently.
      const [origRows] = await conn.execute<TxRow[]>(
        `SELECT ${TX_COLUMNS} FROM transactions WHERE id = ? FOR UPDATE`,
        [txId]
      );
      const original = origRows[0];
      if (!original) {
        throw new ApiError(404, "TRANSACTION_NOT_FOUND", "No transaction exists with that id.");
      }
      if (original.type !== "payment") {
        throw new ApiError(400, "NOT_A_PAYMENT", "Only payments can be refunded.");
      }

      // 2) Friendly check — UNIQUE(refund_of) is the hard backstop.
      const [existingRefund] = await conn.execute<TxRow[]>(
        `SELECT ${TX_COLUMNS} FROM transactions WHERE refund_of = ? LIMIT 1`,
        [txId]
      );
      if (existingRefund[0]) {
        throw new ApiError(
          409,
          "ALREADY_REFUNDED",
          "This payment has already been refunded.",
          { refund_transaction_id: existingRefund[0].id }
        );
      }

      // 3) Lock the student row and credit the money back.
      const student = await lockStudentForUpdate(conn, original.student_id);
      const refundAmount = -asNumber(original.amount); // stored negative → refund is positive
      const newBalance = asNumber(student.balance) + refundAmount;
      await conn.execute(
        "UPDATE students SET balance = balance + ? WHERE id = ?",
        [refundAmount, student.id]
      );
      const [ins] = await conn.execute<ResultSetHeader>(
        `INSERT INTO transactions (student_id, type, amount, balance_after, operator_id, idempotency_key, refund_of, note)
         VALUES (?, 'refund', ?, ?, ?, ?, ?, ?)`,
        [student.id, refundAmount, newBalance, input.operator.id, key, txId, note]
      );
      await insertAudit(conn, {
        actor: input.operator,
        action: "refund",
        entity: "transaction",
        entityId: String(ins.insertId),
        detail: { student_id: student.id, refund_of: txId, amount: refundAmount, note },
      });

      return {
        duplicate: false,
        transaction: {
          id: ins.insertId,
          student_id: student.id,
          type: "refund",
          amount: refundAmount,
          balance_after: newBalance,
          operator_id: input.operator.id,
          note,
          refund_of: txId,
          created_at: new Date(),
        },
        student: { id: student.id, name: student.name, balance: newBalance },
        original: {
          id: original.id,
          amount: asNumber(original.amount),
          created_at: original.created_at,
        },
      };
    });
  } catch (err) {
    if (isDuplicateEntry(err)) {
      throw new ApiError(409, "ALREADY_REFUNDED", "This payment has already been refunded.");
    }
    throw err;
  }
}
