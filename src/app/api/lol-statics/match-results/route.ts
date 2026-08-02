import {NextRequest, NextResponse} from "next/server";
import {hasApiSession, hasSameOrigin} from "@/lib/auth-server";
import {verifyReviewReceipt} from "@/lib/lol/match-recognition-receipt";
import {
  createMatchResult,
  MatchResultError,
  parseMatchResultInput,
  prepareMatchResult,
} from "@/lib/lol/match-result";
import {validateDataDragonReferences} from "@/lib/lol/data-dragon";
import {rebuildInhouseRatingSnapshot} from "@/lib/lol/inhouse-rating-service";
import {
  findMatchResultByIngestionId,
  listPlayerAccounts,
  listPlayers,
  saveMatchResult,
} from "@/lib/lol/repository";

const MAX_BODY_BYTES = 128 * 1024;

export async function POST(request: NextRequest) {
  if (!await hasApiSession(request)) return responseError("인증이 필요합니다.", 401);
  if (!hasSameOrigin(request)) return responseError("허용되지 않은 요청 출처입니다.", 403);
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return responseError("요청 본문이 너무 큽니다.", 413);
    const body = JSON.parse(raw) as Record<string, unknown>;
    const parsed = parseMatchResultInput(body.draft);
    try {
      verifyReviewReceipt(body.reviewReceipt, parsed.ingestionId, body.confirmedReviewIds);
    } catch (error) {
      throw new MatchResultError(error instanceof Error ? error.message : "판독 검토 정보가 올바르지 않습니다.");
    }
    await validateDataDragonReferences(parsed);
    const [players, accounts] = await Promise.all([listPlayers(), listPlayerAccounts()]);
    const prepared = prepareMatchResult(parsed, players, accounts);
    const existing = await findMatchResultByIngestionId(parsed.ingestionId);
    if (existing) {
      if (existing.value.sourceHash !== prepared.sourceHash) {
        return responseError("같은 이미지로 이미 저장된 경기와 현재 초안이 다릅니다. 기존 경기를 수정해 주세요.", 409);
      }
      return NextResponse.json({status: "EXISTING", result: existing.value});
    }
    const saved = await saveMatchResult(createMatchResult(prepared, Date.now(), "web-admin"));
    if (!saved.created && saved.result.sourceHash !== prepared.sourceHash) {
      return responseError("같은 이미지로 이미 저장된 경기와 현재 초안이 다릅니다. 기존 경기를 수정해 주세요.", 409);
    }
    if (saved.created) await rebuildInhouseRatingSnapshot();
    return NextResponse.json({status: saved.created ? "CREATED" : "EXISTING", result: saved.result}, {status: saved.created ? 201 : 200});
  } catch (error) {
    if (error instanceof SyntaxError) return responseError("JSON 요청 본문이 올바르지 않습니다.", 400);
    if (error instanceof MatchResultError) return responseError(error.message, error.status);
    return responseError("경기 결과를 저장하지 못했습니다.", 500);
  }
}

function responseError(error: string, status: number) {
  return NextResponse.json({error}, {status});
}
