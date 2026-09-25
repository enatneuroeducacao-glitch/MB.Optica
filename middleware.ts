import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE = "mb_optica_session";

function key() {
  const secret = process.env.AUTH_SECRET;
  return secret ? new TextEncoder().encode(secret) : null;
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const publicPath =
    path === "/login" ||
    path === "/setup" ||
    path === "/api/health" ||
    path.startsWith("/api/auth/") ||
    path.startsWith("/_next/") ||
    path === "/favicon.ico";

  if (publicPath) return NextResponse.next();

  const token = request.cookies.get(COOKIE)?.value;
  if (!token) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const secret = key();
  if (!secret) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "Autenticação não configurada." }, { status: 503 });
    }
    return NextResponse.redirect(new URL("/login?error=config", request.url));
  }

  try {
    await jwtVerify(token, secret, { algorithms: ["HS256"] });
    return NextResponse.next();
  } catch {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
    }
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete(COOKIE);
    return response;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|svg|ico)$).*)"],
};
