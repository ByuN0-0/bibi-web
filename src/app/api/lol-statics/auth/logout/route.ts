import {NextRequest, NextResponse} from "next/server";
import {hasApiSession, hasSameOrigin} from "@/lib/auth-server";
import {SESSION_COOKIE} from "@/lib/session";

export async function POST(request: NextRequest) {
  if (!await hasApiSession(request)) {
    return NextResponse.json({error: "인증이 필요합니다."}, {status: 401});
  }
  if (!hasSameOrigin(request)) {
    return NextResponse.json({error: "허용되지 않은 요청 출처입니다."}, {status: 403});
  }
  const response = NextResponse.json({ok: true});
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 0,
  });
  return response;
}
