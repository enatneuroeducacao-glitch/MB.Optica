import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

export async function GET(request: Request) {
  try {
    await requireRole(["ADMIN", "GERENTE"]);
    const url = new URL(request.url);
    const take = Math.min(Math.max(Number(url.searchParams.get("take") ?? 100), 1), 250);
    const entity = url.searchParams.get("entity") || undefined;
    const action = url.searchParams.get("action") || undefined;

    const logs = await db.auditLog.findMany({
      where: { entity, action },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true, action: true, entity: true, entityId: true, metadata: true, createdAt: true,
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });
    return NextResponse.json({ logs });
  } catch (error) {
    return apiError(error, "Não foi possível carregar a auditoria.");
  }
}
