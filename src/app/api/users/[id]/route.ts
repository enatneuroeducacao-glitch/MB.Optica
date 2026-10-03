import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

const schema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().max(160).optional(),
  mbEmail: z.string().trim().email().max(160).optional().or(z.literal("")),
  role: z.enum(["ADMIN", "GERENTE", "VENDEDOR", "FINANCEIRO", "LABORATORIO"]).optional(),
  active: z.boolean().optional(),
  permissions: z.record(z.string(), z.boolean()).optional(),
  password: z.string().min(8).max(200).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRole(["ADMIN"]);
    const { id } = await params;
    const body = schema.parse(await request.json());

    if (actor.id === id && (body.active === false || body.role && body.role !== "ADMIN")) {
      return NextResponse.json({ error: "O administrador atual não pode remover o próprio acesso administrativo." }, { status: 409 });
    }

    const updated = await db.$transaction(async (tx) => {
      const current = await tx.user.findUnique({ where: { id } });
      if (!current) throw new Error("USER_NOT_FOUND");

      const nextRole = body.role ?? current.role;
      const nextActive = body.active ?? current.active;
      if (current.role === "ADMIN" && (nextRole !== "ADMIN" || !nextActive)) {
        const activeAdmins = await tx.user.count({ where: { role: "ADMIN", active: true } });
        if (activeAdmins <= 1) throw new Error("LAST_ADMIN");
      }

      const passwordHash = body.password ? await bcrypt.hash(body.password, 12) : undefined;
      const user = await tx.user.update({
        where: { id },
        data: {
          name: body.name,
          email: body.email?.toLowerCase(),
          mbEmail: body.mbEmail?.trim().toLowerCase() || null,
          role: body.role,
          active: body.active,
          passwordHash,
          mustChangePassword: body.password && actor.id !== id ? true : undefined,
          permissions: body.permissions,
          ...(body.password || body.active !== undefined || body.role || body.permissions ? { sessionVersion: { increment: 1 } } : {}),
        },
        select: { id: true, name: true, email: true, mbEmail: true, role: true, active: true, lastLoginAt: true, createdAt: true, permissions: true, mustChangePassword: true },
      });

      await tx.auditLog.create({
        data: {
          action: "USER_UPDATED",
          entity: "User",
          entityId: id,
          userId: actor.id,
          metadata: {
            fields: Object.keys(body),
            passwordChanged: Boolean(body.password),
            roleChanged: Boolean(body.role),
            activeChanged: body.active !== undefined,
            permissionsChanged: body.permissions !== undefined,
          },
        },
      });
      return user;
    });

    return NextResponse.json({ user: updated });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Dados de usuário inválidos." }, { status: 422 });
    if (error instanceof Error && error.message === "USER_NOT_FOUND") return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    if (error instanceof Error && error.message === "LAST_ADMIN") return NextResponse.json({ error: "O sistema precisa manter pelo menos um administrador ativo." }, { status: 409 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "O e-mail informado já está em uso." }, { status: 409 });
    return apiError(error, "Não foi possível atualizar o usuário.");
  }
}


export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRole(["ADMIN"]);
    const { id } = await params;

    if (actor.id === id) {
      return NextResponse.json({ error: "O administrador atual não pode excluir o próprio usuário." }, { status: 409 });
    }

    await db.$transaction(async (tx) => {
      const current = await tx.user.findUnique({
        where: { id },
        select: { id: true, name: true, role: true, active: true },
      });
      if (!current) throw new Error("USER_NOT_FOUND");

      if (current.role === "ADMIN") {
        const activeAdmins = await tx.user.count({ where: { role: "ADMIN", active: true } });
        if (activeAdmins <= 1) throw new Error("LAST_ADMIN");
      }

      const [sales, orders, quotes] = await Promise.all([
        tx.sale.count({ where: { sellerId: id } }),
        tx.opticalOrder.count({ where: { sellerId: id } }),
        tx.quote.count({ where: { sellerId: id } }),
      ]);

      if (sales || orders || quotes) {
        throw new Error("USER_HAS_TRANSACTIONS");
      }

      await tx.auditLog.updateMany({
        where: { userId: id },
        data: { userId: null },
      });

      await tx.user.delete({ where: { id } });

      await tx.auditLog.create({
        data: {
          action: "USER_DELETED",
          entity: "User",
          entityId: id,
          userId: actor.id,
          metadata: { name: current.name, role: current.role },
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "USER_NOT_FOUND") return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    if (error instanceof Error && error.message === "LAST_ADMIN") return NextResponse.json({ error: "O sistema precisa manter pelo menos um administrador ativo." }, { status: 409 });
    if (error instanceof Error && error.message === "USER_HAS_TRANSACTIONS") return NextResponse.json({ error: "Este usuário possui vendas, pedidos ou orçamentos vinculados. Para preservar o histórico, desative o usuário em vez de excluí-lo." }, { status: 409 });
    return apiError(error, "Não foi possível excluir o usuário.");
  }
}
