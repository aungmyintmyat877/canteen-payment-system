import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { errorResponse } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: { code: "UNAUTHENTICATED", message: "Not signed in." } },
        { status: 401 }
      );
    }
    return NextResponse.json({ ok: true, session });
  } catch (err) {
    return errorResponse(err);
  }
}
