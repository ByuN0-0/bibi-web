import {NextRequest, NextResponse} from "next/server";
import {hasApiSession, hasSameOrigin} from "@/lib/auth-server";
import {requestPlayerSync} from "@/lib/lol/repository";

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

  const result = await requestPlayerSync(discordUserId);
  if (result.status === "REQUESTED") return NextResponse.json({requested: true}, {status: 202});
  if (result.status === "NOT_FOUND") return NextResponse.json({error: "선수를 찾을 수 없습니다."}, {status: 404});
  if (result.status === "COOLDOWN") return NextResponse.json({error: "선수별 갱신은 15분에 한 번 가능합니다.", retryAt: result.retryAt}, {status: 429});
  if (result.status === "ALREADY_REQUESTED" || result.status === "SYNCING") {
    return NextResponse.json({error: "이미 갱신 대기 또는 갱신 중입니다."}, {status: 409});
  }
  return NextResponse.json({error: "갱신 요청이 충돌했습니다. 다시 시도해 주세요."}, {status: 409});
}
