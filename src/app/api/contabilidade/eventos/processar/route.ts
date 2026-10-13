import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export async function POST(request: Request) {
  try {
    const user = await requireRole(["ADMIN"]);
    const body = await request.json();
    const eventId = String(body?.eventId || "");
    if (!eventId) return NextResponse.json({ error: "Informe o evento contábil." }, { status: 400 });

    const result = await db.$transaction(async (tx) => {
      const event = await tx.accountingEvent.findUnique({ where: { id: eventId } });
      if (!event) throw new Error("Evento contábil não encontrado.");
      if (event.status === "PROCESSADO" && event.entryId) {
        const existing = await tx.accountingEntry.findUnique({ where: { id: event.entryId }, include: { lines: true } });
        return { alreadyProcessed: true, entry: existing };
      }
      if (event.status === "PROCESSANDO") throw new Error("Evento já está em processamento; tente novamente em instantes.");
      if (!["SALE_RECOGNIZED", "PAYMENT_RECEIVED", "SALE_REFUNDED", "PAYMENT_REVERSED", "SUPPLIER_EXPENSE_RECOGNIZED", "SUPPLIER_PAYMENT_MADE"].includes(event.eventType)) {
        throw new Error("Tipo de evento não suportado.");
      }
      const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload) ? event.payload as Record<string, unknown> : {};
      const amount = money(Number(payload.amount));
      const sourceDate = new Date(String(payload.entryDate || event.createdAt.toISOString()));
      if (!Number.isFinite(amount) || amount <= 0 || Number.isNaN(sourceDate.getTime())) throw new Error("Evento sem valor positivo ou data válida.");
      const period = await tx.accountingPeriod.findFirst({ where: { status: "ABERTO", startDate: { lte: sourceDate }, endDate: { gte: sourceDate } } });
      if (!period) throw new Error("Não existe período contábil aberto para a data do evento.");
      const mapping = await tx.accountingMapping.findFirst({ where: { eventType: event.eventType, active: true }, orderBy: { createdAt: "asc" } });
      if (!mapping) throw new Error("Não há mapeamento ativo para este tipo de evento.");
      const accounts = await tx.chartOfAccount.findMany({ where: { id: { in: [mapping.debitAccountId, mapping.creditAccountId] }, active: true } });
      if (accounts.length !== 2) throw new Error("As contas do mapeamento precisam estar ativas.");
      const existingByKey = await tx.accountingEntry.findUnique({ where: { originKey: event.idempotencyKey } });
      if (existingByKey) {
        await tx.accountingEvent.update({ where: { id: event.id }, data: { status: "PROCESSADO", processedAt: new Date(), entryId: existingByKey.id, errorMessage: null } });
        return { alreadyProcessed: true, entry: existingByKey };
      }
      const entry = await tx.accountingEntry.create({
        data: {
          entryDate: sourceDate, competenceDate: sourceDate,
          description: String(payload.description || (event.eventType + " — " + event.sourceType + " " + event.sourceId)).slice(0, 240),
          sourceType: event.sourceType, sourceId: event.sourceId,
          originKey: event.idempotencyKey, status: "CONTABILIZADO",
          totalDebit: new Prisma.Decimal(amount), totalCredit: new Prisma.Decimal(amount),
          periodId: period.id, createdByUserId: user.id, postedAt: new Date(),
          lines: { create: [
            { accountId: mapping.debitAccountId, lineNumber: 1, debit: new Prisma.Decimal(amount), credit: new Prisma.Decimal(0), description: "Evento " + event.eventType, referenceType: event.sourceType, referenceId: event.sourceId },
            { accountId: mapping.creditAccountId, lineNumber: 2, debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(amount), description: "Evento " + event.eventType, referenceType: event.sourceType, referenceId: event.sourceId },
          ] },
        },
      });
      await tx.accountingEvent.update({ where: { id: event.id }, data: { status: "PROCESSADO", processedAt: new Date(), entryId: entry.id, errorMessage: null } });
      await tx.auditLog.create({ data: { userId: user.id, action: "ACCOUNTING_EVENT_PROCESSED", entity: "AccountingEvent", entityId: event.id, metadata: { entryId: entry.id, idempotencyKey: event.idempotencyKey, amount } } });
      return { alreadyProcessed: false, entry };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return apiError(error, "Não foi possível processar o evento contábil.");
  }
}
