import {NextRequest, NextResponse} from "next/server";
import {hasApiSession, hasSameOrigin} from "@/lib/auth-server";
import {createPlayerAccount, ensurePlayerAccounts, findPlayer, listNormalizedPlayerAccounts, PlayerAccountLimitError, PlayerPuuidConflictError} from "@/lib/lol/repository";

export async function GET(request: NextRequest, {params}: {params: Promise<{discordUserId: string}>}) {
  if (!await hasApiSession(request)) return response("인증이 필요합니다.", 401);
  const {discordUserId} = await params;
  const player = await findPlayer(discordUserId);
  if (!player) return response("선수를 찾을 수 없습니다.", 404);
  return NextResponse.json({accounts: await ensurePlayerAccounts(player.value)});
}

export async function POST(request: NextRequest, {params}: {params: Promise<{discordUserId: string}>}) {
  if (!await hasApiSession(request)) return response("인증이 필요합니다.", 401);
  if (!hasSameOrigin(request)) return response("허용되지 않은 요청 출처입니다.", 403);
  const {discordUserId} = await params;
  const body = await request.json() as Record<string, unknown>;
  const riotGameName = String(body.riotGameName ?? "").trim();
  const riotTagLine = String(body.riotTagLine ?? "").trim();
  if (!riotGameName || !riotTagLine || riotGameName.length > 80 || riotTagLine.length > 20) return response("올바른 Riot ID를 입력해 주세요.", 400);
  try {
    const account = await createPlayerAccount(discordUserId, riotGameName, riotTagLine);
    return NextResponse.json({account, accounts: await listNormalizedPlayerAccounts(discordUserId)}, {status: 201});
  } catch (error) {
    if (error instanceof PlayerAccountLimitError || error instanceof PlayerPuuidConflictError) return response(error.message, 409);
    if (error instanceof Error && error.message === "PLAYER_NOT_FOUND") return response("선수를 찾을 수 없습니다.", 404);
    throw error;
  }
}

const response = (error: string, status: number) => NextResponse.json({error}, {status});
