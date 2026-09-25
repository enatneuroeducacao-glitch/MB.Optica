import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    return NextResponse.json({ user });
  } catch (error) {
    return apiError(error, "Não foi possível validar a sessão.");
  }
}
