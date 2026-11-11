import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePlatformAccess } from "@/lib/tenant-auth";
import { apiError } from "@/lib/api-error";

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  ownerUserId: z.string().min(1),
  timezone: z.string().trim().min(1).max(80).default("America/Sao_Paulo"),
});

export async function GET() {
  try {
    await requirePlatformAccess(["OWNER", "SUPER_ADMIN"]);
    const organizations = await db.organization.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true, name: true, slug: true, status: true, timezone: true, createdAt: true,
        _count: { select: { memberships: true } },
        subscription: { select: { plan: true, status: true, maxUsers: true, currentPeriodEnd: true } },
      },
    });
    return NextResponse.json({ organizations });
  } catch (error) {
    return apiError(error, "Não foi possível listar as organizações.");
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requirePlatformAccess(["OWNER", "SUPER_ADMIN"]);
    const body = createSchema.parse(await request.json());
    const owner = await db.user.findUnique({ where: { id: body.ownerUserId }, select: { id: true, active: true } });
    if (!owner?.active) return NextResponse.json({ error: "Usuário inicial não encontrado ou inativo." }, { status: 422 });

    const organization = await db.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          name: body.name,
          slug: body.slug,
          timezone: body.timezone,
          memberships: {
            create: { userId: owner.id, role: "ADMIN", active: true },
          },
        },
      });
      await tx.subscription.create({
        data: {
          organizationId: created.id,
          plan: "PROFISSIONAL",
          status: "AVALIACAO",
          billingCycle: "MENSAL",
          price: 0,
          maxUsers: 5,
          trialDays: 60,
          trialEndsAt: new Date(Date.now() + 60 * 86400000),
          modules: ["Dashboard", "Agenda", "Clientes", "Atendimento", "Mensagens", "Produtos e estoque", "Fornecedores", "Vendas", "Financeiro", "Relatórios", "Configurações", "Receitas", "Orçamentos", "Pedidos", "Laboratório"],
        },
      });
      await tx.auditLog.create({
        data: {
          action: "PLATFORM_ORGANIZATION_CREATED",
          entity: "Organization",
          entityId: created.id,
          userId: actor.user.id,
          metadata: { slug: created.slug, initialAdminUserId: owner.id },
        },
      });
      return created;
    });
    return NextResponse.json({ organization }, { status: 201 });
  } catch (error) {
    return apiError(error, "Não foi possível criar a organização.");
  }
}
