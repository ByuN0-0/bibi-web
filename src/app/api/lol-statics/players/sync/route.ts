import {NextRequest, NextResponse} from "next/server";
import {hasApiSession, hasSameOrigin} from "@/lib/auth-server";
import {listPlayers, requestPlayerSync} from "@/lib/lol/repository";

export async function POST(request: NextRequest) {
  if (!await hasApiSession(request)) return NextResponse.json({error: "인증이 필요합니다."}, {status: 401});
  if (!hasSameOrigin(request)) return NextResponse.json({error: "허용되지 않은 요청 출처입니다."}, {status: 403});
  const body = await request.json() as {discordUserIds?: string[]; all?: boolean};
  const selected = new Set(body.discordUserIds ?? []);
  const players = (await listPlayers()).filter((player) => body.all || selected.has(player.discordUserId));
  const results = await Promise.all(players.map((player) => requestPlayerSync(player.discordUserId)));
  return NextResponse.json({requested: results.filter(Boolean).length});
}
