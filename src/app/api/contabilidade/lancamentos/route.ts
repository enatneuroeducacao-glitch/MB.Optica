import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

const money = (value: unknown) => Math.round(Number(value) * 100) / 100;
const dateOnly = (value: unknown) => {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCHours(0, 0, 0, 0);
  return date;
};

export async function GET() {
  try {
    await requireRole(["ADMIN"]);
    const [settings, accounts, periods, entries] = await Promise.all([
      db.accountingSettings.findFirst({ orderBy: { updatedAt: "desc" } }),
      db.chartOfAccount.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
      db.accountingPeriod.findMany({ orderBy: [{ year: "desc" }, { month: "desc" }], take: 36 }),
      db.accountingEntry.findMany({
        orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
        take: 100,
        include: { period: true, lines: { include: { account: { select: { code: true, name: true } } } } },
      }),
    ]);
    return NextResponse.json({ settings, accounts, periods, entries });
  } catch (error) {
    return apiError(error, "Não foi possível carregar os lançamentos contábeis.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireRole(["ADMIN"]);
    const body = await request.json();
    const action = String(body?.action || "");

    if (action === "POST_ENTRY") {
      const entryDate = dateOnly(body.entryDate);
      const competenceDate = dateOnly(body.competenceDate || body.entryDate);
      const description = String(body.description || "").trim();
      const periodId = String(body.periodId || "");
      const lines = Array.isArray(body.lines) ? body.lines : [];
      if (!entryDate || !competenceDate || !description || description.length > 240 || !periodId) {
        return NextResponse.json({ error: "Informe datas válidas, descrição e período contábil." }, { status: 400 });
      }
      if (lines.length < 2 || lines.length > 100) {
        return NextResponse.json({ error: "O lançamento precisa ter entre 2 e 100 linhas." }, { status: 400 });
      }
      const normalized = lines.map((line: any) => ({
        accountId: String(line.accountId || ""),
        description: String(line.description || "").trim() || null,
        debit: money(line.debit || 0),
        credit: money(line.credit || 0),
        referenceType: line.referenceType ? String(line.referenceType).slice(0, 60) : null,
        referenceId: line.referenceId ? String(line.referenceId).slice(0, 120) : null,
      }));
      if (normalized.some((line: any) => !line.accountId || !Number.isFinite(line.debit) || !Number.isFinite(line.credit) || line.debit < 0 || line.credit < 0 || ((line.debit > 0) === (line.credit > 0)))) {
        return NextResponse.json({ error: "Cada linha deve informar uma conta e valor positivo em débito OU crédito, nunca ambos." }, { status: 400 });
      }
      const totalDebit = money(normalized.reduce((sum: number, line: any) => sum + line.debit, 0));
      const totalCredit = money(normalized.reduce((sum: number, line: any) => sum + line.credit, 0));
      if (totalDebit <= 0 || Math.abs(totalDebit - totalCredit) > 0.001) {
        return NextResponse.json({ error: "Lançamento desequilibrado: débitos e créditos devem ser iguais e maiores que zero." }, { status: 400 });
      }
      const result = await db.$transaction(async (tx) => {
        const period = await tx.accountingPeriod.findUnique({ where: { id: periodId } });
        if (!period) throw new Error("Período contábil não encontrado.");
        if (period.status !== "ABERTO") throw new Error("O período contábil está fechado e não aceita lançamentos.");
        if (entryDate < period.startDate || entryDate > period.endDate || competenceDate < period.startDate || competenceDate > period.endDate) {
          throw new Error("As datas do lançamento devem pertencer ao período selecionado.");
        }
        const accountIds = [...new Set(normalized.map((line: any) => line.accountId))];
        const activeAccounts = await tx.chartOfAccount.findMany({ where: { id: { in: accountIds }, active: true } });
        if (activeAccounts.length !== accountIds.length) throw new Error("Uma ou mais contas não existem ou estão inativas.");
        const entry = await tx.accountingEntry.create({
          data: {
            entryDate, competenceDate, description, sourceType: "MANUAL",
            status: "CONTABILIZADO", totalDebit: new Prisma.Decimal(totalDebit),
            totalCredit: new Prisma.Decimal(totalCredit), periodId, createdByUserId: user.id,
            postedAt: new Date(),
            lines: { create: normalized.map((line: any, index: number) => ({ ...line, lineNumber: index + 1 })) },
          },
          include: { period: true, lines: { include: { account: { select: { code: true, name: true } } } } },
        });
        await tx.auditLog.create({ data: { userId: user.id, action: "ACCOUNTING_ENTRY_POSTED", entity: "AccountingEntry", entityId: entry.id, metadata: { totalDebit, totalCredit, periodId, lineCount: normalized.length } } });
        return entry;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return NextResponse.json({ entry: result }, { status: 201 });
    }

    if (action === "REVERSE_ENTRY") {
      const entryId = String(body.entryId || "");
      const reason = String(body.reason || "").trim();
      if (!entryId || reason.length < 5 || reason.length > 240) {
        return NextResponse.json({ error: "Informe o lançamento e uma justificativa de estorno (5 a 240 caracteres)." }, { status: 400 });
      }
      const reversal = await db.$transaction(async (tx) => {
        const original = await tx.accountingEntry.findUnique({ where: { id: entryId }, include: { lines: true, period: true } });
        if (!original) throw new Error("Lançamento não encontrado.");
        if (original.status !== "CONTABILIZADO" || original.reversedAt) throw new Error("Somente lançamentos contabilizados e ainda não estornados podem ser estornados.");
        if (original.period.status !== "ABERTO") throw new Error("O período original está fechado. Reabra-o formalmente antes do estorno.");
        const now = new Date();
        const reversalDate = dateOnly(body.reversalDate || now.toISOString());
        if (!reversalDate || reversalDate < original.period.startDate || reversalDate > original.period.endDate) throw new Error("A data do estorno deve estar dentro do período original aberto.");
        const reversalEntry = await tx.accountingEntry.create({
          data: {
            entryDate: reversalDate, competenceDate: reversalDate,
            description: "ESTORNO: " + original.description + " — " + reason,
            sourceType: "ESTORNO", sourceId: original.id,
            originKey: "reversal:" + original.id,
            status: "CONTABILIZADO",
            totalDebit: original.totalCredit, totalCredit: original.totalDebit,
            periodId: original.periodId, createdByUserId: user.id, postedAt: now,
            reversalOfId: original.id, notes: reason,
            lines: { create: original.lines.map((line, index) => ({
              accountId: line.accountId, lineNumber: index + 1,
              description: "Estorno: " + (line.description || original.description),
              debit: line.credit, credit: line.debit,
              referenceType: "AccountingEntry", referenceId: original.id,
            })) },
          },
          include: { lines: true },
        });
        await tx.accountingEntry.update({ where: { id: original.id }, data: { status: "ESTORNADO", reversedAt: now, notes: [original.notes, "Estornado por " + reversalEntry.id + ": " + reason].filter(Boolean).join("\n") } });
        await tx.auditLog.create({ data: { userId: user.id, action: "ACCOUNTING_ENTRY_REVERSED", entity: "AccountingEntry", entityId: original.id, metadata: { reversalEntryId: reversalEntry.id, reason } } });
        return reversalEntry;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return NextResponse.json({ entry: reversal }, { status: 201 });
    }

    return NextResponse.json({ error: "Ação contábil desconhecida." }, { status: 400 });
  } catch (error) {
    return apiError(error, "Não foi possível processar o lançamento contábil.");
  }
}
