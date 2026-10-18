import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { pool, asString } from "@/lib/db";
import { createSession, homeFor, type Role } from "@/lib/auth";
import { ApiError, errorResponse, readJson } from "@/lib/api";
import type { RowDataPacket } from "mysql2/promise";

export const runtime = "nodejs";

/**
 * Unified login: the client sends only { id, pin }. The server looks the ID
 * up in `students` first, then `staff`, and derives the role from whichever
 * table matched — the client never declares its own role.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await readJson(req);
    const id = asString(body.id).trim();
    const pin = asString(body.pin);

    if (!id || !/^\d{4,8}$/.test(pin)) {
      throw new ApiError(400, "BAD_CREDENTIALS", "Enter your ID and a 4-8 digit PIN.");
    }

    // ---- 1) Student accounts ----
    const [studentRows] = await pool.execute<RowDataPacket[]>(
      "SELECT id, name, pin_hash, status FROM students WHERE id = ?",
      [id]
    );
    const student = studentRows[0];
    if (student) {
      if (!(await bcrypt.compare(pin, asString(student.pin_hash)))) {
        await auditLoginFailed("student", id, "wrong_pin");
        throw new ApiError(401, "INVALID_CREDENTIALS", "Wrong ID or PIN.");
      }
      if (asString(student.status) !== "active") {
        throw new ApiError(
          403,
          "ACCOUNT_BLOCKED",
          "This account is blocked. Contact the administration office."
        );
      }
      const session = { id: asString(student.id), role: "student" as const, name: asString(student.name) };
      await createSession(session);
      await pool.execute(
        "INSERT INTO audit_logs (actor_id, actor_role, action) VALUES (?, 'student', 'login')",
        [session.id]
      );
      return NextResponse.json({ ok: true, session, redirect: homeFor("student") });
    }

    // ---- 2) Staff accounts (role comes from the DB row) ----
    const [staffRows] = await pool.execute<RowDataPacket[]>(
      "SELECT id, name, role, pin_hash FROM staff WHERE id = ?",
      [id]
    );
    const staff = staffRows[0];
    if (staff) {
      const role: Role = asString(staff.role) === "admin" ? "admin" : "cashier";
      if (!(await bcrypt.compare(pin, asString(staff.pin_hash)))) {
        await auditLoginFailed(role, id, "wrong_pin");
        throw new ApiError(401, "INVALID_CREDENTIALS", "Wrong ID or PIN.");
      }
      const session = { id: asString(staff.id), role, name: asString(staff.name) };
      await createSession(session);
      await pool.execute(
        "INSERT INTO audit_logs (actor_id, actor_role, action) VALUES (?, ?, 'login')",
        [session.id, role]
      );
      return NextResponse.json({ ok: true, session, redirect: homeFor(role) });
    }

    // ---- 3) Unknown ID ----
    await auditLoginFailed("student", id, "unknown_id");
    throw new ApiError(401, "INVALID_CREDENTIALS", "Wrong ID or PIN.");
  } catch (err) {
    return errorResponse(err);
  }
}

async function auditLoginFailed(
  actorRole: Role,
  id: string,
  reason: string
): Promise<void> {
  await pool.execute(
    `INSERT INTO audit_logs (actor_id, actor_role, action, entity, entity_id, detail)
     VALUES (?, ?, 'login_failed', 'login', ?, ?)`,
    [id, actorRole, id, JSON.stringify({ reason })]
  );
}
