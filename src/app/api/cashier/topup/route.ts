import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { processTopup } from "@/lib/ledger";
import { errorResponse, readJson } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Top-up: body = { payload } (signed QR) | { studentId, manual: true },
 *         amount (minor units), operator_pin (cashier's own PIN), idempotency_key.
 * Cashier-only per role separation. Top-up requires cashier PIN authorization.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("cashier");
    const body = await readJson(req);
    const result = await processTopup({
      ref: body,
      amount: body.amount,
      idempotencyKey: body.idempotency_key,
      operatorPin: body.operator_pin,
      operator: { id: session.id, name: session.name, role: "cashier" },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return errorResponse(err);
  }
}