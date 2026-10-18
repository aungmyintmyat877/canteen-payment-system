import { NextRequest, NextResponse } from "next/server";
import { pool, asNumber, asString } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { resolveStudentRef } from "@/lib/qr";
import { ApiError, errorResponse, readJson } from "@/lib/api";
import type { RowDataPacket } from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Verify a scanned QR payload (or manual ID in dev mode) and return the
 * student's identity + photo so the cashier can visually confirm the card
 * belongs to the person in front of them.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("cashier");
    const body = await readJson(req);
    const ref = await resolveStudentRef(body);

    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT id, name, year, photo_url, balance, status FROM students WHERE id = ?",
      [ref.studentId]
    );
    const row = rows[0];
    if (!row) {
      throw new ApiError(404, "STUDENT_NOT_FOUND", "No student with that ID.");
    }

    await pool.execute(
      `INSERT INTO audit_logs (actor_id, actor_role, action, entity, entity_id, detail)
       VALUES (?, 'cashier', 'scan', 'student', ?, ?)`,
      [session.id, ref.studentId, JSON.stringify({ via: ref.via })]
    );

    return NextResponse.json({
      ok: true,
      via: ref.via,
      student: {
        id: asString(row.id),
        name: asString(row.name),
        year: asNumber(row.year),
        photo_url: asString(row.photo_url) || null,
        balance: asNumber(row.balance),
        status: asString(row.status),
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
