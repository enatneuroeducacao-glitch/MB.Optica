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
      if (!["SALE_RECOGNIZED", "PAYMENT_RECEIVED", "SALE_REFUNDED", "PAYMENT_REVERSED", "SUPPLIER_EXPENSE_RECOGNIZED", "SUPPLIER_PAYMENT_MADE", "SUPPLIER_EXPENSE_RECOGNIZED_MERCADORIA_REVENDA",
  "SUPPLIER_EXPENSE_RECOGNIZED_DESPESA_OPERACIONAL",
  "SUPPLIER_EXPENSE_RECOGNIZED_IMPOSTO_TAXA",
  "SUPPLIER_EXPENSE_RECOGNIZED_PROLABORE_RETIRADA",
  "SUPPLIER_EXPENSE_RECOGNIZED_OUTRA_OBRIGACAO"].includes(event.eventType)) {
        throw new Error("Tipo de evento não suportado.");
      }
      let payload: Record<string, unknown> = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload) ? event.payload as Record<string, unknown> : {};
      // Eventos antigos de recebimento podem não conter metadados do meio de pagamento.
      // Recupera os dados do pagamento operacional de origem, sem inventar valores nem criar outro recebimento.
      if (event.eventType === "PAYMENT_RECEIVED" && (!payload.paymentMethodId || typeof payload.paymentMethodName !== "string" || typeof payload.isCash !== "boolean")) {
        const sourcePayment = await tx.payment.findUnique({
          where: { id: event.sourceId },
          include: { method: true },
        });
        if (sourcePayment) {
          payload = {
            ...payload,
            paymentMethodId: payload.paymentMethodId || sourcePayment.methodId,
            paymentMethodName: typeof payload.paymentMethodName === "string" ? payload.paymentMethodName : sourcePayment.method.name,
            isCash: typeof payload.isCash === "boolean" ? payload.isCash : sourcePayment.method.isCash,
            cardMachineId: payload.cardMachineId ?? sourcePayment.cardMachineId ?? null,
            cardFeeAmount: payload.cardFeeAmount ?? Number(sourcePayment.cardFeeAmount ?? 0),
            cardNetAmount: payload.cardNetAmount ?? Number(sourcePayment.cardNetAmount ?? sourcePayment.amount),
            reference: payload.reference ?? sourcePayment.reference ?? null,
          };
        }
      }
      const amount = money(Number(payload.amount));
      const sourceDate = new Date(String(payload.entryDate || event.createdAt.toISOString()));
      if (!Number.isFinite(amount) || amount <= 0 || Number.isNaN(sourceDate.getTime())) throw new Error("Evento sem valor positivo ou data válida.");
      if (event.eventType === "PAYMENT_RECEIVED" && (!payload.paymentMethodId || typeof payload.paymentMethodName !== "string" || typeof payload.isCash !== "boolean")) {
        throw new Error("Recebimento sem dados do meio de pagamento. Revise o evento antes de contabilizar.");
      }
      if (event.eventType === "PAYMENT_RECEIVED") {
        const fee = payload.cardFeeAmount == null ? 0 : Number(payload.cardFeeAmount);
        const net = payload.cardNetAmount == null ? amount : Number(payload.cardNetAmount);
        const methodName = String(payload.paymentMethodName || "").toLocaleLowerCase("pt-BR");
        const isCard = methodName.includes("cartão") || methodName.includes("cartao");
        if (!Number.isFinite(fee) || fee < 0 || !Number.isFinite(net) || net < 0 || Math.abs(money(amount - fee) - money(net)) > 0.01) {
          throw new Error("Dados de taxa e valor líquido do cartão inconsistentes. Evento não contabilizado; revise os dados do pagamento.");
        }
        // O evento reconhece o recebivel bruto da operadora. A taxa so deve ser contabilizada na liquidacao efetiva da operadora.
      }
      const period = await tx.accountingPeriod.findFirst({ where: { status: "ABERTO", startDate: { lte: sourceDate }, endDate: { gte: sourceDate } } });
      if (!period) throw new Error("Não existe período contábil aberto para a data do evento.");
      const paymentMethodId = event.eventType === "PAYMENT_RECEIVED" ? String(payload.paymentMethodId || "") : null;
      if (event.eventType === "PAYMENT_RECEIVED" && !paymentMethodId) throw new Error("Recebimento sem meio de pagamento identificado; revise o evento antes de contabilizar.");
      const activeMappings = await tx.accountingMapping.findMany({ where: { eventType: event.eventType, paymentMethodId, active: true } });
      if (activeMappings.length === 0) throw new Error("Não há mapeamento ativo para este tipo de evento.");
      if (activeMappings.length !== 1) throw new Error("Há mais de um mapeamento ativo para este evento. Deixe apenas um ativo antes de processar.");
      const mapping = activeMappings[0];
      const accounts = await tx.chartOfAccount.findMany({ where: { id: { in: [mapping.debitAccountId, mapping.creditAccountId] }, active: true }, select: { id: true, code: true, name: true } });
      if (accounts.length !== 2) throw new Error("As contas do mapeamento precisam estar ativas.");
      if (event.eventType === "PAYMENT_RECEIVED" && /cart[aã]o/i.test(String(payload.paymentMethodName || ""))) {
        const debit = accounts.find((account) => account.id === mapping.debitAccountId);
        const credit = accounts.find((account) => account.id === mapping.creditAccountId);
        if (debit?.code !== "1.1.03" || credit?.code !== "1.2") {
          throw new Error("Para recebimento por cartão, configure débito em 1.1.03 — Valores a receber de cartões e crédito em 1.2 — Contas a receber de clientes. A taxa será reconhecida somente na liquidação da operadora.");
        }
      }
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
