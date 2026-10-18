import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { errorResponse, intParam } from "@/lib/api";
import type { RowDataPacket } from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Paginated ledger browse for admins, with refund status per payment row. */
export async function GET(req: NextRequest) {
  try {
    await requireRole("admin");
    const url = new URL(req.url);
    const page = intParam(url.searchParams.get("page"), 1, 1, 10_000);
    const pageSize = intParam(url.searchParams.get("pageSize"), 10, 1, 50);
    const typeParam = url.searchParams.get("type") ?? "all";
    const type = ["topup", "payment", "refund"].includes(typeParam) ? typeParam : "all";
    const offset = (page - 1) * pageSize;

    const [items] = await pool.query<RowDataPacket[]>(
      `SELECT t.id, t.student_id, s.name AS student_name, t.type, t.amount,
              t.balance_after, t.operator_id, t.note, t.created_at, r.id AS refund_id
       FROM transactions t
       JOIN students s ON s.id = t.student_id
       LEFT JOIN transactions r ON r.refund_of = t.id
       ${type === "all" ? "" : "WHERE t.type = ?"}
       ORDER BY t.created_at DESC, t.id DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      type === "all" ? [] : [type]
    );
    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM transactions ${type === "all" ? "" : "WHERE type = ?"}`,
      type === "all" ? [] : [type]
    );

    return NextResponse.json({
      ok: true,
      page,
      page_size: pageSize,
      total: Number(countRows[0]?.total ?? 0),
      items,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
