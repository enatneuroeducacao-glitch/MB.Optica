import { NextResponse } from "next/server";
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
    if (report === "reconciliacao") {
      const events = await db.accountingEvent.findMany({
        orderBy: { createdAt: "asc" },
        take: 5000,
      });
      const periodEvents = events.filter((event) => {
        const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
          ? event.payload as Record<string, unknown>
          : {};
        const date = new Date(String(payload.entryDate || event.createdAt.toISOString()));
        const day = Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);\n        const startDay = period.startDate.toISOString().slice(0, 10);\n        const endDay = period.endDate.toISOString().slice(0, 10);\n        return Boolean(day) && day >= startDay && day <= endDay;
      });
      const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
      const pendingEvents = periodEvents.filter((event) => event.status !== "PROCESSADO");
      const processedWithoutEntry = periodEvents.filter((event) => event.status === "PROCESSADO" && (!event.entryId || !entriesById.has(event.entryId)));
      const unbalancedEntries = entries.map((entry) => {
        const lineDebit = Math.round(entry.lines.reduce((sum, line) => sum + Number(line.debit), 0) * 100) / 100;
        const lineCredit = Math.round(entry.lines.reduce((sum, line) => sum + Number(line.credit), 0) * 100) / 100;
        const headerDebit = Math.round(Number(entry.totalDebit) * 100) / 100;
        const headerCredit = Math.round(Number(entry.totalCredit) * 100) / 100;
        return {
          entryId: entry.id,
          description: entry.description,
          headerDebit,
          headerCredit,
          lineDebit,
          lineCredit,
        };
      }).filter((entry) => Math.abs(entry.headerDebit - entry.headerCredit) > 0.01
        || Math.abs(entry.lineDebit - entry.lineCredit) > 0.01
        || Math.abs(entry.headerDebit - entry.lineDebit) > 0.01
        || Math.abs(entry.headerCredit - entry.lineCredit) > 0.01);
      const reportRows = periodEvents.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        sourceType: event.sourceType,
        sourceId: event.sourceId,
        status: event.status,
        idempotencyKey: event.idempotencyKey,
        entryId: event.entryId,
        errorMessage: event.errorMessage,
        processedEntryInPeriod: Boolean(event.entryId && entriesById.has(event.entryId)),
      }));
      return NextResponse.json({
        period,
        summary: {
          events: periodEvents.length,
          pendingEvents: pendingEvents.length,
          processedWithoutEntry: processedWithoutEntry.length,
          unbalancedEntries: unbalancedEntries.length,
          balanced: pendingEvents.length === 0 && processedWithoutEntry.length === 0 && unbalancedEntries.length === 0,
        },
        events: reportRows,
        unbalancedEntries,
        pendingEventIds: pendingEvents.map((event) => event.id),
        processedWithoutEntryIds: processedWithoutEntry.map((event) => event.id),
      });
    }
    if (report === "reconciliacao") {
      const events = await db.accountingEvent.findMany({ orderBy: { createdAt: "asc" }, take: 5000 });
      const periodEvents = events.filter((event) => {
        const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
          ? event.payload as Record<string, unknown> : {};
        const date = new Date(String(payload.entryDate || event.createdAt.toISOString()));
        return !Number.isNaN(date.getTime()) && date >= period.startDate && date <= period.endDate;
      });
      const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
      const pendingEvents = periodEvents.filter((event) => event.status !== "PROCESSADO");
      const processedWithoutEntry = periodEvents.filter((event) => event.status === "PROCESSADO" && (!event.entryId || !entriesById.has(event.entryId)));
      const unbalancedEntries = entries.map((entry) => {
        const lineDebit = Math.round(entry.lines.reduce((sum, line) => sum + Number(line.debit), 0) * 100) / 100;
        const lineCredit = Math.round(entry.lines.reduce((sum, line) => sum + Number(line.credit), 0) * 100) / 100;
        const headerDebit = Math.round(Number(entry.totalDebit) * 100) / 100;
        const headerCredit = Math.round(Number(entry.totalCredit) * 100) / 100;
        return { entryId: entry.id, description: entry.description, headerDebit, headerCredit, lineDebit, lineCredit };
      }).filter((entry) => Math.abs(entry.headerDebit - entry.headerCredit) > 0.01
        || Math.abs(entry.lineDebit - entry.lineCredit) > 0.01
        || Math.abs(entry.headerDebit - entry.lineDebit) > 0.01
        || Math.abs(entry.headerCredit - entry.lineCredit) > 0.01);
      const reportRows = periodEvents.map((event) => ({
        id: event.id, eventType: event.eventType, sourceType: event.sourceType,
        sourceId: event.sourceId, status: event.status, idempotencyKey: event.idempotencyKey,
        entryId: event.entryId, errorMessage: event.errorMessage,
        processedEntryInPeriod: Boolean(event.entryId && entriesById.has(event.entryId)),
      }));
      return NextResponse.json({
        period,
        summary: {
          events: periodEvents.length, pendingEvents: pendingEvents.length,
          processedWithoutEntry: processedWithoutEntry.length,
          unbalancedEntries: unbalancedEntries.length,
          balanced: pendingEvents.length === 0 && processedWithoutEntry.length === 0 && unbalancedEntries.length === 0,
        },
        events: reportRows, unbalancedEntries,
        pendingEventIds: pendingEvents.map((event) => event.id),
        processedWithoutEntryIds: processedWithoutEntry.map((event) => event.id),
      });
    }
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
    const accounts = await db.chartOfAccount.findMany({ orderBy: { code: "asc" } });
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
