import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";

type AuditInput = {
  action: string;
  entity: string;
  entityId?: string;
  userId?: string;
  metadata?: Prisma.InputJsonValue;
  request?: Request;
  result?: "SUCCESS" | "FAILURE" | "DENIED";
};

function requestContext(request?: Request): Prisma.InputJsonObject {
  if (!request) return {};
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = (forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "").slice(0, 100);
  const userAgent = (request.headers.get("user-agent") || "").slice(0, 500);
  const requestId = (request.headers.get("x-request-id") || "").slice(0, 100);
  return {
    ...(realIp ? { ip: realIp } : {}),
    ...(userAgent ? { userAgent } : {}),
    ...(requestId ? { requestId } : {}),
    ...(request.url ? { path: new URL(request.url).pathname } : {}),
  };
}

export async function writeAudit(tx: Prisma.TransactionClient, input: AuditInput) {
  const currentUser = input.userId ? null : await getCurrentUser();
  const candidate = input.userId ?? currentUser?.id;
  const userId = candidate && candidate !== "test-admin" ? candidate : undefined;
  const metadata = {
    ...(input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
      ? input.metadata
      : {}),
    ...requestContext(input.request),
    result: input.result ?? "SUCCESS",
  };

  return tx.auditLog.create({
    data: {
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      userId,
      metadata,
    },
  });
}
