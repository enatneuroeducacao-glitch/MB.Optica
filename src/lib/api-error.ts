import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

export function apiError(error: unknown, fallback = "Não foi possível concluir a operação.") {
  if (error instanceof Error && error.message === "UNAUTHORIZED") {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (error instanceof Error && error.message === "FORBIDDEN") {
    return NextResponse.json({ error: "Acesso não autorizado para este perfil." }, { status: 403 });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return NextResponse.json({ error: "O registro informado já existe." }, { status: 409 });
    if (error.code === "P2025") return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });
    if (error.code === "P2003") return NextResponse.json({ error: "A operação viola uma referência existente." }, { status: 409 });
  }
  if (process.env.NODE_ENV !== "production" && error instanceof Error) {
    return NextResponse.json({ error: fallback, detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}
