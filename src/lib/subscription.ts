import "server-only";
import { headers } from "next/headers";
import { db } from "@/lib/db";

export const SUBSCRIPTION_MODULES = [
  "Dashboard","Agenda","Clientes","Atendimento","Mensagens",
  "Produtos e estoque","Fornecedores","Vendas","Financeiro","Relatórios",
  "Configurações","Migração","Receitas","Orçamentos","Pedidos","Laboratório",
] as const;

export type SubscriptionModule = typeof SUBSCRIPTION_MODULES[number];

const PLAN_MODULES: Record<string, SubscriptionModule[]> = {
  BASICO: [
    "Dashboard","Agenda","Clientes","Atendimento","Produtos e estoque","Vendas",
    "Receitas","Orçamentos","Pedidos",
  ],
  PROFISSIONAL: [
    "Dashboard","Agenda","Clientes","Atendimento","Mensagens","Produtos e estoque",
    "Fornecedores","Vendas","Financeiro","Relatórios","Configurações","Receitas",
    "Orçamentos","Pedidos","Laboratório",
  ],
  PREMIUM: [...SUBSCRIPTION_MODULES],
  ENTERPRISE: [...SUBSCRIPTION_MODULES],
  PROPRIETARIO: [...SUBSCRIPTION_MODULES],
};

const TRIAL_MODULES: SubscriptionModule[] = [
  "Dashboard","Agenda","Clientes","Atendimento","Produtos e estoque","Vendas",
  "Receitas","Orçamentos","Pedidos",
];

const ROUTE_MODULES: Array<[string, SubscriptionModule]> = [
  ["/agenda","Agenda"],
  ["/clientes","Clientes"],
  ["/atendimento","Atendimento"],
  ["/mensagens","Mensagens"],
  ["/produtos","Produtos e estoque"],
  ["/estoque","Produtos e estoque"],
  ["/fornecedores","Fornecedores"],
  ["/vendas","Vendas"],
  ["/financeiro","Financeiro"],
  ["/relatorios","Relatórios"],
  ["/configuracoes","Configurações"],
  ["/migracao","Migração"],
  ["/receitas","Receitas"],
  ["/orcamentos","Orçamentos"],
  ["/pedidos","Pedidos"],
  ["/laboratorio","Laboratório"],
];

export function isOwnerInstance() {
  return process.env.MB_OPTICA_OWNER_INSTANCE === "true";
}

function matches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

const API_ROUTE_MODULES: Array<[string, SubscriptionModule]> = [
  ["/api/agenda", "Agenda"], ["/api/appointments", "Agenda"],
  ["/api/customers", "Clientes"], ["/api/prescriptions", "Receitas"],
  ["/api/messages", "Mensagens"], ["/api/products", "Produtos e estoque"],
  ["/api/categories", "Produtos e estoque"], ["/api/stock", "Produtos e estoque"],
  ["/api/suppliers", "Fornecedores"], ["/api/sales", "Vendas"],
  ["/api/payments", "Vendas"], ["/api/payment-methods", "Vendas"],
  ["/api/pix-keys", "Vendas"], ["/api/card-machines", "Vendas"],
  ["/api/finance", "Financeiro"], ["/api/financeiro", "Financeiro"],
  ["/api/cash", "Financeiro"], ["/api/contabilidade", "Financeiro"],
  ["/api/relatorios", "Relatórios"], ["/api/reports", "Relatórios"],
  ["/api/settings", "Configurações"], ["/api/fiscal", "Configurações"],
  ["/api/migration", "Migração"], ["/api/orders", "Pedidos"],
  ["/api/quotes", "Orçamentos"], ["/api/frame-adaptation-orders", "Pedidos"],
  ["/api/third-party-frames", "Produtos e estoque"], ["/api/service-orders", "Pedidos"],
  ["/api/dashboard", "Dashboard"], ["/api/gestao", "Relatórios"],
];

export function moduleForPath(pathname: string) {
  return API_ROUTE_MODULES.find(([prefix]) => matches(pathname, prefix))?.[1]
    ?? ROUTE_MODULES.find(([prefix]) => matches(pathname, prefix))?.[1]
    ?? null;
}

function modulesFor(subscription: {plan:string; status:string; modules:unknown} | null): SubscriptionModule[] {
  if (!subscription) return TRIAL_MODULES;
  if (subscription.status === "AVALIACAO") return TRIAL_MODULES;
  if (subscription.status === "CANCELADA" || subscription.status === "EXPIRADA" || subscription.status === "SUSPENSA") return [];
  const configured = Array.isArray(subscription.modules)
    ? subscription.modules.filter((value): value is SubscriptionModule => typeof value === "string" && SUBSCRIPTION_MODULES.includes(value as SubscriptionModule))
    : [];
  const plan = PLAN_MODULES[subscription.plan] ?? TRIAL_MODULES;
  // Plan defines the ceiling. Custom modules can only reduce access, never expand it.
  return plan.filter((module) => configured.length === 0 || configured.includes(module));
}

