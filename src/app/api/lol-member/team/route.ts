import {NextRequest, NextResponse} from "next/server";
import {hasSameOrigin} from "@/lib/same-origin";
import {
  generateTeamComposition,
  TeamGenerationError,
} from "@/lib/lol/team-generator";
import {recordPublicTeamRequest} from "@/lib/lol/public-team-rate-limit";

export const maxDuration = 60;

type RequestBody = {
  selectedDiscordUserIds?: unknown;
  excludedSignatures?: unknown;
  constraints?: unknown;
};

const attemptsByIp = new Map<string, number[]>();

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({error: "허용되지 않은 요청 출처입니다."}, {status: 403});
  }

  let body: RequestBody;
  try {
    body = await request.json() as RequestBody;
  } catch {
    return NextResponse.json({error: "잘못된 요청입니다."}, {status: 400});
  }

  const selectedDiscordUserIds = Array.isArray(body.selectedDiscordUserIds)
    ? body.selectedDiscordUserIds.filter((id): id is string => typeof id === "string")
    : [];
  const excludedSignatures = Array.isArray(body.excludedSignatures)
    ? body.excludedSignatures.filter((signature): signature is string => typeof signature === "string")
    : [];

  if (selectedDiscordUserIds.length !== 10 || new Set(selectedDiscordUserIds).size !== 10) {
    return NextResponse.json({error: "선수를 정확히 10명 선택해 주세요."}, {status: 400});
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
  const rateLimit = recordPublicTeamRequest(attemptsByIp.get(ip));
  attemptsByIp.set(ip, rateLimit.attempts);
  if (!rateLimit.allowed) {
    const retryAfter = Math.max(1, Math.ceil((rateLimit.retryAt - Date.now()) / 1000));
    return NextResponse.json(
      {error: "팀 편성 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."},
      {status: 429, headers: {"Retry-After": String(retryAfter)}},
    );
  }

  try {
    const composition = await generateTeamComposition(selectedDiscordUserIds, excludedSignatures, body.constraints);
    return NextResponse.json({composition});
  } catch (error) {
    if (error instanceof TeamGenerationError) {
      return NextResponse.json({error: error.message}, {status: error.status});
    }
    return NextResponse.json({error: "팀 편성에 실패했습니다."}, {status: 500});
  }
}
