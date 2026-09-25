import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE = "mb_optica_session";
const PUBLIC_PAGES = new Set(["/login", "/setup", "/acesso-negado"]);
const PUBLIC_API = new Set(["/api/auth/login", "/api/auth/logout", "/api/auth/bootstrap", "/api/health"]);

const ROLE_PREFIXES: Record<string, string[]> = {
  ADMIN: ["*"],
  GERENTE: ["/", "/agenda", "/clientes", "/receitas", "/orcamentos", "/pedidos", "/laboratorio", "/produtos", "/estoque", "/fornecedores", "/vendas", "/financeiro", "/relatorios", "/configuracoes"],
  VENDEDOR: ["/", "/agenda", "/clientes", "/receitas", "/orcamentos", "/pedidos", "/vendas", "/produtos"],
  FINANCEIRO: ["/", "/vendas", "/financeiro", "/relatorios"],
  LABORATORIO: ["/", "/pedidos", "/laboratorio", "/produtos"],
};

const API_ROLE_PREFIXES: Record<string, string[]> = {
  ADMIN: ["*"],
  GERENTE: ["/api/auth/me", "/api/audit", "/api/settings", "/api/users", "/api/dashboard", "/api/customers", "/api/prescriptions", "/api/products", "/api/categories", "/api/suppliers", "/api/orders", "/api/payment-methods", "/api/payments", "/api/finance", "/api/cash", "/api/stock", "/api/sales"],
  VENDEDOR: ["/api/auth/me", "/api/dashboard", "/api/customers", "/api/prescriptions", "/api/products", "/api/categories", "/api/orders", "/api/payment-methods", "/api/payments", "/api/sales"],
  FINANCEIRO: ["/api/auth/me", "/api/dashboard", "/api/payment-methods", "/api/payments", "/api/finance", "/api/cash"],
  LABORATORIO: ["/api/auth/me", "/api/dashboard", "/api/products", "/api/categories", "/api/orders", "/api/stock"],
};

const WRITE_ROLES: Array<[string, string[]]> = [
  ["/api/users", ["ADMIN"]],
  ["/api/settings", ["ADMIN", "GERENTE"]],
  ["/api/audit", ["ADMIN", "GERENTE"]],
  ["/api/products", ["ADMIN", "GERENTE"]],
  ["/api/categories", ["ADMIN", "GERENTE"]],
  ["/api/suppliers", ["ADMIN", "GERENTE", "FINANCEIRO"]],
  ["/api/customers", ["ADMIN", "GERENTE", "VENDEDOR"]],
  ["/api/prescriptions", ["ADMIN", "GERENTE", "VENDEDOR"]],
  ["/api/orders", ["ADMIN", "GERENTE", "VENDEDOR"]],
  ["/api/sales", ["ADMIN", "GERENTE", "VENDEDOR"]],
  ["/api/payment-methods", ["ADMIN", "GERENTE", "FINANCEIRO"]],
  ["/api/payments", ["ADMIN", "GERENTE", "FINANCEIRO"]],
  ["/api/finance", ["ADMIN", "GERENTE", "FINANCEIRO"]],
  ["/api/cash", ["ADMIN", "GERENTE", "FINANCEIRO"]],
  ["/api/stock", ["ADMIN", "GERENTE", "LABORATORIO"]],
];

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) return null;
  return new TextEncoder().encode(secret);
}

function pathAllowed(role: string, pathname: string) {
  const prefixes = ROLE_PREFIXES[role] ?? [];
  return prefixes.some((prefix) => prefix === "*" || prefix === "/" ? prefix === "*" || pathname === "/" : pathname === prefix || pathname.startsWith(prefix + "/"));
}

function apiPathAllowed(role: string, pathname: string) {
  const prefixes = API_ROLE_PREFIXES[role] ?? [];
  return prefixes.some((prefix) => prefix === "*" || pathname === prefix || pathname.startsWith(prefix + "/"));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-mb-pathname", pathname);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("X-DNS-Prefetch-Control", "off");

  if (PUBLIC_PAGES.has(pathname) || PUBLIC_API.has(pathname)) return response;

  const token = request.cookies.get(COOKIE)?.value;
  const key = secretKey();

  if (!token || !key) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401, headers: response.headers });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const verified = await jwtVerify(token, key, { algorithms: ["HS256"] });
    const role = typeof verified.payload.role === "string" ? verified.payload.role : "";

    if (pathname.startsWith("/api/")) {
      if (!apiPathAllowed(role, pathname)) {
        return NextResponse.json({ error: "Acesso não autorizado para este perfil." }, { status: 403, headers: response.headers });
      }

      const writeMethods = new Set(["POST", "PATCH", "PUT", "DELETE"]);
      if (writeMethods.has(request.method)) {
        const rule = WRITE_ROLES.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix + "/"));
        if (rule && !rule[1].includes(role)) {
          return NextResponse.json({ error: "Acesso não autorizado para este perfil." }, { status: 403, headers: response.headers });
        }
      }
      return response;
    }

    if (!pathAllowed(role, pathname)) {
      return NextResponse.redirect(new URL("/acesso-negado", request.url));
    }

    return response;
  } catch {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sessão inválida." }, { status: 401, headers: response.headers });
    }
    const login = NextResponse.redirect(new URL("/login", request.url));
    login.cookies.delete(COOKIE);
    return login;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
