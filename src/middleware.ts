import {NextRequest, NextResponse} from "next/server";
import {SESSION_COOKIE, verifySession} from "@/lib/session";

export async function middleware(request: NextRequest) {
  const {pathname} = request.nextUrl;
  const loginPage = pathname === "/lol-statics/login";
  const loginApi = pathname === "/api/lol-statics/auth/login";
  if (loginPage || loginApi) return NextResponse.next();

  const secret = process.env.SESSION_SECRET;
  const expected = process.env.ADMIN_USERNAME;
  const session = secret
    ? await verifySession(request.cookies.get(SESSION_COOKIE)?.value, secret)
    : null;
  if (session && expected && session.username === expected) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({error: "인증이 필요합니다."}, {status: 401});
  }
  const login = new URL("/lol-statics/login", request.url);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/lol-statics/:path*", "/api/lol-statics/:path*"],
};
