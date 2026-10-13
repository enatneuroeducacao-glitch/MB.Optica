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

    if (action === "PREPARE_INITIAL_STRUCTURE") {
      const existingAccounts = await db.chartOfAccount.count();
      const existingPeriods = await db.accountingPeriod.count();
      if (existingAccounts > 0) {
        return NextResponse.json({ error: "O plano de contas já possui registros. A preparação automática foi bloqueada para evitar duplicações; revise o cadastro existente." }, { status: 409 });
      }
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const startDate = new Date(Date.UTC(year, month - 1, 1));
      const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
      const accounts = [
        { code: "1", name: "Ativo", nature: "DEVEDORA", accountType: "ATIVO" },
        { code: "1.1", name: "Disponibilidades", nature: "DEVEDORA", accountType: "ATIVO" },
        { code: "1.1.01", name: "Caixa", nature: "DEVEDORA", accountType: "ATIVO" },
        { code: "1.1.02", name: "Bancos conta movimento", nature: "DEVEDORA", accountType: "ATIVO" },
        { code: "1.1.03", name: "Valores a receber de cartões", nature: "DEVEDORA", accountType: "ATIVO" },
        { code: "1.2", name: "Contas a receber de clientes", nature: "DEVEDORA", accountType: "ATIVO" },
        { code: "1.3", name: "Estoques", nature: "DEVEDORA", accountType: "ATIVO" },
        { code: "2", name: "Passivo", nature: "CREDORA", accountType: "PASSIVO" },
        { code: "2.1", name: "Fornecedores a pagar", nature: "CREDORA", accountType: "PASSIVO" },
        { code: "2.2", name: "Tributos a recolher", nature: "CREDORA", accountType: "PASSIVO" },
        { code: "3", name: "Patrimônio líquido", nature: "CREDORA", accountType: "PATRIMONIO_LIQUIDO" },
        { code: "3.1", name: "Capital", nature: "CREDORA", accountType: "PATRIMONIO_LIQUIDO" },
        { code: "4", name: "Receitas", nature: "CREDORA", accountType: "RECEITA" },
        { code: "4.1", name: "Receita de vendas", nature: "CREDORA", accountType: "RECEITA" },
        { code: "4.2", name: "Devoluções e abatimentos de vendas", nature: "DEVEDORA", accountType: "RECEITA" },
        { code: "5", name: "Custos", nature: "DEVEDORA", accountType: "CUSTO" },
        { code: "5.1", name: "Custo das mercadorias vendidas", nature: "DEVEDORA", accountType: "CUSTO" },
        { code: "6", name: "Despesas", nature: "DEVEDORA", accountType: "DESPESA" },
        { code: "6.1", name: "Despesas operacionais", nature: "DEVEDORA", accountType: "DESPESA" },
        { code: "6.2", name: "Tarifas e taxas de cartões", nature: "DEVEDORA", accountType: "DESPESA" }
      ];
      const result = await db.$transaction(async (tx) => {
        const createdAccounts = await Promise.all(accounts.map((account) => tx.chartOfAccount.create({
          data: { ...account, system: true, description: "Estrutura inicial sugerida; validar com a contabilidade responsável." }
        })));
        let createdPeriod = null;
        if (existingPeriods === 0) {
          createdPeriod = await tx.accountingPeriod.create({ data: { year, month, startDate, endDate, status: "ABERTO", notes: "Período inicial criado pela preparação da estrutura contábil." } });
        }
        const settings = await tx.accountingSettings.findFirst({ orderBy: { updatedAt: "desc" } });
        if (!settings) await tx.accountingSettings.create({ data: { taxRegime: "SIMPLES_NACIONAL", accountingStartDate: startDate, currency: "BRL", timezone: "America/Sao_Paulo" } });
        return { accounts: createdAccounts, period: createdPeriod };
      });
      await db.auditLog.create({ data: { userId: user.id, action: "ACCOUNTING_INITIAL_STRUCTURE_PREPARED", entity: "AccountingSettings", metadata: { accountsCreated: result.accounts.length, year, month } } });
      return NextResponse.json({ success: true, accountsCreated: result.accounts.length, periodCreated: Boolean(result.period), period: result.period, requiresAccountantReview: true }, { status: 201 });
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
