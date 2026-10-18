import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireActiveStudent } from "@/lib/auth";
import { errorResponse, intParam } from "@/lib/api";
import type { RowDataPacket } from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const student = await requireActiveStudent();
    const url = new URL(req.url);
    const page = intParam(url.searchParams.get("page"), 1, 1, 10_000);
    const pageSize = intParam(url.searchParams.get("pageSize"), 10, 1, 50);
    const offset = (page - 1) * pageSize;

    // intParam clamps both values to safe integers, so interpolation is safe.
    const [items] = await pool.query<RowDataPacket[]>(
      `SELECT id, type, amount, balance_after, note, refund_of, operator_id, created_at
       FROM transactions
       WHERE student_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      [student.id]
    );
    const [countRows] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS total FROM transactions WHERE student_id = ?",
      [student.id]
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
