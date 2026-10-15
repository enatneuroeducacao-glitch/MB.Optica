import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

const EVENT_TYPES = new Set([
  "SALE_RECOGNIZED",
  "PAYMENT_RECEIVED",
  "SALE_REFUNDED",
  "PAYMENT_REVERSED",
  "SUPPLIER_EXPENSE_RECOGNIZED",
  "SUPPLIER_EXPENSE_RECOGNIZED_MERCADORIA_REVENDA",
  "SUPPLIER_EXPENSE_RECOGNIZED_DESPESA_OPERACIONAL",
  "SUPPLIER_EXPENSE_RECOGNIZED_IMPOSTO_TAXA",
  "SUPPLIER_EXPENSE_RECOGNIZED_PROLABORE_RETIRADA",
  "SUPPLIER_EXPENSE_RECOGNIZED_OUTRA_OBRIGACAO",
  "SUPPLIER_PAYMENT_MADE",
]);

export async function GET() {
  try {
    await requireRole(["ADMIN"]);
    const [mappings, events, accounts, paymentMethods, salesCount, paymentsCount, saleEventsCount, paymentEventsCount, pendingEventsCount] = await Promise.all([
      db.accountingMapping.findMany({
        orderBy: [{ eventType: "asc" }, { createdAt: "desc" }],
        include: {
          debitAccount: { select: { id: true, code: true, name: true, active: true } },
          creditAccount: { select: { id: true, code: true, name: true, active: true } },
          paymentMethod: { select: { id: true, name: true, isCash: true } },
        },
      }),
      db.accountingEvent.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
      db.chartOfAccount.findMany({ where: { active: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, active: true } }),
      db.paymentMethod.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, isCash: true } }),
      db.sale.count(),
      db.payment.count(),
      db.accountingEvent.count({ where: { eventType: "SALE_RECOGNIZED" } }),
      db.accountingEvent.count({ where: { eventType: "PAYMENT_RECEIVED" } }),
      db.accountingEvent.count({ where: { status: { in: ["PENDENTE", "ERRO"] } } }),
    ]);
    return NextResponse.json({
      mappings, events, accounts, paymentMethods, supportedEventTypes: [...EVENT_TYPES],
      integrationDiagnostics: {
        salesCount, paymentsCount, saleEventsCount, paymentEventsCount, pendingEventsCount,
        note: "Contagens históricas totais; não equivalem a falhas de integração. Compare operações novas feitas após a publicação."
      }
    });
  } catch (error) {
    return apiError(error, "Não foi possível carregar os mapeamentos contábeis.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireRole(["ADMIN"]);
    const body = await request.json();
    const action = String(body?.action || "");

    if (action === "CREATE_SAFE_BASE_MAPPINGS") {
      const requiredCodes = ["1.2", "4.1", "2.1", "6.1"];
      const accounts = await db.chartOfAccount.findMany({ where: { code: { in: requiredCodes }, active: true } });
      const byCode = new Map(accounts.map((account) => [account.code, account]));
      const missing = requiredCodes.filter((code) => !byCode.has(code));
      if (missing.length) {
        return NextResponse.json({ error: "Não foi possível preparar as sugestões. Faltam contas ativas: " + missing.join(", ") + ". Revise o plano de contas." }, { status: 400 });
      }
      const suggestions = [
        { eventType: "SALE_RECOGNIZED", debitCode: "1.2", creditCode: "4.1", description: "SUGESTÃO — venda reconhecida: débito em clientes a receber e crédito em receita de vendas. Revisar critérios de competência e origem." },
        { eventType: "SUPPLIER_EXPENSE_RECOGNIZED", debitCode: "6.1", creditCode: "2.1", description: "SUGESTÃO — despesa de fornecedor reconhecida: débito em despesas operacionais e crédito em fornecedores a pagar. Classificação depende da natureza da compra." },
      ];
      const created = [];
      const skipped = [];
      for (const suggestion of suggestions) {
        const debit = byCode.get(suggestion.debitCode)!;
        const credit = byCode.get(suggestion.creditCode)!;
        const existing = await db.accountingMapping.findFirst({ where: { eventType: suggestion.eventType } });
        if (existing) {
          skipped.push(suggestion.eventType);
          continue;
        }
        const mapping = await db.accountingMapping.create({
          data: { eventType: suggestion.eventType, debitAccountId: debit.id, creditAccountId: credit.id, description: suggestion.description, active: false },
          include: { debitAccount: { select: { id: true, code: true, name: true, active: true } }, creditAccount: { select: { id: true, code: true, name: true, active: true } } },
        });
        created.push(mapping);
      }
      await db.auditLog.create({ data: { userId: user.id, action: "ACCOUNTING_BASE_MAPPING_SUGGESTIONS_CREATED", entity: "AccountingMapping", metadata: { created: created.map((m) => m.eventType), skipped } } });
      return NextResponse.json({ created, skipped, note: "As sugestões foram criadas inativas. Não habilitam processamento até revisão e ativação explícita." }, { status: 201 });
    }

    if (action === "CREATE_MAPPING") {
      const eventType = String(body.eventType || "");
      const paymentMethodId = body.paymentMethodId ? String(body.paymentMethodId) : null;
      const debitAccountId = String(body.debitAccountId || "");
      const creditAccountId = String(body.creditAccountId || "");
      const description = String(body.description || "").trim() || null;
      if (!EVENT_TYPES.has(eventType)) return NextResponse.json({ error: "Tipo de evento contábil não permitido." }, { status: 400 });
      if (eventType === "PAYMENT_RECEIVED" && !paymentMethodId) return NextResponse.json({ error: "Selecione o meio de pagamento para este mapeamento." }, { status: 400 });
      if (eventType !== "PAYMENT_RECEIVED" && paymentMethodId) return NextResponse.json({ error: "O meio de pagamento só pode ser definido para recebimentos de venda." }, { status: 400 });
      if (!debitAccountId || !creditAccountId || debitAccountId === creditAccountId) return NextResponse.json({ error: "Selecione contas diferentes para débito e crédito." }, { status: 400 });
      const existingMapping = await db.accountingMapping.findFirst({ where: { eventType, paymentMethodId } });
      if (existingMapping) {
        const existingDetails = await db.accountingMapping.findUnique({
          where: { id: existingMapping.id },
          include: {
            debitAccount: { select: { code: true, name: true } },
            creditAccount: { select: { code: true, name: true } },
            paymentMethod: { select: { id: true, name: true, isCash: true } },
          },
        });
        return NextResponse.json({
          error: "Já existe um mapeamento para este evento e meio de pagamento.",
          existingMapping: existingDetails,
          guidance: "Confira a linha correspondente na lista. Se ela não aparecer, atualize a fila e verifique se o meio de pagamento continua ativo.",
        }, { status: 409 });
      }
      if (paymentMethodId) {
        const method = await db.paymentMethod.findFirst({ where: { id: paymentMethodId, active: true } });
        if (!method) return NextResponse.json({ error: "O meio de pagamento precisa existir e estar ativo." }, { status: 400 });
      }
      const [debit, credit] = await Promise.all([
        db.chartOfAccount.findFirst({ where: { id: debitAccountId, active: true } }),
        db.chartOfAccount.findFirst({ where: { id: creditAccountId, active: true } }),
      ]);
      if (!debit || !credit) return NextResponse.json({ error: "As duas contas devem existir e estar ativas." }, { status: 400 });
      const mapping = await db.accountingMapping.create({
        data: { eventType, paymentMethodId, debitAccountId, creditAccountId, description, active: false },
        include: { debitAccount: { select: { id: true, code: true, name: true } }, creditAccount: { select: { id: true, code: true, name: true } } },
      });
      await db.auditLog.create({ data: { userId: user.id, action: "ACCOUNTING_MAPPING_CREATED", entity: "AccountingMapping", entityId: mapping.id, metadata: { eventType, paymentMethodId, debitAccountId, creditAccountId } } });
      return NextResponse.json({ mapping }, { status: 201 });
    }

    if (action === "SET_MAPPING_ACTIVE") {
      const id = String(body.id || "");
      const active = body.active;
      if (!id || typeof active !== "boolean") return NextResponse.json({ error: "Informe o mapeamento e o estado desejado." }, { status: 400 });
      const current = await db.accountingMapping.findUnique({ where: { id } });
      if (!current) return NextResponse.json({ error: "Mapeamento não encontrado." }, { status: 404 });
      if (active) {
        const otherActive = await db.accountingMapping.findFirst({
          where: { eventType: current.eventType, paymentMethodId: current.paymentMethodId, active: true, id: { not: id } },
        });
        if (otherActive) {
          return NextResponse.json({ error: "Já existe outro mapeamento ativo para este evento. Desative-o antes de ativar este." }, { status: 409 });
        }
        const [debit, credit] = await Promise.all([
          db.chartOfAccount.findFirst({ where: { id: current.debitAccountId, active: true } }),
          db.chartOfAccount.findFirst({ where: { id: current.creditAccountId, active: true } }),
        ]);
        if (!debit || !credit) return NextResponse.json({ error: "As contas do mapeamento precisam estar ativas." }, { status: 400 });
      }
      const mapping = await db.accountingMapping.update({ where: { id }, data: { active } });
      await db.auditLog.create({ data: { userId: user.id, action: active ? "ACCOUNTING_MAPPING_ACTIVATED" : "ACCOUNTING_MAPPING_DEACTIVATED", entity: "AccountingMapping", entityId: mapping.id, metadata: { eventType: mapping.eventType, active } } });
      return NextResponse.json({ mapping });
    }

    return NextResponse.json({ error: "Ação de mapeamento desconhecida." }, { status: 400 });
  } catch (error) {
    // Diagnose a Prisma unique-constraint conflict that escaped the pre-check.
    const prismaError = error as { code?: string; meta?: { target?: unknown } };
    if (prismaError?.code === "P2002") {
      try {
        const body = await request.clone().json();
        if (String(body?.action || "") === "CREATE_MAPPING") {
          const eventType = String(body.eventType || "");
          const paymentMethodId = body.paymentMethodId ? String(body.paymentMethodId) : null;
          const debitAccountId = String(body.debitAccountId || "");
          const creditAccountId = String(body.creditAccountId || "");
          const existingMapping = await db.accountingMapping.findFirst({
            where: { eventType, paymentMethodId, debitAccountId, creditAccountId },
            include: {
              debitAccount: { select: { id: true, code: true, name: true, active: true } },
              creditAccount: { select: { id: true, code: true, name: true, active: true } },
              paymentMethod: { select: { id: true, name: true, isCash: true } },
            },
          });
          return NextResponse.json({
            error: "Este mapeamento já existe com a mesma combinação de evento, meio de pagamento, débito e crédito.",
            existingMapping,
            conflictType: "UNIQUE_CONSTRAINT",
            constraint: prismaError.meta?.target ?? null,
            guidance: existingMapping
              ? "O registro correspondente já está na lista. Não é necessário cadastrá-lo novamente."
              : "A restrição de unicidade foi acionada, mas não foi possível localizar a linha exata. Nenhum registro foi alterado; revisar os dados e a restrição no banco.",
          }, { status: 409 });
        }
      } catch {
        // Fall through to the generic API error without changing records.
      }
    }
    return apiError(error, "Não foi possível salvar o mapeamento contábil.");
  }
}
