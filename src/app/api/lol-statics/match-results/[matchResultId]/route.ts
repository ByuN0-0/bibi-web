import {NextRequest, NextResponse} from "next/server";
import {hasApiSession, hasSameOrigin} from "@/lib/auth-server";
import {MatchResultError, parseAdminMatchResultUpdate} from "@/lib/lol/match-result";
import {validateDataDragonReferences} from "@/lib/lol/data-dragon";
import {findMatchResult, listPlayers, replaceMatchResult} from "@/lib/lol/repository";
import type {MatchResult} from "@/lib/lol/types";

export async function PATCH(
  request: NextRequest,
  {params}: {params: Promise<{matchResultId: string}>},
) {
  if (!await hasApiSession(request)) return responseError("인증이 필요합니다.", 401);
  if (!hasSameOrigin(request)) return responseError("허용되지 않은 요청 출처입니다.", 403);
  const {matchResultId} = await params;
  const document = await findMatchResult(matchResultId);
  if (!document) return responseError("경기 결과를 찾을 수 없습니다.", 404);
  try {
    const update = parseAdminMatchResultUpdate(await request.json(), await listPlayers());
    await validateDataDragonReferences(update);
    if (update.revision !== document.value.revision) {
      return responseError("다른 관리자가 먼저 수정했습니다. 새로고침 후 다시 시도해 주세요.", 409);
    }
    const now = Date.now();
    const result: MatchResult = {
      ...document.value,
      playedOn: update.playedOn,
      winner: update.winner,
      durationSeconds: update.durationSeconds,
      ddragonVersion: update.ddragonVersion,
      teamStats: update.teamStats,
      participants: update.participants,
      revision: document.value.revision + 1,
      correctedBy: "web-admin",
      corrections: [
        ...(document.value.corrections ?? []),
        {
          revision: document.value.revision + 1,
          correctedAt: now,
          correctedBy: "web-admin",
        },
      ],
      updatedAt: now,
    };
    await replaceMatchResult(document, result);
    return NextResponse.json({result});
  } catch (error) {
    if (error instanceof MatchResultError) return responseError(error.message, error.status);
    if (error instanceof Error && error.message === "SODA_CONFLICT") {
      return responseError("다른 관리자가 먼저 수정했습니다. 새로고침 후 다시 시도해 주세요.", 409);
    }
    return responseError("경기 결과를 수정하지 못했습니다.", 500);
  }
}

function responseError(error: string, status: number) {
  return NextResponse.json({error}, {status});
}
