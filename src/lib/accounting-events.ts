import { Prisma } from "@prisma/client";

/**
 * Creates a pending accounting event inside the same transaction as its source operation.
 * It intentionally does not post an accounting entry; an administrator must configure
 * a unique active mapping and process the event from the accounting workspace.
 */
export async function enqueueAccountingEvent(
  tx: Prisma.TransactionClient,
  input: {
    eventType: "SALE_RECOGNIZED" | "PAYMENT_RECEIVED" | "SALE_REFUNDED" | "PAYMENT_REVERSED" | "SUPPLIER_EXPENSE_RECOGNIZED" | "SUPPLIER_PAYMENT_MADE";
    sourceType: string;
    sourceId: string;
    idempotencyKey: string;
    payload: { amount: number; entryDate: string; description: string; [key: string]: unknown };
  },
) {
  const amount = Math.round((input.payload.amount + Number.EPSILON) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return tx.accountingEvent.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    create: {
      eventType: input.eventType,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      idempotencyKey: input.idempotencyKey,
      payload: { ...input.payload, amount } as Prisma.InputJsonObject,
      status: "PENDENTE",
    },
    update: {},
  });
}
