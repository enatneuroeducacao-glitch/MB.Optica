import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

const TZ = "America/Sao_Paulo";
function keyOf(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  return year && month ? `${year}-${month}` : null;
}
function round(value: number) { return Math.round(value * 100) / 100; }

export async function GET() {
  try {
    await requireRole(["ADMIN", "GERENTE"]);
    const now = new Date();
    const currentKey = keyOf(now)!;
    const [year, month] = currentKey.split("-").map(Number);
    const start = new Date(Date.UTC(year, month - 1 - 35, 1));
    const sales = await db.sale.findMany({
      where: { canceled: false, createdAt: { gte: start } },
      select: { createdAt: true, total: true },
      orderBy: { createdAt: "asc" },
    });
    const totals = new Map<string, { sales: number; total: number }>();
    for (const sale of sales) {
      const key = keyOf(sale.createdAt);
      if (!key) continue;
      const current = totals.get(key) || { sales: 0, total: 0 };
      current.sales += 1;
      current.total += Number(sale.total || 0);
      totals.set(key, current);
    }
    const monthly = Array.from({ length: 36 }, (_, index) => {
      const d = new Date(Date.UTC(year, month - 1 - 35 + index, 1));
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      const value = totals.get(key) || { sales: 0, total: 0 };
      return { month: key, sales: value.sales, total: round(value.total), partial: key === currentKey, observed: true, origin: "MB Óptica" };
    });
    return NextResponse.json({
      ok: true,
      source: "MB_OPTICA",
      timezone: TZ,
      coverage: { from: monthly[0]?.month, through: currentKey, months: monthly.length, currentMonthPartial: true },
      count: sales.length,
      monthly,
      methodology: "Vendas operacionais não canceladas, agrupadas pela competência local de São Paulo. A consulta cobre todos os registros desde o início da janela de 36 meses, sem limite artificial de 1.000 vendas. O mês corrente é parcial.",
    });
  } catch (error) {
    return apiError(error, "Não foi possível carregar o histórico operacional comparativo.");
  }
}
