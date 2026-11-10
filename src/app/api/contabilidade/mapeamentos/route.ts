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

export async function GET(request: Request) {
  try {
    await requireRole(["ADMIN"]);
    const { searchParams } = new URL(request.url);
    const competencia = searchParams.get("competencia");
    let eventDateFilter: { gte: Date; lt: Date } | undefined;
    if (competencia) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) {
        return NextResponse.json({ error: "Competência inválida. Use o formato AAAA-MM." }, { status: 400 });
      }
      const [year, month] = competencia.split("-").map(Number);
      eventDateFilter = {
        gte: new Date(Date.UTC(year, month - 1, 1)),
        lt: new Date(Date.UTC(year, month, 1)),
      };
    }
    const [mappings, rawEvents, accounts, paymentMethods, salesCount, paymentsCount, saleEventsCount, paymentEventsCount, pendingEventsCount] = await Promise.all([
      db.accountingMapping.findMany({
        orderBy: [{ eventType: "asc" }, { createdAt: "desc" }],
        include: {
          debitAccount: { select: { id: true, code: true, name: true, active: true } },
          creditAccount: { select: { id: true, code: true, name: true, active: true } },
          paymentMethod: { select: { id: true, name: true, isCash: true } },
        },
      }),
      db.accountingEvent.findMany({
        orderBy: { createdAt: "desc" },
      }),
      db.chartOfAccount.findMany({ where: { active: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, active: true } }),
      db.paymentMethod.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, isCash: true } }),
      db.sale.count(),
      db.payment.count(),
      db.accountingEvent.count({ where: { eventType: "SALE_RECOGNIZED" } }),
      db.accountingEvent.count({ where: { eventType: "PAYMENT_RECEIVED" } }),
      db.accountingEvent.count({ where: { status: { in: ["PENDENTE", "ERRO"] } } }),
    ]);
    const periodEvents = eventDateFilter
      ? rawEvents.filter((event) => {
          const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
            ? event.payload as Record<string, unknown> : {};
          const rawDate = typeof payload.entryDate === "string" ? payload.entryDate : event.createdAt.toISOString();
          const eventDate = new Date(rawDate);
          return !Number.isNaN(eventDate.getTime()) && eventDate >= eventDateFilter!.gte && eventDate < eventDateFilter!.lt;
        })
      : rawEvents;
    const supplierAccountIds = Array.from(new Set(periodEvents
      .filter((event) => event.sourceType === "SUPPLIER" || event.eventType.startsWith("SUPPLIER_"))
      .map((event) => {
        const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
          ? event.payload as Record<string, unknown>
          : {};
        return String(payload.accountId || (event.sourceType === "SUPPLIER" ? event.sourceId : ""));
      })
      .filter(Boolean)));
    const supplierAccounts = supplierAccountIds.length
      ? await db.account.findMany({
          where: { id: { in: supplierAccountIds } },
          select: { id: true, description: true, supplier: { select: { name: true, document: true } } },
        })
      : [];
    const supplierAccountById = new Map(supplierAccounts.map((account) => [account.id, account]));
    const events = periodEvents.map((event) => {
      const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
        ? event.payload as Record<string, unknown>
        : {};
      const isSupplierEvent = event.sourceType === "SUPPLIER" || event.eventType.startsWith("SUPPLIER_");
      const accountId = String(payload.accountId || (event.sourceType === "SUPPLIER" ? event.sourceId : ""));
      const account = supplierAccountById.get(accountId);
      const supplier = account?.supplier;
      const supplierLabel = supplier
        ? supplier.name + (supplier.document ? " · CPF/CNPJ " + supplier.document : "")
        : null;

      // Resolve legacy events that stored the payment method name but not its database ID.
      let paymentMethodId = typeof payload.paymentMethodId === "string" ? payload.paymentMethodId : null;
      if (!paymentMethodId && ["PAYMENT_RECEIVED", "SUPPLIER_PAYMENT_MADE"].includes(event.eventType)) {
        const methodName = String(payload.paymentMethodName || payload.paymentMethod || payload.method || "").trim();
        if (methodName) {
          paymentMethodId = paymentMethods.find((method) => method.name.toLocaleLowerCase("pt-BR") === methodName.toLocaleLowerCase("pt-BR"))?.id || null;
        }
      }
      const matchingMappings = mappings.filter((item) =>
        item.eventType === event.eventType && (item.paymentMethodId || null) === (paymentMethodId || null)
      );
      const activeMappings = matchingMappings.filter((item) => item.active);
      const uniqueCandidate = matchingMappings.length === 1 ? matchingMappings[0] : null;
      const selectedMapping = activeMappings.length === 1 ? activeMappings[0] : uniqueCandidate;
      const accountsActive = !!selectedMapping?.debitAccount?.active && !!selectedMapping?.creditAccount?.active;
      let mappingStatus = "AUSENTE";
      if (activeMappings.length > 1) mappingStatus = "MULTIPLOS_ATIVOS";
      else if (activeMappings.length === 1 && !accountsActive) mappingStatus = "CONTAS_INATIVAS";
      else if (activeMappings.length === 1) mappingStatus = "ATIVO";
      else if (matchingMappings.length > 1) mappingStatus = "AMBIGUO";
      else if (uniqueCandidate) mappingStatus = "INATIVO_UNICO";

      return {
        ...event,
        ...(isSupplierEvent ? {
          sourceDisplay: supplierLabel || (account?.description ? String(account.description) : String(payload.description || "Fornecedor não identificado")),
        } : {}),
        mappingResolution: {
          status: mappingStatus,
          paymentMethodId,
          matchingCount: matchingMappings.length,
          activeCount: activeMappings.length,
          mapping: selectedMapping ? {
            id: selectedMapping.id,
            active: selectedMapping.active,
            debitAccount: selectedMapping.debitAccount,
            creditAccount: selectedMapping.creditAccount,
          } : null,
          explanation: mappingStatus === "AUSENTE"
            ? (["PAYMENT_RECEIVED", "SUPPLIER_PAYMENT_MADE"].includes(event.eventType) && !paymentMethodId
              ? "O evento não contém um meio de pagamento identificável; revise a quitação na origem."
              : "Não existe mapeamento cadastrado para este tipo de evento e meio de pagamento.")
            : mappingStatus === "INATIVO_UNICO" ? "Existe um único mapeamento correspondente, mas ele está inativo."
            : mappingStatus === "AMBIGUO" ? "Existem vários mapeamentos correspondentes; revise as regras para evitar escolha incorreta."
            : mappingStatus === "MULTIPLOS_ATIVOS" ? "Há mais de um mapeamento ativo para a mesma combinação."
            : mappingStatus === "CONTAS_INATIVAS" ? "O mapeamento está ativo, mas uma ou ambas as contas estão inativas."
            : "Mapeamento ativo e contas habilitadas.",
        },
      };
    });
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
      const requiredCodes = ["1.1.01", "1.1.02", "1.1.03", "1.2", "1.3", "4.1", "2.1", "6.1"];
      const accounts = await db.chartOfAccount.findMany({ where: { code: { in: requiredCodes }, active: true } });
      const byCode = new Map(accounts.map((account) => [account.code, account]));
      const missing = requiredCodes.filter((code) => !byCode.has(code));
      if (missing.length) {
        return NextResponse.json({ error: "Não foi possível preparar as sugestões. Faltam contas ativas: " + missing.join(", ") + ". Revise o plano de contas." }, { status: 400 });
      }

      const suggestions: { eventType: string; paymentMethodId?: string; debitCode: string; creditCode: string; description: string }[] = [
        { eventType: "SALE_RECOGNIZED", debitCode: "1.2", creditCode: "4.1", description: "SUGESTÃO — venda a prazo/crediário: débito em clientes a receber e crédito em receita de vendas. A receita é reconhecida uma única vez pelo valor total da venda." },
        { eventType: "SUPPLIER_EXPENSE_RECOGNIZED", debitCode: "6.1", creditCode: "2.1", description: "SUGESTÃO — despesa de fornecedor reconhecida (legado): débito em despesas operacionais e crédito em fornecedores a pagar. Classificação depende da natureza da compra." },
        { eventType: "SUPPLIER_EXPENSE_RECOGNIZED_MERCADORIA_REVENDA", debitCode: "1.3", creditCode: "2.1", description: "SUGESTÃO — compra de mercadorias para revenda: débito em estoques (1.3) e crédito em fornecedores a pagar (2.1). Não representa quitação; a baixa do banco/caixa ocorre no evento de pagamento. Revisar antes de ativar." },
        { eventType: "SUPPLIER_EXPENSE_RECOGNIZED_DESPESA_OPERACIONAL", debitCode: "6.1", creditCode: "2.1", description: "SUGESTÃO — despesa operacional de fornecedor: débito em despesas operacionais (6.1) e crédito em fornecedores a pagar (2.1). Não representa quitação; a baixa do banco/caixa ocorre no evento de pagamento. Revisar antes de ativar." },
        { eventType: "SUPPLIER_EXPENSE_RECOGNIZED_OUTRA_OBRIGACAO", debitCode: "6.1", creditCode: "2.1", description: "SUGESTÃO INATIVA — outra obrigação: débito provisório em despesas operacionais (6.1) e crédito em fornecedores a pagar (2.1). Use somente se a natureza da obrigação for efetivamente uma despesa operacional, como aluguel. Para empréstimos, tributos ou outras naturezas, selecione a conta de débito apropriada em um mapeamento manual. Revisar com a contabilidade antes de ativar." },
      ];

      // Sugere um mapeamento por meio REAL de recebimento. Crediário/carnê é condição de venda,
      // não é conta de liquidação: as parcelas devem usar o meio efetivamente recebido (PIX, dinheiro, cartão etc.).
      const methods = await db.paymentMethod.findMany({ where: { active: true }, orderBy: { name: "asc" } });
      const skippedMethods: string[] = [];
      for (const method of methods) {
        const name = method.name.toLocaleLowerCase("pt-BR");
        if (/credi[aá]rio|carn[eê]|fiado|a prazo/.test(name)) {
          skippedMethods.push(method.name + " (condição de crédito, não meio de recebimento)");
          continue;
        }
        let debitCode: string | null = null;
        if (/cart[aã]o/.test(name)) debitCode = "1.1.03";
        else if (/pix/.test(name)) debitCode = "1.1.02";
        else if (method.isCash || /dinheiro|esp[eé]cie/.test(name)) debitCode = "1.1.01";
        if (!debitCode) {
          skippedMethods.push(method.name + " (conta de destino não inferida; exige revisão manual)");
          continue;
        }
        suggestions.push({
          eventType: "PAYMENT_RECEIVED",
          paymentMethodId: method.id,
          debitCode,
          creditCode: "1.2",
          description: "SUGESTÃO — recebimento por " + method.name + ": débito em " + debitCode + " e crédito em 1.2 — Contas a receber de clientes. Revisar antes de ativar.",
        });

        // Na quitação de fornecedor, baixa-se a obrigação (2.1) e credita-se
        // a conta de caixa/banco efetivamente utilizada.
        // Cartões exigem conta de passivo própria e não recebem sugestão automática.
        if (debitCode === "1.1.01" || debitCode === "1.1.02") {
          suggestions.push({
            eventType: "SUPPLIER_PAYMENT_MADE",
            paymentMethodId: method.id,
            debitCode: "2.1",
            creditCode: debitCode,
            description: "SUGESTÃO — quitação de fornecedor por " + method.name + ": débito em 2.1 — Fornecedores a pagar e crédito em " + debitCode + ". Revisar antes de ativar.",
          });
        }
      }

      const created: any[] = [];
      const skipped: string[] = [];
      for (const suggestion of suggestions) {
        const debit = byCode.get(suggestion.debitCode)!;
        const credit = byCode.get(suggestion.creditCode)!;
        // Só considerar duplicada a sugestão quando evento, meio e contas forem idênticos.
        // Um mapeamento antigo/inativo com contas incorretas não pode bloquear a criação
        // da sugestão contábil correta para o mesmo tipo de evento.
        const existing = await db.accountingMapping.findFirst({
          where: {
            eventType: suggestion.eventType,
            paymentMethodId: suggestion.paymentMethodId ?? null,
            debitAccountId: debit.id,
            creditAccountId: credit.id,
          },
        });
        if (existing) {
          skipped.push(suggestion.eventType + (suggestion.paymentMethodId ? ":" + suggestion.paymentMethodId : ""));
          continue;
        }
        const mapping = await db.accountingMapping.create({
          data: {
            eventType: suggestion.eventType,
            paymentMethodId: suggestion.paymentMethodId ?? null,
            debitAccountId: debit.id,
            creditAccountId: credit.id,
            description: suggestion.description,
            active: false,
          },
          include: {
            debitAccount: { select: { id: true, code: true, name: true, active: true } },
            creditAccount: { select: { id: true, code: true, name: true, active: true } },
            paymentMethod: { select: { id: true, name: true, isCash: true } },
          },
        });
        created.push(mapping);
      }
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: "ACCOUNTING_BASE_MAPPING_SUGGESTIONS_CREATED",
          entity: "AccountingMapping",
          metadata: { created: created.map((m) => ({ eventType: m.eventType, paymentMethodId: m.paymentMethodId })), skipped, skippedMethods },
        },
      });
      return NextResponse.json({
        created,
        skipped,
        skippedMethods,
        note: "As sugestões de venda e recebimentos foram criadas inativas. Nenhum mapeamento foi ativado e nenhum evento foi processado. Crediário/carnê é tratado como conta a receber; cada liquidação usa o meio efetivamente recebido.",
      }, { status: 201 });
    }

    if (action === "CREATE_MAPPING") {
      const eventType = String(body.eventType || "");
      const paymentMethodId = body.paymentMethodId ? String(body.paymentMethodId) : null;
      const debitAccountId = String(body.debitAccountId || "");
      const creditAccountId = String(body.creditAccountId || "");
      const description = String(body.description || "").trim() || null;
      if (!EVENT_TYPES.has(eventType)) return NextResponse.json({ error: "Tipo de evento contábil não permitido." }, { status: 400 });
      const eventsRequiringPaymentMethod = new Set(["PAYMENT_RECEIVED", "SUPPLIER_PAYMENT_MADE"]);
      if (eventsRequiringPaymentMethod.has(eventType) && !paymentMethodId) return NextResponse.json({ error: "Selecione o meio de pagamento para este mapeamento." }, { status: 400 });
      if (!eventsRequiringPaymentMethod.has(eventType) && paymentMethodId) return NextResponse.json({ error: "O meio de pagamento só pode ser definido para recebimentos de venda ou pagamentos a fornecedores." }, { status: 400 });
      if (!debitAccountId || !creditAccountId || debitAccountId === creditAccountId) return NextResponse.json({ error: "Selecione contas diferentes para débito e crédito." }, { status: 400 });
      const existingMapping = await db.accountingMapping.findFirst({ where: { eventType, paymentMethodId, debitAccountId, creditAccountId } });
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
          error: "Já existe um mapeamento com este evento, meio de pagamento e a mesma combinação de contas.",
          existingMapping: existingDetails,
          guidance: "Mapeamentos inativos diferentes podem coexistir para o mesmo meio de pagamento. A combinação idêntica de evento, meio de pagamento, débito e crédito não pode ser duplicada. Confira o ID retornado na lista.",
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
