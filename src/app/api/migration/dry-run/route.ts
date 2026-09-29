import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";

export async function POST() {
  try {
    await requireRole(["ADMIN"]);
    return NextResponse.json({
      ok:false,
      error:"O dry-run de migração operacional foi desativado. A Central de Legado trabalha com arquivamento e consulta somente leitura."
    },{status:410});
  } catch {
    return NextResponse.json({ok:false,error:"Não autorizado."},{status:403});
  }
}
