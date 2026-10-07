export const PAGE_PERMISSIONS: Record<string, string> = {
  "/agenda": "agenda",
  "/mensagens": "mensagens",
  "/clientes": "clientes",
  "/receitas": "receitas",
  "/orcamentos": "orcamentos",
  "/pedidos": "pedidos",
  "/laboratorio": "laboratorio",
  "/produtos": "produtos",
  "/estoque": "estoque",
  "/fornecedores": "fornecedores",
  "/vendas": "vendas",
  "/financeiro": "financeiro",
  "/relatorios": "relatorios",
  "/configuracoes": "configuracoes",
  "/migracao": "migracao",
};

export const PERMISSION_GROUPS = [
  ["dashboard"],
  ["mensagens"],
  ["agenda"],
  ["clientes"],
  ["receitas"],
  ["orcamentos"],
  ["pedidos"],
  ["laboratorio"],
  ["produtos"],
  ["estoque"],
  ["fornecedores"],
  ["vendas"],
  ["financeiro"],
  ["relatorios"],
  ["configuracoes"],
  ["usuarios"],
  ["auditoria"],
  ["migracao"],
].flat();

export const ROLE_DEFAULT_PERMISSIONS: Record<string, string[]> = {
  ADMIN: [...PERMISSION_GROUPS],
  GERENTE: [
    "dashboard", "mensagens", "agenda", "clientes", "receitas", "orcamentos", "pedidos",
    "laboratorio", "produtos", "estoque", "fornecedores", "vendas",
    "financeiro", "relatorios", "configuracoes", "usuarios", "auditoria",
  ],
  VENDEDOR: ["dashboard", "mensagens", "agenda", "clientes", "receitas", "orcamentos", "pedidos", "vendas", "produtos"],
  FINANCEIRO: ["dashboard", "mensagens", "vendas", "financeiro", "relatorios"],
  LABORATORIO: ["dashboard", "mensagens", "pedidos", "laboratorio", "produtos", "estoque"],
};

export const API_PERMISSIONS: Record<string, string> = {
  "/api/appointments": "agenda",
  "/api/messages": "mensagens",
  "/api/audit": "auditoria",
  "/api/categories": "produtos",
  "/api/customers": "clientes",
  "/api/dashboard": "dashboard",
  "/api/finance/accounts": "financeiro",
  "/api/financeiro": "financeiro",
  "/api/cash": "financeiro",
  "/api/orders": "pedidos",
  "/api/payment-methods": "vendas",
  "/api/card-machines": "vendas",
  "/api/payments": "vendas",
  "/api/pix-keys": "vendas",
  "/api/prescriptions": "receitas",
  "/api/products": "produtos",
  "/api/site": "produtos",
  "/api/quotes": "orcamentos",
  "/api/relatorios": "relatorios",
  "/api/sales": "vendas",
  "/api/service-orders": "pedidos",
  "/api/stock": "estoque",
  "/api/suppliers": "fornecedores",
  "/api/users": "usuarios",
  "/api/settings": "configuracoes",
  "/api/fiscal/configuracao": "configuracoes",
  "/api/fiscal/certificado/verificar": "configuracoes",
  "/api/fiscal/produtos/diagnostico": "produtos",
  "/api/fiscal/validacao/venda": "vendas",
  "/api/fiscal/homologacao": "configuracoes",
  "/api/migration": "migracao",
  "/api/gestao/indicadores": "relatorios",
  "/api/assinatura": "configuracoes",
};

export const API_PUBLIC_AUTHENTICATED = new Set([
  "/api/health",
  "/api/auth/me",
  "/api/auth/change-password",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/branding",
  "/api/version",
  "/api/entitlements",
]);

