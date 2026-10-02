import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

const SVRS_NFCE_HOMOLOGATION =
  "https://nfce-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx";

const QR_CODE_HOMOLOGATION =
  "https://hom.sat.sef.sc.gov.br/nfce/consulta?p=";

function digits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function isValidCnpj(value: string) {
  const cnpj = digits(value);
  if (cnpj.length !== 14 || /^([0-9])\1{13}$/.test(cnpj)) return false;

  let sum = 0;
  let weight = 5;
  for (let i = 0; i < 12; i++) {
    sum += Number(cnpj[i]) * weight;
    weight = weight === 2 ? 9 : weight - 1;
  }
  let digit = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (digit !== Number(cnpj[12])) return false;

  sum = 0;
  weight = 6;
  for (let i = 0; i < 13; i++) {
    sum += Number(cnpj[i]) * weight;
    weight = weight === 2 ? 9 : weight - 1;
  }
  digit = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  return digit === Number(cnpj[13]);
}

export async function POST() {
  try {
    const actor = await requireRole(["ADMIN", "GERENTE"]);
    const config = await db.fiscalConfig.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    const checkedAt = new Date();
    const blocking: string[] = [];
    const warnings: string[] = [];

    if (!config) {
      blocking.push("Configuração fiscal não cadastrada.");
    } else {
      if (!config.active) blocking.push("Configuração fiscal está inativa.");
      if (config.environment !== "HOMOLOGACAO") {
        blocking.push(
          "A etapa 7.6 aceita somente o ambiente HOMOLOGACAO."
        );
      }
      if (!config.legalName) blocking.push("Razão social não informada.");
      if (!config.cnpj) blocking.push("CNPJ não informado.");
      else if (!isValidCnpj(config.cnpj)) {
        blocking.push("CNPJ informado é inválido.");
      }
      if (!config.stateRegistration) {
        blocking.push("Inscrição estadual não informada.");
      }
      if (!config.uf || config.uf.toUpperCase() !== "SC") {
        blocking.push(
          "A integração inicial 7.6 foi preparada para o emissor de SC."
        );
      }
      if (!config.city) blocking.push("Município do emitente não informado.");
      if (!config.series) blocking.push("Série fiscal não informada.");
      if (!config.secretReference) {
        blocking.push("Referência do certificado/segredo não cadastrada.");
      }
      if (!config.certificateType) {
        blocking.push("Tipo do certificado não cadastrado.");
      }
      if (!config.certificateExpiresAt) {
        blocking.push("Validade do certificado não cadastrada.");
      } else {
        const days = Math.ceil(
          (config.certificateExpiresAt.getTime() - checkedAt.getTime()) /
            86400000
        );
        if (days < 0) blocking.push("Certificado cadastrado como expirado.");
        else if (days <= 30) {
          warnings.push("Certificado vence em até 30 dias.");
        }
      }

      if (config.integrationMode !== "PAF_NFCE") {
        warnings.push(
          "O modo de integração atual não é PAF_NFCE; confirme o modelo fiscal antes de avançar para a transmissão NFC-e."
        );
      }
    }

    const ready = blocking.length === 0;

    await db.auditLog.create({
      data: {
        action: "FISCAL_HOMOLOGATION_PREFLIGHT",
        entity: "FiscalConfig",
        entityId: config?.id,
        userId: actor.id,
        metadata: {
          ready,
          blockingCount: blocking.length,
          warningCount: warnings.length,
          environment: config?.environment ?? null,
          integrationMode: config?.integrationMode ?? null,
          endpoint: SVRS_NFCE_HOMOLOGATION,
        },
      },
    });

    return NextResponse.json({
      ready,
      status: ready
        ? warnings.length
          ? "ATENCAO"
          : "APTO"
        : "BLOQUEADO",
      checkedAt: checkedAt.toISOString(),
      blocking,
      warnings,
      transport: {
        provider: "SVRS",
        state: "SC",
        document: "NFC_E",
        environment: "HOMOLOGACAO",
        authorizationUrl: SVRS_NFCE_HOMOLOGATION,
        qrCodeBaseUrl: QR_CODE_HOMOLOGATION,
      },
      nextStep: ready
        ? "Pré-requisitos de homologação conferidos. A próxima etapa é carregar o certificado de forma segura e executar a comunicação SOAP/XML."
        : "Corrija as pendências antes de executar a comunicação fiscal.",
    });
  } catch (error) {
    return apiError(
      error,
      "Não foi possível executar o pré-voo da integração fiscal."
    );
  }
}
