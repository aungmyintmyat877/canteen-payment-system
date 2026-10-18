import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { issueRefund } from "@/lib/ledger";
import { errorResponse, readJson } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Refund a payment: body = { transaction_id, idempotency_key?, note? }.
 * Admin-only. Creates a NEW positive 'refund' ledger row linked to the
 * original payment via refund_of — the original row is never modified.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("admin");
    const body = await readJson(req);
    const result = await issueRefund({
      transactionId: body.transaction_id,
      idempotencyKey: body.idempotency_key,
      note: body.note,
      operator: { id: session.id, name: session.name, role: "admin" },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return errorResponse(err);
  }
}
