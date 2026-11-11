import "server-only";

import { db } from "@/lib/db";

export type TenantContext = {
  userId: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  organizationRole: string;
  permissions: unknown;
  platformRole: string | null;
};

/**
 * Resolve the active organization exclusively from persisted memberships.
 *
 * A client-supplied organizationId is only a selector. It is accepted only
 * when the authenticated user has an active membership in that organization.
 * Never use the selector directly in business queries.
 *
 * This helper is intentionally not wired into legacy guards yet. It must be
 * integrated together with the data backfill and tenant-scoped API rollout;
 * otherwise existing users without memberships would be locked out.
 */
export async function resolveTenantContext(
  userId: string,
  requestedOrganizationId?: string | null,
): Promise<TenantContext> {
  if (!userId) throw new Error("UNAUTHORIZED");

  const [memberships, platformAccess] = await Promise.all([
    db.organizationMembership.findMany({
      where: {
        userId,
        active: true,
        organization: { status: "ACTIVE" },
      },
      select: {
        organizationId: true,
        role: true,
        permissions: true,
        organization: {
          select: { name: true, slug: true, status: true },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.platformAccess.findUnique({
      where: { userId },
      select: { role: true, active: true },
    }),
  ]);

  const activePlatformRole =
    platformAccess?.active ? platformAccess.role : null;

  let membership = null;

  if (requestedOrganizationId) {
    membership =
      memberships.find(
        (item) => item.organizationId === requestedOrganizationId,
      ) ?? null;

    if (!membership) throw new Error("TENANT_ACCESS_DENIED");
  } else if (memberships.length === 1) {
    membership = memberships[0];
  } else if (memberships.length > 1) {
    throw new Error("TENANT_SELECTION_REQUIRED");
  }

  if (!membership) {
    // Platform access alone is not an operational tenant membership.
    // Central administration must use separately guarded platform APIs.
    if (activePlatformRole) throw new Error("TENANT_SELECTION_REQUIRED");
    throw new Error("TENANT_MEMBERSHIP_REQUIRED");
  }

  if (!membership.organization) throw new Error("TENANT_ACCESS_DENIED");

  return {
    userId,
    organizationId: membership.organizationId,
    organizationName: membership.organization.name,
    organizationSlug: membership.organization.slug,
    organizationRole: membership.role,
    permissions: membership.permissions,
    platformRole: activePlatformRole,
  };
}
