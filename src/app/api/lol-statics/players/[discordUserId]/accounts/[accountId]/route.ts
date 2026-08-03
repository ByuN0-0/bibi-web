import {NextRequest, NextResponse} from "next/server";
import {hasApiSession, hasSameOrigin} from "@/lib/auth-server";
import {deletePlayerAccount, setPrimaryPlayerAccount} from "@/lib/lol/repository";
import {rebuildPlayerFromAccounts} from "@/lib/lol/account-sync-service";

export async function PATCH(request: NextRequest, context: {params: Promise<{discordUserId: string; accountId: string}>}) {
  if (!await hasApiSession(request)) return response("인증이 필요합니다.", 401);
  if (!hasSameOrigin(request)) return response("허용되지 않은 요청 출처입니다.", 403);
  const {discordUserId, accountId} = await context.params;
  try {
    await setPrimaryPlayerAccount(discordUserId, accountId);
    return NextResponse.json({ok: true});
  } catch (error) {
    if (error instanceof Error && error.message === "ACCOUNT_NOT_FOUND") return response("계정을 찾을 수 없습니다.", 404);
    throw error;
  }
}

export async function DELETE(request: NextRequest, context: {params: Promise<{discordUserId: string; accountId: string}>}) {
  if (!await hasApiSession(request)) return response("인증이 필요합니다.", 401);
  if (!hasSameOrigin(request)) return response("허용되지 않은 요청 출처입니다.", 403);
  const {discordUserId, accountId} = await context.params;
  try {
    await deletePlayerAccount(discordUserId, accountId);
    await rebuildPlayerFromAccounts(discordUserId);
    return NextResponse.json({ok: true});
  } catch (error) {
    if (error instanceof Error && error.message === "LAST_ACCOUNT") return response("마지막 Riot 계정은 삭제할 수 없습니다.", 409);
    if (error instanceof Error && error.message === "ACCOUNT_NOT_FOUND") return response("계정을 찾을 수 없습니다.", 404);
    throw error;
  }
}

const response = (error: string, status: number) => NextResponse.json({error}, {status});
