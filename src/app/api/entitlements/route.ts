import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getSubscriptionEntitlement } from "@/lib/subscription";
import { apiError } from "@/lib/api-error";

export async function GET() {
  try {
    await requireUser();
    return NextResponse.json(await getSubscriptionEntitlement(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error, "Não foi possível carregar os recursos da assinatura.");
  }
}
