import {NextRequest, NextResponse} from "next/server";
import {getIngestServerEnv} from "@/lib/server-env";
import {
  bearerTokenMatches,
  createMatchResult,
  matchResultSourceHash,
  MatchResultError,
  parseMatchResultInput,
  prepareMatchResult,
} from "@/lib/lol/match-result";
import {validateDataDragonReferences} from "@/lib/lol/data-dragon";
import {
  findMatchResultByIngestionId,
  listPlayers,
  saveMatchResult,
} from "@/lib/lol/repository";

const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: NextRequest) {
  try {
    const {token} = getIngestServerEnv();
    if (!bearerTokenMatches(request.headers.get("authorization"), token)) {
      return errorResponse("인증이 필요합니다.", 401, "UNAUTHORIZED");
    }
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
      return errorResponse("요청 본문이 너무 큽니다.", 413, "PAYLOAD_TOO_LARGE");
    }
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return errorResponse("JSON 요청 본문이 올바르지 않습니다.", 400, "INVALID_JSON");
    }
    const action = (body as Record<string, unknown>)?.action;
    if (action !== "validate" && action !== "commit") {
      return errorResponse("action은 validate 또는 commit이어야 합니다.", 400, "INVALID_ACTION");
    }
    const parsed = parseMatchResultInput(body);
    await validateDataDragonReferences(parsed);
    const existing = await findMatchResultByIngestionId(parsed.ingestionId);
    if (existing) {
      const sourceHash = matchResultSourceHash(parsed);
      if (existing.value.sourceHash !== sourceHash) {
        return errorResponse(
          "같은 ingestionId로 다른 경기 결과를 저장할 수 없습니다.",
          409,
          "INGESTION_ID_CONFLICT",
        );
      }
      return NextResponse.json({status: "EXISTING", created: false, result: existing.value});
    }
    const sourceHash = matchResultSourceHash(parsed);
    const players = await listPlayers();
    const prepared = prepareMatchResult(parsed, players);
    if (action === "validate") {
      return NextResponse.json({
        status: "VALID",
        sourceHash: prepared.sourceHash,
        guestCount: prepared.guestCount,
        match: {
          playedOn: parsed.playedOn,
          winner: parsed.winner,
          durationSeconds: parsed.durationSeconds,
          ddragonVersion: parsed.ddragonVersion,
          teamStats: parsed.teamStats,
          participants: prepared.participants,
        },
      });
    }
    const saved = await saveMatchResult(createMatchResult(prepared));
    if (!saved.created && saved.result.sourceHash !== sourceHash) {
      return errorResponse(
        "같은 ingestionId로 다른 경기 결과를 저장할 수 없습니다.",
        409,
        "INGESTION_ID_CONFLICT",
      );
    }
    return NextResponse.json({status: saved.created ? "CREATED" : "EXISTING", ...saved}, {
      status: saved.created ? 201 : 200,
    });
  } catch (error) {
    if (error instanceof MatchResultError) {
      return errorResponse(error.message, error.status, error.code);
    }
    return errorResponse("경기 결과를 처리하지 못했습니다.", 500, "MATCH_RESULT_FAILED");
  }
}

function errorResponse(error: string, status: number, code: string) {
  return NextResponse.json({error, code}, {status});
}