function trialExpired(trialEndsAt: Date | null | undefined) {
  return Boolean(trialEndsAt && trialEndsAt.getTime() <= Date.now());
}

export async function getSubscriptionEntitlement() {
  if (isOwnerInstance()) {
    return {
      owner: true,
      plan: "PROPRIETARIO",
      status: "ATIVA",
      trial: false,
      modules: [...SUBSCRIPTION_MODULES],
      maxUsers: null,
      activeUsers: null,
      maxUnits: null,
      maxClients: null,
      maxProducts: null,
      maxSales: null,
      maxOrders: null,
      trialEndsAt: null,
      currentPeriodEnd: null,
      licenseType: "PROPRIETARY",
    };
  }

  const subscription = await db.subscription.findFirst({ orderBy: { createdAt: "asc" } });
  const expiredTrial = trialExpired(subscription?.trialEndsAt);
  const modules = expiredTrial ? [] : modulesFor(subscription);
  const activeUsers = await db.user.count({ where: { active: true } });
  const maxUsers = subscription?.maxUsers ?? 1;
  const status = expiredTrial ? "EXPIRADA" : (subscription?.status ?? "AVALIACAO");
  const trial = status === "AVALIACAO";

  return {
    owner: false,
    plan: subscription?.plan ?? "BASICO",
    status,
    trial,
    modules,
    maxUsers,
    activeUsers,
    trialEndsAt: subscription?.trialEndsAt ?? null,
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
    maxUnits: subscription?.maxUnits ?? 1,
    maxClients: subscription?.maxClients ?? 100,
    maxProducts: subscription?.maxProducts ?? 100,
    maxSales: subscription?.maxSales ?? 20,
    maxOrders: subscription?.maxOrders ?? 20,
    licenseType: subscription?.licenseType ?? "SUBSCRIPTION",
  };
}

export async function enforceSubscriptionAccess() {
  if (isOwnerInstance()) return;

  const pathname = (await headers()).get("x-mb-pathname");
  if (!pathname || pathname === "/assinatura" || pathname === "/acesso-negado") return;

  const module = moduleForPath(pathname);
  if (!module) return;

  const entitlement = await getSubscriptionEntitlement();
  if (entitlement.activeUsers !== null && entitlement.activeUsers > entitlement.maxUsers) {
    throw new Error("SUBSCRIPTION_USER_LIMIT");
  }
  if (!entitlement.modules.includes(module)) {
    throw new Error("SUBSCRIPTION_MODULE_LOCKED");
  }
}

/**
 * Organization-scoped entitlement for routes migrated to TenantContext.
 * The organizationId argument must come from requireTenantContext(), never
 * directly from request JSON/query parameters.
 */
export async function getTenantSubscriptionEntitlement(organizationId: string) {
  if (!organizationId) throw new Error("TENANT_MEMBERSHIP_REQUIRED");

  const subscription = await db.subscription.findUnique({
    where: { organizationId },
  });
  const expiredTrial = trialExpired(subscription?.trialEndsAt);
  const modules = expiredTrial ? [] : modulesFor(subscription);
  const activeUsers = await db.organizationMembership.count({
    where: {
      organizationId,
      active: true,
      organization: { status: "ACTIVE" },
      user: { active: true },
    },
  });
  const maxUsers = subscription?.maxUsers ?? 1;
  const status = expiredTrial ? "EXPIRADA" : (subscription?.status ?? "AVALIACAO");
  const trial = status === "AVALIACAO";

  return {
    owner: false,
    plan: subscription?.plan ?? "BASICO",
    status,
    trial,
    modules,
    maxUsers,
    activeUsers,
    trialEndsAt: subscription?.trialEndsAt ?? null,
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
    maxUnits: subscription?.maxUnits ?? 1,
    maxClients: subscription?.maxClients ?? 100,
    maxProducts: subscription?.maxProducts ?? 100,
    maxSales: subscription?.maxSales ?? 20,
    maxOrders: subscription?.maxOrders ?? 20,
    licenseType: subscription?.licenseType ?? "SUBSCRIPTION",
  };
}

/**
 * Tenant-specific counterpart to enforceSubscriptionAccess(). Call only with
 * organizationId obtained from a validated TenantContext.
 */
export async function enforceTenantSubscriptionAccess(organizationId: string) {
  const pathname = (await headers()).get("x-mb-pathname");
  if (!pathname || pathname === "/assinatura" || pathname === "/acesso-negado") return;

  const module = moduleForPath(pathname);
  if (!module) return;

  const entitlement = await getTenantSubscriptionEntitlement(organizationId);
  if (entitlement.activeUsers !== null && entitlement.activeUsers > entitlement.maxUsers) {
    throw new Error("SUBSCRIPTION_USER_LIMIT");
  }
  if (!entitlement.modules.includes(module)) {
    throw new Error("SUBSCRIPTION_MODULE_LOCKED");
  }
}
