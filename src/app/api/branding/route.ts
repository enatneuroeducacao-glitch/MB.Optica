import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api-error";

export async function GET() {
  try {
    const settings = await db.storeSettings.findFirst({
      where: { active: true },
      select: { tradeName: true, logoData: true },
    });

    return NextResponse.json({
      branding: {
        tradeName: settings?.tradeName || "MB Óptica",
        logoData: settings?.logoData || null,
      },
    });
  } catch (error) {
    return apiError(error, "Não foi possível carregar a identidade da óptica.");
  }
}
