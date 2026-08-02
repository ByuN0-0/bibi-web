import {createHmac} from "node:crypto";
import {NextRequest, NextResponse} from "next/server";
import {hasSameOrigin, safeEqual} from "@/lib/auth-server";
import {clearLoginAttempt, ensureLoginCollection, getLoginAttempt, saveLoginAttempt} from "@/lib/lol/repository";
import {getServerEnv} from "@/lib/server-env";
import {createSession, SESSION_COOKIE, SESSION_TTL_SECONDS} from "@/lib/session";
import {isLoginLocked, recordLoginFailure} from "@/lib/login-rate-limit";

export async function POST(request: NextRequest) {
  try {
    return await handleLogin(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown login error";
    const configurationError = message.startsWith("Missing required environment variable")
      || message.startsWith("ADMIN_PASSWORD")
      || message.startsWith("SESSION_SECRET")
      || message.startsWith("SODA_BASE_URL")
      || message.startsWith("SODA_TIMEOUT_SECONDS");
    console.error(`[lol-login] ${configurationError ? "configuration" : "storage"} error: ${message}`);
    return NextResponse.json({
      error: configurationError
        ? "서버 환경변수 설정을 확인해 주세요."
        : "로그인 저장소에 연결할 수 없습니다.",
      code: configurationError ? "CONFIGURATION_ERROR" : "SODA_UNAVAILABLE",
    }, {status: 503});
  }
}

async function handleLogin(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({error: "허용되지 않은 요청 출처입니다."}, {status: 403});
  }
  const env = getServerEnv();
  await ensureLoginCollection();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  const ipHash = createHmac("sha256", env.sessionSecret).update(ip).digest("hex");
  const now = Date.now();
  const document = await getLoginAttempt(ipHash);
  if (isLoginLocked(document?.value, now)) {
    return NextResponse.json({error: "로그인 시도가 잠겼습니다. 15분 후 다시 시도해 주세요."}, {status: 429});
  }
  let body: {username?: string; password?: string};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({error: "잘못된 요청입니다."}, {status: 400});
  }
  const valid = safeEqual(body.username ?? "", env.adminUsername)
    && safeEqual(body.password ?? "", env.adminPassword);
  if (!valid) {
    const attempt = recordLoginFailure(document?.value, ipHash, now);
    await saveLoginAttempt(attempt);
    return NextResponse.json(
      {error: attempt.lockedUntil ? "로그인 시도가 잠겼습니다. 15분 후 다시 시도해 주세요." : "아이디 또는 비밀번호가 올바르지 않습니다."},
      {status: attempt.lockedUntil ? 429 : 401},
    );
  }
  await clearLoginAttempt(document);
  const response = NextResponse.json({ok: true});
  response.cookies.set(SESSION_COOKIE, await createSession(env.adminUsername, env.sessionSecret), {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}
