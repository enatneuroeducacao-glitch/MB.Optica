import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

class AccountingEventValidationError extends Error {}

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export async function POST(request: Request) {
  let requestedEventId = "";
  try {
    const user = await requireRole(["ADMIN"]);
    const body = await request.json();
    const eventId = String(body?.eventId || "");
    requestedEventId = eventId;
    if (!eventId) return NextResponse.json({ error: "Informe o evento contábil." }, { status: 400 });

    const result = await db.$transaction(async (tx) => {
      const event = await tx.accountingEvent.findUnique({ where: { id: eventId } });
      if (!event) throw new AccountingEventValidationError("Evento contábil não encontrado.");
      if (event.status === "PROCESSADO" && event.entryId) {
        const existing = await tx.accountingEntry.findUnique({ where: { id: event.entryId }, include: { lines: true } });
        return { alreadyProcessed: true, entry: existing };
      }
      if (event.status === "PROCESSANDO") throw new AccountingEventValidationError("Evento já está em processamento; tente novamente em instantes.");
      if (!["SALE_RECOGNIZED", "PAYMENT_RECEIVED", "SALE_REFUNDED", "PAYMENT_REVERSED", "SUPPLIER_EXPENSE_RECOGNIZED", "SUPPLIER_PAYMENT_MADE", "SUPPLIER_EXPENSE_RECOGNIZED_MERCADORIA_REVENDA",
  "SUPPLIER_EXPENSE_RECOGNIZED_DESPESA_OPERACIONAL",
  "SUPPLIER_EXPENSE_RECOGNIZED_IMPOSTO_TAXA",
  "SUPPLIER_EXPENSE_RECOGNIZED_PROLABORE_RETIRADA",
  "SUPPLIER_EXPENSE_RECOGNIZED_OUTRA_OBRIGACAO"].includes(event.eventType)) {
        throw new AccountingEventValidationError("Tipo de evento não suportado.");
      }
      let payload: Record<string, unknown> = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload) ? event.payload as Record<string, unknown> : {};
      // Eventos antigos de recebimento podem não conter metadados do meio de pagamento.
      // Recupera os dados do pagamento operacional de origem, sem inventar valores nem criar outro recebimento.
      // Eventos antigos podem guardar o nome do meio de pagamento sem o ID.
      // Recupera o cadastro ativo pelo nome para permitir o mapeamento correto.
      const paymentMethodName = typeof payload.paymentMethod === "string" ? payload.paymentMethod.trim() : "";
      if (event.eventType === "SUPPLIER_PAYMENT_MADE" && !payload.paymentMethodId && paymentMethodName) {
        const activeMethods = await tx.paymentMethod.findMany({
          where: { active: true },
          select: { id: true, name: true },
        });
        const sourceMethod = activeMethods.find(
          (method) => method.name.trim().toLocaleLowerCase("pt-BR") === paymentMethodName.toLocaleLowerCase("pt-BR")
        );
        if (sourceMethod) {
          payload = { ...payload, paymentMethodId: sourceMethod.id, paymentMethodName: sourceMethod.name };
        }
      }
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
      // Recover original settlement details for legacy supplier events.
      if (event.eventType === "SUPPLIER_PAYMENT_MADE") {
        const settlementId = String(payload.settlementId || event.sourceId || "");
        const sourceSettlement = settlementId
          ? await tx.accountSettlement.findUnique({ where: { id: settlementId }, include: { paymentMethod: true } })
          : null;
        const legacyMethodName = String(payload.paymentMethodName || payload.paymentMethod || payload.method || sourceSettlement?.method || "").trim();
        const methodRecord = sourceSettlement?.paymentMethod?.active
          ? sourceSettlement.paymentMethod
          : legacyMethodName
            ? await tx.paymentMethod.findFirst({ where: { name: { equals: legacyMethodName, mode: "insensitive" }, active: true } })
            : null;
        payload = {
          ...payload,
          amount: sourceSettlement ? Number(sourceSettlement.amount) : payload.amount,
          entryDate: sourceSettlement ? sourceSettlement.paidAt.toISOString() : payload.entryDate,
          paymentMethodId: payload.paymentMethodId || methodRecord?.id || null,
          paymentMethodName: payload.paymentMethodName || methodRecord?.name || legacyMethodName || null,
          paymentMethod: payload.paymentMethod || methodRecord?.name || legacyMethodName || null,
        };
      }
      const amount = money(Number(payload.amount));
      const sourceDate = new Date(String(payload.entryDate || event.createdAt.toISOString()));
      if (!Number.isFinite(amount) || amount <= 0 || Number.isNaN(sourceDate.getTime())) throw new AccountingEventValidationError("Evento sem valor positivo ou data válida.");
      if (event.eventType === "PAYMENT_RECEIVED" && (!payload.paymentMethodId || typeof payload.paymentMethodName !== "string" || typeof payload.isCash !== "boolean")) {
        throw new AccountingEventValidationError("Recebimento sem dados do meio de pagamento. Revise o evento antes de contabilizar.");
      }
      if (event.eventType === "PAYMENT_RECEIVED") {
        const fee = payload.cardFeeAmount == null ? 0 : Number(payload.cardFeeAmount);
        const net = payload.cardNetAmount == null ? amount : Number(payload.cardNetAmount);
        const methodName = String(payload.paymentMethodName || "").toLocaleLowerCase("pt-BR");
        const isCard = methodName.includes("cartão") || methodName.includes("cartao");
        if (!Number.isFinite(fee) || fee < 0 || !Number.isFinite(net) || net < 0 || Math.abs(money(amount - fee) - money(net)) > 0.01) {
          throw new AccountingEventValidationError("Dados de taxa e valor líquido do cartão inconsistentes. Evento não contabilizado; revise os dados do pagamento.");
        }
        // O evento reconhece o recebivel bruto da operadora. A taxa so deve ser contabilizada na liquidacao efetiva da operadora.
      }
      const period = await tx.accountingPeriod.findFirst({ where: { status: "ABERTO", startDate: { lte: sourceDate }, endDate: { gte: sourceDate } } });
      if (!period) {
        const existingPeriod = await tx.accountingPeriod.findFirst({
          where: { startDate: { lte: sourceDate }, endDate: { gte: sourceDate } },
          orderBy: { createdAt: "desc" },
        });
        const dateLabel = sourceDate.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
        const monthLabel = sourceDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
        if (existingPeriod) {
          throw new AccountingEventValidationError(
            "O período contábil de " + monthLabel + " existe, mas está " + existingPeriod.status + ". Reabra-o formalmente na aba Períodos contábeis ou faça o ajuste no período correto antes de processar. Data do evento: " + dateLabel + "."
          );
        }
        throw new AccountingEventValidationError(
          "Não existe período contábil cadastrado para " + monthLabel + ". Acesse Contabilidade > Períodos contábeis e crie/abra o período correspondente antes de processar. Data do evento: " + dateLabel + "."
        );
      }
      const usesPaymentMethod = event.eventType === "PAYMENT_RECEIVED" || event.eventType === "SUPPLIER_PAYMENT_MADE";
      const paymentMethodId = usesPaymentMethod ? String(payload.paymentMethodId || "") : null;
      if (usesPaymentMethod && !paymentMethodId) {
        throw new AccountingEventValidationError(
          event.eventType === "SUPPLIER_PAYMENT_MADE"
            ? "Quitação de fornecedor sem meio de pagamento cadastrado. Registre a quitação selecionando um meio ativo e depois processe o novo evento."
            : "Recebimento sem meio de pagamento identificado; revise o evento antes de contabilizar."
        );
      }
      const matchingMappings = await tx.accountingMapping.findMany({
        where: { eventType: event.eventType, paymentMethodId },
        include: {
          debitAccount: { select: { id: true, code: true, name: true, active: true } },
          creditAccount: { select: { id: true, code: true, name: true, active: true } },
        },
      });
      const activeMappings = matchingMappings.filter((item) => item.active);
      if (activeMappings.length === 0) {
        if (matchingMappings.length === 1) {
          const candidate = matchingMappings[0];
          throw new AccountingEventValidationError(
            "Existe um mapeamento cadastrado, mas inativo para este evento (ID: " + candidate.id + "). Confira débito " +
            candidate.debitAccount.code + " — " + candidate.debitAccount.name + " e crédito " +
            candidate.creditAccount.code + " — " + candidate.creditAccount.name + "; depois ative-o em Integração contábil."
          );
        }
        if (matchingMappings.length > 1) {
          throw new AccountingEventValidationError("Existem " + matchingMappings.length + " mapeamentos cadastrados para este evento e meio de pagamento, mas nenhum está ativo. Revise as contas e mantenha apenas a regra correta ativa.");
        }
        throw new AccountingEventValidationError(
          "Não existe mapeamento cadastrado para o evento " + event.eventType +
          (usesPaymentMethod ? " e o meio de pagamento identificado (" + String(payload.paymentMethodName || payload.paymentMethod || paymentMethodId) + ")" : "") +
          ". Cadastre a regra correspondente em Contabilidade > Integração contábil."
        );
      }
      if (activeMappings.length !== 1) throw new AccountingEventValidationError("Há mais de um mapeamento ativo para este evento. Deixe apenas um ativo antes de processar.");
      const mapping = activeMappings[0];
      const accounts = await tx.chartOfAccount.findMany({ where: { id: { in: [mapping.debitAccountId, mapping.creditAccountId] }, active: true }, select: { id: true, code: true, name: true } });
      if (accounts.length !== 2) throw new AccountingEventValidationError("As contas do mapeamento precisam estar ativas.");
      if (event.eventType === "PAYMENT_RECEIVED" && /cart[aã]o/i.test(String(payload.paymentMethodName || ""))) {
        const debit = accounts.find((account) => account.id === mapping.debitAccountId);
        const credit = accounts.find((account) => account.id === mapping.creditAccountId);
        if (debit?.code !== "1.1.03" || credit?.code !== "1.2") {
          throw new AccountingEventValidationError("Para recebimento por cartão, configure débito em 1.1.03 — Valores a receber de cartões e crédito em 1.2 — Contas a receber de clientes. A taxa será reconhecida somente na liquidação da operadora.");
        }
      }
      const existingByKey = await tx.accountingEntry.findUnique({ where: { originKey: event.idempotencyKey } });
      if (existingByKey) {
        // Never relink an event to an entry that has already been reversed.
        // Reprocessing must not silently report a reversed entry as a valid accounting result.
        if (existingByKey.status === "ESTORNADO" || existingByKey.reversedAt) {
          throw new AccountingEventValidationError("Este evento possui um lançamento original já estornado. Não é seguro reprocessá-lo automaticamente; revise o histórico e gere um novo evento de origem após corrigir a operação.");
        }
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
    if (error instanceof AccountingEventValidationError) {
      if (requestedEventId) {
        try {
          await db.accountingEvent.update({
            where: { id: requestedEventId },
            data: { status: "ERRO", errorMessage: error.message },
          });
        } catch {
          // Preserve the original validation response if recording the diagnostic fails.
        }
      }
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    return apiError(error, "Não foi possível processar o evento contábil.");
  }
}
