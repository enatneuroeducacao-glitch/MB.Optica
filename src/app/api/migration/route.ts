import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

export async function GET() {
  try {
    await requireRole(["ADMIN"]);
    const [runs, legacyStored] = await Promise.all([
      db.migrationRun.findMany({
        orderBy: { startedAt: "desc" }, take: 10,
        select: { id:true,source:true,sourceFingerprint:true,status:true,total:true,imported:true,mapped:true,warnings:true,errors:true,report:true,startedAt:true,completedAt:true }
      }),
      db.legacyRecord.count(),
    ]);
    return NextResponse.json({ok:true,expected:{source:"BEEPSTART",total:5785,collections:30},legacyStored,runs});
  } catch (error) {
    return apiError(error, "Não foi possível carregar a central de migração.");
  }
}
