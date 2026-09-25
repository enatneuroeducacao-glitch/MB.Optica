import { NextResponse } from "next/server";

export function apiError(error: unknown, fallback = "Não foi possível concluir a operação.") {
  if (error instanceof Error && error.message === "UNAUTHORIZED") {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (error instanceof Error && error.message === "FORBIDDEN") {
    return NextResponse.json({ error: "Acesso não autorizado para este perfil." }, { status: 403 });
  }
  return NextResponse.json({ error: fallback }, { status: 400 });
}
