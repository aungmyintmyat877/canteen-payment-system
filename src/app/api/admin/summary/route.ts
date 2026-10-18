import { NextResponse } from "next/server";
import { pool, asNumber, asString } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { errorResponse } from "@/lib/api";
import type { RowDataPacket } from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Daily summary + 7-day series + system totals for the admin dashboard. */
export async function GET() {
  try {
    await requireRole("admin");

    const [todayRows] = await pool.query<RowDataPacket[]>(
      `SELECT type, COUNT(*) AS tx_count, SUM(amount) AS total
       FROM transactions
       WHERE created_at >= CURDATE()
       GROUP BY type`
    );
    const [weekRows] = await pool.query<RowDataPacket[]>(
      `SELECT DATE(created_at) AS day, type, COUNT(*) AS tx_count, SUM(amount) AS total
       FROM transactions
       WHERE created_at >= CURDATE() - INTERVAL 6 DAY
       GROUP BY day, type
       ORDER BY day`
    );
    const [studentRows] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS c, COALESCE(SUM(balance), 0) AS liabilities FROM students"
    );

    const today: Record<string, { count: number; total: number }> = {};
    for (const r of todayRows) {
      today[asString(r.type)] = { count: asNumber(r.tx_count), total: asNumber(r.total) };
    }

    // Pivot the week rows into per-day entries.
    const weekMap = new Map<string, { day: string; topup: number; payment: number; refund: number }>();
    for (const r of weekRows) {
      const day = new Date(r.day as unknown as string).toISOString().slice(0, 10);
      const entry = weekMap.get(day) ?? { day, topup: 0, payment: 0, refund: 0 };
      if (asString(r.type) === "topup") entry.topup = asNumber(r.total);
      if (asString(r.type) === "payment") entry.payment = asNumber(r.total);
      if (asString(r.type) === "refund") entry.refund = asNumber(r.total);
      weekMap.set(day, entry);
    }

    return NextResponse.json({
      ok: true,
      today: {
        topup: today.topup ?? { count: 0, total: 0 },
        payment: today.payment ?? { count: 0, total: 0 },
        refund: today.refund ?? { count: 0, total: 0 },
      },
      week: Array.from(weekMap.values()),
      students: {
        count: asNumber(studentRows[0]?.c),
        liabilities: asNumber(studentRows[0]?.liabilities),
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
