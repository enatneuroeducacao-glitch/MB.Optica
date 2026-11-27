import type {Prisma} from "@prisma/client";

/**
 * Add a durable stock-sync intent to the same local transaction as the stock
 * mutation. No network request is made by the business API request.
 */
export async function enqueuePublishedProductStockSync(
  tx: Prisma.TransactionClient,
  productId: string,
) {
  const product = await tx.product.findUnique({
    where: { id: productId },
    select: { id: true, publishedOnSite: true },
  });
  if (!product?.publishedOnSite) return { queued: false, reason: "NOT_PUBLISHED" as const };

  // Coalesce pending stock updates: the worker always sends the latest stock.
  await tx.siteSyncOutbox.deleteMany({
    where: { productId, status: "PENDING" },
  });
  await tx.siteSyncOutbox.create({
    data: { productId, eventType: "PRODUCT_STOCK", status: "PENDING" },
  });
  return { queued: true };
}
