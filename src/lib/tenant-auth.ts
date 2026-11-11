import "server-only";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { resolveTenantContext, type TenantContext } from "@/lib/tenant-context";
import { enforceTenantSubscriptionAccess } from "@/lib/subscription";
import type { PlatformRole } from "@prisma/client";

/**
 * Resolve operational access from the authenticated user's persisted membership.
 * requestedOrganizationId is an untrusted selector; resolveTenantContext verifies
 * that the user has an active membership before returning it.
 *
 * This helper deliberately does not call requireUser(), because that legacy guard
 * applies the instance-wide subscription entitlement. Tenant subscription checks
 * are added separately once routes are migrated to this guard.
 */
export async function requireTenantContext(
  requestedOrganizationId?: string | null,
): Promise<TenantContext> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  const context = await resolveTenantContext(user.id, requestedOrganizationId);
  await enforceTenantSubscriptionAccess(context.organizationId);
  return context;
}

/**
 * Platform control-plane authorization. This is intentionally independent from
 * organization membership and never grants access to operational tenant data.
 */
export async function requirePlatformAccess(
  allowedRoles?: PlatformRole[],
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const access = await db.platformAccess.findUnique({
    where: { userId: user.id },
    select: { role: true, active: true },
  });

  if (!access?.active) throw new Error("PLATFORM_ACCESS_REQUIRED");
  if (allowedRoles?.length && !allowedRoles.includes(access.role)) {
    throw new Error("FORBIDDEN");
  }

  return { user, platformRole: access.role };
}
