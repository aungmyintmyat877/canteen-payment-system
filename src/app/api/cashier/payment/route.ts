import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { processPayment } from "@/lib/ledger";
import { errorResponse, readJson } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Payment: body = { payload } (signed QR) | { studentId, manual: true },
 *          amount (minor units), pin (student's PIN), idempotency_key.
 * The student authorizes by PIN; balance is checked and deducted under a
 * FOR UPDATE row lock inside one MySQL transaction.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("cashier");
    const body = await readJson(req);
    const result = await processPayment({
      ref: body,
      amount: body.amount,
      pin: body.pin,
      idempotencyKey: body.idempotency_key,
      operator: { id: session.id, name: session.name, role: "cashier" },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return errorResponse(err);
  }
}