export const ROLE_API_PREFIXES: Record<string, string[]> = {
  ADMIN: ["*"],
  GERENTE: [
    "/api/auth/me", "/api/messages", "/api/dashboard", "/api/appointments", "/api/customers",
    "/api/prescriptions", "/api/products", "/api/categories", "/api/suppliers", "/api/site",
    "/api/orders", "/api/payment-methods", "/api/card-machines", "/api/payments", "/api/pix-keys",
    "/api/finance", "/api/financeiro", "/api/cash", "/api/stock", "/api/sales",
    "/api/quotes", "/api/relatorios", "/api/gestao/indicadores", "/api/audit", "/api/users", "/api/settings",
    "/api/service-orders", "/api/migration", "/api/fiscal/configuracao", "/api/fiscal/certificado/verificar",
    "/api/fiscal/produtos/diagnostico", "/api/fiscal/validacao/venda", "/api/fiscal/homologacao",
  ],
  VENDEDOR: [
    "/api/auth/me", "/api/messages", "/api/dashboard", "/api/appointments", "/api/customers",
    "/api/prescriptions", "/api/products", "/api/categories", "/api/orders",
    "/api/payment-methods", "/api/payments", "/api/pix-keys", "/api/sales",
    "/api/quotes",
  ],
  FINANCEIRO: [
    "/api/auth/me", "/api/messages", "/api/dashboard", "/api/payment-methods", "/api/payments",
    "/api/pix-keys", "/api/finance", "/api/financeiro", "/api/cash", "/api/sales",
    "/api/gestao/indicadores",
  ],
  LABORATORIO: [
    "/api/auth/me", "/api/messages", "/api/dashboard", "/api/customers", "/api/prescriptions",
    "/api/products", "/api/categories", "/api/orders", "/api/stock",
  ],
};

export const WRITE_ROLES: Array<[string, string[]]> = [
  ["/api/users", ["ADMIN"]],
  ["/api/settings", ["ADMIN", "GERENTE"]],
  ["/api/fiscal/configuracao", ["ADMIN", "GERENTE"]],
  ["/api/audit", ["ADMIN", "GERENTE"]],
  ["/api/products", ["ADMIN", "GERENTE"]],
  ["/api/site", ["ADMIN", "GERENTE"]],
  ["/api/categories", ["ADMIN", "GERENTE"]],
  ["/api/suppliers", ["ADMIN", "GERENTE", "FINANCEIRO"]],
  ["/api/customers", ["ADMIN", "GERENTE", "VENDEDOR"]],
  ["/api/prescriptions", ["ADMIN", "GERENTE", "VENDEDOR"]],
  ["/api/orders", ["ADMIN", "GERENTE", "VENDEDOR"]],
  ["/api/appointments", ["ADMIN", "GERENTE", "VENDEDOR"]],
  ["/api/quotes", ["ADMIN", "GERENTE", "VENDEDOR"]],
  ["/api/sales", ["ADMIN", "GERENTE", "VENDEDOR"]],
  ["/api/payment-methods", ["ADMIN", "GERENTE", "FINANCEIRO"]],
  ["/api/card-machines", ["ADMIN", "GERENTE"]],
  ["/api/payments", ["ADMIN", "GERENTE", "FINANCEIRO", "VENDEDOR"]],
  ["/api/pix-keys", ["ADMIN", "GERENTE", "FINANCEIRO", "VENDEDOR"]],
  ["/api/finance", ["ADMIN", "GERENTE", "FINANCEIRO"]],
  ["/api/financeiro", ["ADMIN", "GERENTE", "FINANCEIRO"]],
  ["/api/cash", ["ADMIN", "GERENTE", "FINANCEIRO"]],
  ["/api/stock", ["ADMIN", "GERENTE", "LABORATORIO"]],
  ["/api/migration", ["ADMIN"]],
  ["/api/fiscal/homologacao", ["ADMIN", "GERENTE"]],
  ["/api/assinatura", ["ADMIN"]],
];

export function effectivePermissions(role: string, explicit: unknown) {
  if (role === "ADMIN") return Object.fromEntries(PERMISSION_GROUPS.map((key) => [key, true]));
  const base = new Set(ROLE_DEFAULT_PERMISSIONS[role] ?? []);
  if (explicit && typeof explicit === "object" && !Array.isArray(explicit)) {
    for (const [key, value] of Object.entries(explicit as Record<string, unknown>)) {
      if (typeof value === "boolean") {
        if (value) base.add(key);
        else base.delete(key);
      }
    }
  }
  return Object.fromEntries(PERMISSION_GROUPS.map((key) => [key, base.has(key)]));
}

export function hasPermission(role: string, explicit: unknown, key: string) {
  return effectivePermissions(role, explicit)[key] !== false;
}

export function pathMatches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}
