import {NextRequest, NextResponse} from "next/server";
import {hasApiSession, hasSameOrigin} from "@/lib/auth-server";
import {RiotApiError} from "@/lib/lol/riot-client";
import {syncPlayerFromWeb, WebSyncError} from "@/lib/lol/web-sync-service";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (!await hasApiSession(request)) return NextResponse.json({error: "인증이 필요합니다."}, {status: 401});
  if (!hasSameOrigin(request)) return NextResponse.json({error: "허용되지 않은 요청 출처입니다."}, {status: 403});

  let discordUserId = "";
  try {
    const body = await request.json() as {discordUserId?: unknown};
    discordUserId = typeof body.discordUserId === "string" ? body.discordUserId : "";
  } catch {
    return NextResponse.json({error: "잘못된 요청입니다."}, {status: 400});
  }
  if (!/^\d{6,20}$/.test(discordUserId)) {
    return NextResponse.json({error: "갱신할 선수를 선택해 주세요."}, {status: 400});
  }

  try {
    await syncPlayerFromWeb(discordUserId);
    return NextResponse.json({synced: true});
  } catch (error) {
    if (error instanceof WebSyncError) {
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
      return NextResponse.json({error: message}, {status: error.status === 429 ? 429 : 502});
    }
    const configurationError = error instanceof Error
      && error.message.startsWith("Missing required environment variable");
    console.error("[lol-web-sync] sync failed", error);
    return NextResponse.json({
      error: configurationError
        ? "웹 서버의 Riot API 설정을 확인해 주세요."
        : "롤 계정을 갱신하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    }, {status: configurationError ? 503 : 502});
  }
}
