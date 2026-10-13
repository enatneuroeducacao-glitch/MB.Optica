import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

const taxRegimes = new Set(["SIMPLES_NACIONAL"]);

export async function GET() {
  try {
    await requireRole(["ADMIN"]);
    const [settings, accounts, periods] = await Promise.all([
      db.accountingSettings.findFirst({ orderBy: { updatedAt: "desc" } }),
      db.chartOfAccount.findMany({ orderBy: { code: "asc" } }),
      db.accountingPeriod.findMany({ orderBy: [{ year: "desc" }, { month: "desc" }], take: 24 }),
    ]);
    return NextResponse.json({ settings, accounts, periods });
  } catch (error) {
    return apiError(error, "Não foi possível carregar a contabilidade.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireRole(["ADMIN"]);
    const body = await request.json();
    const action = String(body?.action || "");

    if (action === "SAVE_SETTINGS") {
      const taxRegime = String(body.taxRegime || "");
      const accountingStartDate = body.accountingStartDate ? new Date(body.accountingStartDate) : null;
      if (!taxRegimes.has(taxRegime)) {
        return NextResponse.json({ error: "Regime inválido. Nesta fase, selecione Simples Nacional." }, { status: 400 });
      }
      if (accountingStartDate && Number.isNaN(accountingStartDate.getTime())) {
        return NextResponse.json({ error: "Data inicial inválida." }, { status: 400 });
      }
      const existing = await db.accountingSettings.findFirst({ orderBy: { updatedAt: "desc" } });
      const data = { taxRegime, accountingStartDate, currency: "BRL", timezone: "America/Sao_Paulo" };
      const settings = existing
        ? await db.accountingSettings.update({ where: { id: existing.id }, data })
        : await db.accountingSettings.create({ data });
      await db.auditLog.create({ data: { userId: user.id, action: "ACCOUNTING_SETTINGS_UPDATED", entity: "AccountingSettings", entityId: settings.id, metadata: { taxRegime, accountingStartDate: accountingStartDate?.toISOString() ?? null } } });
      return NextResponse.json({ settings });
    }

    if (action === "CREATE_ACCOUNT") {
      const code = String(body.code || "").trim();
      const name = String(body.name || "").trim();
      const nature = String(body.nature || "");
      const accountType = String(body.accountType || "");
      const description = String(body.description || "").trim() || null;
      const parentId = String(body.parentId || "").trim() || null;
      if (!/^[0-9.]{1,30}$/.test(code) || !name || name.length > 120) {
        return NextResponse.json({ error: "Informe código contábil válido e nome de até 120 caracteres." }, { status: 400 });
      }
      if (!["DEVEDORA", "CREDORA"].includes(nature) || !["ATIVO", "PASSIVO", "PATRIMONIO_LIQUIDO", "RECEITA", "DESPESA", "CUSTO"].includes(accountType)) {
        return NextResponse.json({ error: "Natureza ou tipo contábil inválido." }, { status: 400 });
      }
      if (parentId) {
        const parent = await db.chartOfAccount.findUnique({ where: { id: parentId } });
        if (!parent || parent.id === body.id) return NextResponse.json({ error: "Conta superior não encontrada." }, { status: 400 });
      }
      const account = await db.chartOfAccount.create({ data: { code, name, nature, accountType, description, parentId, system: false } });
      await db.auditLog.create({ data: { userId: user.id, action: "ACCOUNTING_ACCOUNT_CREATED", entity: "ChartOfAccount", entityId: account.id, metadata: { code, name, nature, accountType } } });
      return NextResponse.json({ account }, { status: 201 });
    }

    if (action === "CREATE_PERIOD") {
      const year = Number(body.year);
      const month = Number(body.month);
      if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
        return NextResponse.json({ error: "Informe ano entre 2000 e 2100 e mês entre 1 e 12." }, { status: 400 });
      }
      const startDate = new Date(Date.UTC(year, month - 1, 1));
      const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
      const period = await db.accountingPeriod.create({ data: { year, month, startDate, endDate, status: "ABERTO" } });
      await db.auditLog.create({ data: { userId: user.id, action: "ACCOUNTING_PERIOD_CREATED", entity: "AccountingPeriod", entityId: period.id, metadata: { year, month } } });
      return NextResponse.json({ period }, { status: 201 });
    }

    return NextResponse.json({ error: "Ação contábil desconhecida." }, { status: 400 });
  } catch (error) {
    return apiError(error, "Não foi possível salvar os dados contábeis.");
  }
}
