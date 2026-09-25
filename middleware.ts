import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE = "mb_optica_session";
const pageAccess: Record<string,string[]> = {
  "/clientes": ["ADMIN","GERENTE","VENDEDOR","FINANCEIRO"],
  "/receitas": ["ADMIN","GERENTE","VENDEDOR"],
  "/orcamentos": ["ADMIN","GERENTE","VENDEDOR"],
  "/pedidos": ["ADMIN","GERENTE","VENDEDOR","LABORATORIO"],
  "/laboratorio": ["ADMIN","GERENTE","LABORATORIO"],
  "/produtos": ["ADMIN","GERENTE","VENDEDOR","LABORATORIO"],
  "/estoque": ["ADMIN","GERENTE","LABORATORIO"],
  "/fornecedores": ["ADMIN","GERENTE","FINANCEIRO"],
  "/vendas": ["ADMIN","GERENTE","VENDEDOR"],
  "/financeiro": ["ADMIN","GERENTE","FINANCEIRO"],
  "/relatorios": ["ADMIN","GERENTE","FINANCEIRO","VENDEDOR","LABORATORIO"],
  "/configuracoes": ["ADMIN","GERENTE"],
  "/migracao": ["ADMIN"],
};

function key() {
  const secret = process.env.AUTH_SECRET;
  return secret ? new TextEncoder().encode(secret) : null;
}

function allowed(path:string, role:string) {
  const match=Object.keys(pageAccess).find(prefix=>path===prefix || path.startsWith(prefix+"/"));
  return !match || pageAccess[match].includes(role);
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-mb-pathname", path);
  const next = () => NextResponse.next({ request: { headers: requestHeaders } });

  const publicPath =
    path === "/login" || path === "/setup" || path === "/acesso-negado" ||
    path === "/api/health" || path.startsWith("/api/auth/") ||
    path.startsWith("/_next/") || path === "/favicon.ico";

  if (publicPath) return next();

  const token = request.cookies.get(COOKIE)?.value;
  if (!token) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const secret = key();
  if (!secret) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Autenticação não configurada." }, { status: 503 });
    return NextResponse.redirect(new URL("/login?error=config", request.url));
  }

  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    const role=typeof payload.role==="string"?payload.role:"";
    if (!path.startsWith("/api/") && !allowed(path,role)) return NextResponse.redirect(new URL("/acesso-negado", request.url));
    requestHeaders.set("x-mb-role", role);
    return next();
  } catch {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete(COOKIE);
    return response;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|svg|ico)$).*)"],
};