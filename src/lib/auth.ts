import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { pool, asString } from "./db";
import { ApiError } from "./api";
import type { RowDataPacket } from "mysql2/promise";

export type Role = "student" | "cashier" | "admin";

export interface Session {
  id: string;
  role: Role;
  name: string;
}

const COOKIE_NAME = "canteen_session";
const MAX_AGE_SECONDS = 60 * 60 * 8; // 8-hour shifts

function secretKey(): Uint8Array {
  const s =
    process.env.SESSION_SECRET ||
    "dev-only-session-secret-change-me-0123456789abcdef";
  return new TextEncoder().encode(s);
}

export function homeFor(role: Role): string {
  return role === "student" ? "/student" : role === "cashier" ? "/cashier" : "/admin";
}

/** Issue an httpOnly JWT session cookie (call from Route Handlers only). */
export async function createSession(session: Session): Promise<void> {
  const token = await new SignJWT({ role: session.role, name: session.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secretKey());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const role = payload.role;
    if (role !== "student" && role !== "cashier" && role !== "admin") return null;
    return {
      id: String(payload.sub ?? ""),
      role,
      name: String(payload.name ?? ""),
    };
  } catch {
    return null; // expired or tampered token
  }
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}

/** Guard for API routes: throws 401/403 unless the session has one of `roles`. */
export async function requireRole(...roles: Role[]): Promise<Session> {
  const session = await getSession();
  if (!session) {
    throw new ApiError(401, "UNAUTHENTICATED", "Please sign in first.");
  }
  if (roles.length > 0 && !roles.includes(session.role)) {
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Your role is not allowed to perform this action."
    );
  }
  return session;
}

export interface StudentProfile {
  id: string;
  name: string;
  year: number;
  balance: string; // BIGINT → string (minor units)
  status: string;
  photo_url: string | null;
  phone: string | null;
  email: string | null;
  major: string | null;
  class_name: string | null;
  qr_secret: string;
}

/**
 * Load the signed-in student fresh from the DB. Unlike trusting the JWT, this
 * immediately locks out students whose account was deleted or blocked.
 */
export async function requireActiveStudent(): Promise<StudentProfile> {
  const session = await requireRole("student");
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, name, year, balance, status, photo_url, phone, email, major, class_name, qr_secret
     FROM students WHERE id = ?`,
    [session.id]
  );
  const row = rows[0];
  if (!row) {
    throw new ApiError(401, "ACCOUNT_GONE", "This student account no longer exists.");
  }
  if (asString(row.status) !== "active") {
    throw new ApiError(
      403,
      "ACCOUNT_BLOCKED",
      "This account is blocked. Please contact the administration office."
    );
  }
  return row as unknown as StudentProfile;
}
