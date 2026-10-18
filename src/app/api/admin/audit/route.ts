import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { errorResponse, intParam } from "@/lib/api";
import type { RowDataPacket } from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Paginated audit trail: logins, scans, topups, payments, refunds, PIN failures. */
export async function GET(req: NextRequest) {
  try {
    await requireRole("admin");
    const url = new URL(req.url);
    const page = intParam(url.searchParams.get("page"), 1, 1, 10_000);
    const pageSize = intParam(url.searchParams.get("pageSize"), 15, 1, 100);
    const offset = (page - 1) * pageSize;

    const [items] = await pool.query<RowDataPacket[]>(
      `SELECT id, actor_id, actor_role, action, entity, entity_id, detail, created_at
       FROM audit_logs
       ORDER BY created_at DESC, id DESC
       LIMIT ${pageSize} OFFSET ${offset}`
    );
    const [countRows] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS total FROM audit_logs"
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
