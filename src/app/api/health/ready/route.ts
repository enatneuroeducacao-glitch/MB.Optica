import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, service: "mb-gestao-local", database: "up" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, service: "mb-gestao-local", database: "down" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
