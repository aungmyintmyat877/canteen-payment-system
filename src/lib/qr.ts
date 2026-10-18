import crypto from "node:crypto";
import { pool, asString } from "./db";
import { ApiError } from "./api";
import type { RowDataPacket } from "mysql2/promise";

/**
 * QR anti-forgery
 * ---------------
 * A student pass encodes:  `<student_id>.<signature>`
 * where signature = HMAC_SHA256(key = SERVER_SECRET, msg = student_id + qr_secret)
 * truncated to 32 hex chars (128 bits — collision-proof at QR code sizes).
 *
 * A student cannot forge a pass for someone else because:
 *  - they don't know SERVER_SECRET, and
 *  - the per-student qr_secret is never exposed through any API
 *    (only the finished payload string is).
 *
 * Rotating a student's qr_secret instantly invalidates every copy of their
 * pass, including printed ones.
 */

const SERVER_SECRET =
  process.env.SERVER_SECRET ||
  "dev-only-qr-secret-change-me-0123456789abcdef";
const SIG_LENGTH = 32;
const STUDENT_ID_RE = /^[A-Za-z0-9_-]{2,20}$/;

export function qrSignature(studentId: string, qrSecret: string): string {
  return crypto
    .createHmac("sha256", SERVER_SECRET)
    .update(`${studentId}${qrSecret}`)
    .digest("hex")
    .slice(0, SIG_LENGTH);
}

export function buildQrPayload(studentId: string, qrSecret: string): string {
  return `${studentId}.${qrSignature(studentId, qrSecret)}`;
}

/** Timing-safe comparison so signature checks can't be probed byte-by-byte. */
function signatureEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/** Verify a scanned payload; returns the student id it is valid for. */
export async function verifyQrPayload(payload: string): Promise<string> {
  const dot = payload.indexOf(".");
  if (dot <= 0) {
    throw new ApiError(400, "QR_MALFORMED", "This QR code is not a valid canteen pass.");
  }
  const studentId = payload.slice(0, dot);
  const signature = payload.slice(dot + 1);
  if (!STUDENT_ID_RE.test(studentId) || signature.length !== SIG_LENGTH) {
    throw new ApiError(400, "QR_MALFORMED", "This QR code is not a valid canteen pass.");
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT qr_secret FROM students WHERE id = ?",
    [studentId]
  );
  if (rows.length === 0) {
    throw new ApiError(404, "QR_UNKNOWN_STUDENT", "This pass does not belong to any student.");
  }

  const expected = qrSignature(studentId, asString(rows[0].qr_secret));
  if (!signatureEquals(signature, expected)) {
    throw new ApiError(
      400,
      "QR_INVALID_SIGNATURE",
      "QR signature check failed — this pass may be forged."
    );
  }
  return studentId;
}

export interface StudentRef {
  studentId: string;
  via: "qr" | "manual";
}

/**
 * Transaction endpoints accept EITHER a signed QR payload (the normal path)
 * OR — for development/demo convenience — `{ studentId, manual: true }`,
 * which is rejected unless ALLOW_MANUAL_ENTRY=true on the server.
 */
export async function resolveStudentRef(
  body: Record<string, unknown>
): Promise<StudentRef> {
  if (typeof body.payload === "string" && body.payload.length > 0) {
    return { studentId: await verifyQrPayload(body.payload), via: "qr" };
  }
  if (
    body.manual === true &&
    typeof body.studentId === "string" &&
    body.studentId.trim().length > 0
  ) {
    if (process.env.ALLOW_MANUAL_ENTRY !== "true") {
      throw new ApiError(
        403,
        "MANUAL_ENTRY_DISABLED",
        "Manual student-ID entry is disabled on this server."
      );
    }
    const id = body.studentId.trim();
    if (!STUDENT_ID_RE.test(id)) {
      throw new ApiError(400, "BAD_STUDENT_ID", "That student ID format is invalid.");
    }
    return { studentId: id, via: "manual" };
  }
  throw new ApiError(
    400,
    "QR_REQUIRED",
    "Scan the student's QR code to continue."
  );
}
