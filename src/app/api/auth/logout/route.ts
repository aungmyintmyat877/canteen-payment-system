import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth";
import { errorResponse } from "@/lib/api";

export const runtime = "nodejs";

export async function POST() {
  try {
    await clearSession();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
