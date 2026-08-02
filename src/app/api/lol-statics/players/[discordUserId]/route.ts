import {NextRequest, NextResponse} from "next/server";
import {hasApiSession, hasSameOrigin} from "@/lib/auth-server";
import {deletePlayer} from "@/lib/lol/repository";

export async function DELETE(request: NextRequest, {params}: {params: Promise<{discordUserId: string}>}) {
  if (!await hasApiSession(request)) return NextResponse.json({error: "인증이 필요합니다."}, {status: 401});
  if (!hasSameOrigin(request)) return NextResponse.json({error: "허용되지 않은 요청 출처입니다."}, {status: 403});
  const {discordUserId} = await params;
  await deletePlayer(discordUserId);
  return NextResponse.json({ok: true});
}
