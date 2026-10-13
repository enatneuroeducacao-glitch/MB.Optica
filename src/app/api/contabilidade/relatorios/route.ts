import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

export async function GET(request: Request) {
  try {
    await requireRole(["ADMIN"]);
    const url = new URL(request.url);
    const periodId = url.searchParams.get("periodId") || "";
    const report = url.searchParams.get("report") || "balancete";
    if (!periodId) return NextResponse.json({ error: "Selecione um período contábil." }, { status: 400 });
    const period = await db.accountingPeriod.findUnique({ where: { id: periodId } });
    if (!period) return NextResponse.json({ error: "Período contábil não encontrado." }, { status: 404 });
    const entries = await db.accountingEntry.findMany({
      where: { periodId, status: { in: ["CONTABILIZADO", "ESTORNADO"] } },
      orderBy: [{ entryDate: "asc" }, { createdAt: "asc" }],
      include: { lines: { include: { account: { select: { id: true, code: true, name: true, nature: true, accountType: true } } } } },
    });
    const rows = entries.flatMap(entry => entry.lines.map(line => ({
      entryId: entry.id, entryDate: entry.entryDate, competenceDate: entry.competenceDate,
      description: entry.description, entryStatus: entry.status, lineNumber: line.lineNumber,
      accountId: line.accountId, accountCode: line.account.code, accountName: line.account.name,
      nature: line.account.nature, accountType: line.account.accountType,
      debit: Number(line.debit), credit: Number(line.credit),
    })));
    if (report === "diario") {
      const totalDebit = rows.reduce((sum, row) => sum + row.debit, 0);
      const totalCredit = rows.reduce((sum, row) => sum + row.credit, 0);
      return NextResponse.json({ period, rows, totalDebit, totalCredit });
    }
    if (report === "razao") {
      const accountId = url.searchParams.get("accountId") || "";
      if (!accountId) return NextResponse.json({ error: "Selecione uma conta para consultar o Razão." }, { status: 400 });
      const accountRows = rows.filter(row => row.accountId === accountId);
      let balance = 0;
      const ledger = accountRows.map(row => {
        balance = Math.round((balance + row.debit - row.credit) * 100) / 100;
        return { ...row, runningBalance: balance };
      });
      return NextResponse.json({ period, rows: ledger, totalDebit: accountRows.reduce((s, r) => s + r.debit, 0), totalCredit: accountRows.reduce((s, r) => s + r.credit, 0), finalBalance: balance });
    }
    const accounts = await db.chartOfAccount.findMany({ where: { active: true }, orderBy: { code: "asc" } });
    const balances = accounts.map(account => {
      const movements = rows.filter(row => row.accountId === account.id);
      const debit = Math.round(movements.reduce((s, r) => s + r.debit, 0) * 100) / 100;
      const credit = Math.round(movements.reduce((s, r) => s + r.credit, 0) * 100) / 100;
      const net = Math.round((debit - credit) * 100) / 100;
      return { accountId: account.id, code: account.code, name: account.name, nature: account.nature, accountType: account.accountType, debit, credit, debitBalance: Math.max(net, 0), creditBalance: Math.max(-net, 0) };
    }).filter(account => account.debit !== 0 || account.credit !== 0);
    return NextResponse.json({
      period, accounts: balances,
      totalDebit: Math.round(balances.reduce((s, a) => s + a.debit, 0) * 100) / 100,
      totalCredit: Math.round(balances.reduce((s, a) => s + a.credit, 0) * 100) / 100,
      totalDebitBalance: Math.round(balances.reduce((s, a) => s + a.debitBalance, 0) * 100) / 100,
      totalCreditBalance: Math.round(balances.reduce((s, a) => s + a.creditBalance, 0) * 100) / 100,
    });
  } catch (error) {
    return apiError(error, "Não foi possível gerar o relatório contábil.");
  }
}
