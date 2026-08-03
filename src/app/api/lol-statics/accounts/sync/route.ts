import {NextRequest, NextResponse} from "next/server";
import {hasApiSession, hasSameOrigin} from "@/lib/auth-server";
import {
  AccountSyncError,
  getAccountSyncDashboard,
  syncRiotAccountFromWeb,
} from "@/lib/lol/account-sync-service";
import {RiotApiError} from "@/lib/lol/riot-client";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!await hasApiSession(request)) return response("인증이 필요합니다.", 401);
  return NextResponse.json(await getAccountSyncDashboard());
}

export async function POST(request: NextRequest) {
  if (!await hasApiSession(request)) return response("인증이 필요합니다.", 401);
  if (!hasSameOrigin(request)) return response("허용되지 않은 요청 출처입니다.", 403);
  let accountId = "";
  try {
    const body = await request.json() as {accountId?: unknown};
    accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
  } catch {
    return response("잘못된 요청입니다.", 400);
  }
  if (!accountId || accountId.length > 100) return response("갱신할 Riot 계정을 선택해 주세요.", 400);

  try {
    await syncRiotAccountFromWeb(accountId);
    return NextResponse.json({synced: true});
  } catch (error) {
    if (error instanceof AccountSyncError) {
      return NextResponse.json({error: error.message, retryAt: error.retryAt}, {status: error.status});
    }
    if (error instanceof RiotApiError) {
      const message = error.status === 404
        ? "Riot 계정을 찾을 수 없습니다. Riot ID를 확인해 주세요."
        : error.status === 429
          ? "Riot API 요청이 많습니다. 잠시 후 다시 시도해 주세요."
          : error.status === 401 || error.status === 403
            ? "Riot API 키를 확인해 주세요."
            : "Riot API에서 전적을 가져오지 못했습니다.";
      return response(message, error.status === 429 ? 429 : 502);
    }
    const configurationError = error instanceof Error
      && error.message.startsWith("Missing required environment variable");
    console.error("[lol-account-sync] sync failed", error);
    return response(
      configurationError
        ? "웹 서버의 Riot API 설정을 확인해 주세요."
        : "Riot 계정 전적을 갱신하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      configurationError ? 503 : 502,
    );
  }
}

const response = (error: string, status: number) => NextResponse.json({error}, {status});
