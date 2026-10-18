import { NextResponse } from "next/server";
import { requireActiveStudent } from "@/lib/auth";
import { buildQrPayload } from "@/lib/qr";
import { errorResponse } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Everything the dynamic ID card needs: profile fields + signed QR payload. */
export async function GET() {
  try {
    const student = await requireActiveStudent();
    return NextResponse.json({
      ok: true,
      student: {
        id: student.id,
        name: student.name,
        year: student.year,
        photo_url: student.photo_url,
        phone: student.phone,
        email: student.email,
        major: student.major,
        class_name: student.class_name,
      },
      qr_payload: buildQrPayload(student.id, student.qr_secret),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
