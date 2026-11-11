import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePlatformAccess } from "@/lib/tenant-auth";
import { apiError } from "@/lib/api-error";

const schema = z.object({
  userId: z.string().min(1),
  role: z.enum(["ADMIN", "GERENTE", "VENDEDOR", "FINANCEIRO", "LABORATORIO"]),
  active: z.boolean().default(true),
});

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    await requirePlatformAccess(["OWNER", "SUPER_ADMIN", "SUPPORT"]);
    const { id } = await params;
    const organization = await db.organization.findUnique({ where: { id }, select: { id: true } });
    if (!organization) return NextResponse.json({ error: "Organização não encontrada." }, { status: 404 });
    const memberships = await db.organizationMembership.findMany({
      where: { organizationId: id },
      orderBy: { createdAt: "asc" },
      select: { id: true, userId: true, role: true, active: true, permissions: true, createdAt: true, user: { select: { name: true, email: true, active: true } } },
    });
    return NextResponse.json({ memberships });
  } catch (error) {
    return apiError(error, "Não foi possível listar os vínculos.");
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requirePlatformAccess(["OWNER", "SUPER_ADMIN"]);
    const { id } = await params;
    const body = schema.parse(await request.json());
    const [organization, user] = await Promise.all([
      db.organization.findUnique({ where: { id }, select: { id: true } }),
      db.user.findUnique({ where: { id: body.userId }, select: { id: true, active: true } }),
    ]);
    if (!organization) return NextResponse.json({ error: "Organização não encontrada." }, { status: 404 });
    if (!user?.active) return NextResponse.json({ error: "Usuário não encontrado ou inativo." }, { status: 422 });

    const membership = await db.$transaction(async (tx) => {
      const result = await tx.organizationMembership.upsert({
        where: { organizationId_userId: { organizationId: id, userId: user.id } },
        create: { organizationId: id, userId: user.id, role: body.role, active: body.active },
        update: { role: body.role, active: body.active },
      });
      await tx.auditLog.create({
        data: { action: "PLATFORM_MEMBERSHIP_UPSERTED", entity: "OrganizationMembership", entityId: result.id, userId: actor.user.id, metadata: { organizationId: id, memberUserId: user.id, role: body.role, active: body.active } },
      });
      return result;
    });
    return NextResponse.json({ membership }, { status: 201 });
  } catch (error) {
    return apiError(error, "Não foi possível atualizar o vínculo.");
  }
}
