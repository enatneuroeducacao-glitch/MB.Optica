import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { API_PERMISSIONS, API_PUBLIC_AUTHENTICATED, PAGE_PERMISSIONS, ROLE_API_PREFIXES, ROLE_DEFAULT_PERMISSIONS, WRITE_ROLES, pathMatches } from "@/lib/permissions";

const COOKIE = "mb_optica_session";
const PUBLIC_PAGES = new Set(["/login", "/setup", "/acesso-negado"]);
const PUBLIC_API = new Set(["/api/auth/login", "/api/auth/logout", "/api/auth/bootstrap", "/api/health", "/api/branding"]);

const ROLE_PREFIXES: Record<string, string[]> = {
  ADMIN: ["*"],
  GERENTE: ["/", "/agenda", "/clientes", "/receitas", "/orcamentos", "/pedidos", "/laboratorio", "/produtos", "/estoque", "/fornecedores", "/vendas", "/financeiro", "/relatorios", "/configuracoes", "/migracao"],
  VENDEDOR: ["/", "/agenda", "/clientes", "/receitas", "/orcamentos", "/pedidos", "/vendas", "/produtos"],
  FINANCEIRO: ["/", "/vendas", "/financeiro", "/relatorios"],
  LABORATORIO: ["/", "/pedidos", "/laboratorio", "/produtos"],
};

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
  const prefixes = ROLE_API_PREFIXES[role] ?? [];
  return prefixes.some((prefix) => prefix === "*" || pathMatches(pathname, prefix));
}

function permissionForApi(pathname: string) {
  const match = Object.entries(API_PERMISSIONS)
    .filter(([prefix]) => pathMatches(pathname, prefix))
    .sort((a, b) => b[0].length - a[0].length)[0];
  return match?.[1] ?? null;
}

function effectivePermissionFromToken(role: string, permissions: unknown, key: string) {
  if (role === "ADMIN") return true;
  if (permissions && typeof permissions === "object" && !Array.isArray(permissions)) {
    const value = (permissions as Record<string, unknown>)[key];
    if (typeof value === "boolean") return value;
  }
  return ROLE_DEFAULT_PERMISSIONS[role]?.includes(key) ?? false;
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
      if (API_PUBLIC_AUTHENTICATED.has(pathname)) return response;
      if (pathname === "/api/settings" && request.method === "GET") return response;

      if (!apiPathAllowed(role, pathname)) {
        return NextResponse.json({ error: "Acesso não autorizado para este perfil." }, { status: 403, headers: response.headers });
      }

      const permission = permissionForApi(pathname);
      if (permission && !effectivePermissionFromToken(role, verified.payload.permissions, permission)) {
        return NextResponse.json({ error: "Acesso bloqueado pela permissão individual deste usuário." }, { status: 403, headers: response.headers });
      }

      const writeMethods = new Set(["POST", "PATCH", "PUT", "DELETE"]);
      if (writeMethods.has(request.method)) {
        const rule = WRITE_ROLES.find(([prefix]) => pathMatches(pathname, prefix));
        if (rule && !rule[1].includes(role)) {
          return NextResponse.json({ error: "Acesso não autorizado para este perfil." }, { status: 403, headers: response.headers });
        }
      }
      return response;
    }

    const pagePermission = Object.entries(PAGE_PERMISSIONS).find(([prefix]) => pathMatches(pathname, prefix))?.[1];
    if (pagePermission && !effectivePermissionFromToken(role, verified.payload.permissions, pagePermission)) return NextResponse.redirect(new URL("/acesso-negado", request.url));
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
