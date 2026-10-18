import { NextResponse } from "next/server";
import { requireActiveStudent } from "@/lib/auth";
import { buildQrPayload } from "@/lib/qr";
import { errorResponse } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Returns the signed QR payload for the logged-in student (never the secret). */
export async function GET() {
  try {
    const student = await requireActiveStudent();
    return NextResponse.json({
      ok: true,
      student_id: student.id,
      payload: buildQrPayload(student.id, student.qr_secret),
      issued_at: new Date().toISOString(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
