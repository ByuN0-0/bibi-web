import {NextRequest, NextResponse} from "next/server";
import {getIngestServerEnv} from "@/lib/server-env";
import {
  bearerTokenMatches,
  createMatchResult,
  matchResultSourceHash,
  MatchResultError,
  parseMatchReviewIssues,
  parseMatchResultInput,
  prepareMatchResult,
} from "@/lib/lol/match-result";
import {validateDataDragonReferences} from "@/lib/lol/data-dragon";
import {findMatchResultByIngestionId, listPlayers, listPlayerAccounts, saveMatchResult} from "@/lib/lol/repository";

const MAX_BODY_BYTES = 64 * 1024;

export async function GET(request: NextRequest) {
  try {
    const {token} = getIngestServerEnv();
    if (!bearerTokenMatches(request.headers.get("authorization"), token)) {
      return errorResponse("인증이 필요합니다.", 401, "UNAUTHORIZED");
    }
    const [players, accounts] = await Promise.all([listPlayers(), listPlayerAccounts()]);
    return NextResponse.json({
      players: players.map((player) => ({
        discordUserId: player.discordUserId,
        displayName: player.displayName,
        riotGameName: player.riotGameName,
        riotTagLine: player.riotTagLine,
        accounts: accounts.filter((account) => account.discordUserId === player.discordUserId).map((account) => ({
          riotGameName: account.riotGameName, riotTagLine: account.riotTagLine, isPrimary: account.isPrimary,
        })),
      })),
    });
  } catch {
    return errorResponse("등록 선수 목록을 불러오지 못했습니다.", 500, "PLAYER_LIST_FAILED");
  }
}

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
    if (action !== "validate" && action !== "stage" && action !== "commit") {
      return errorResponse("action은 validate, stage 또는 commit이어야 합니다.", 400, "INVALID_ACTION");
    }
    const parsed = parseMatchResultInput(body);
    const reviewIssues = parseMatchReviewIssues(body, parsed);
    await validateDataDragonReferences(parsed);
    const [players, accounts] = await Promise.all([listPlayers(), listPlayerAccounts()]);
    const prepared = prepareMatchResult(parsed, players, accounts);
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
      if (action === "validate") return validationResponse(parsed, prepared, reviewIssues, true);
      return NextResponse.json({status: "EXISTING", created: false, result: existing.value, reviewPath: reviewPath(existing.value.matchResultId)});
    }
    const sourceHash = matchResultSourceHash(parsed);
    if (action === "validate") {
      return validationResponse(parsed, prepared, reviewIssues, false);
    }
    const saved = await saveMatchResult(createMatchResult(prepared, Date.now(), "ingest-api", reviewIssues));
    if (!saved.created && saved.result.sourceHash !== sourceHash) {
      return errorResponse(
        "같은 ingestionId로 다른 경기 결과를 저장할 수 없습니다.",
        409,
        "INGESTION_ID_CONFLICT",
      );
    }
    return NextResponse.json({status: saved.created ? "STAGED" : "EXISTING", ...saved, reviewPath: reviewPath(saved.result.matchResultId)}, {
      status: saved.created ? 201 : 200,
    });
  } catch (error) {
    if (error instanceof MatchResultError) {
      return errorResponse(error.message, error.status, error.code);
    }
    return errorResponse("경기 결과를 처리하지 못했습니다.", 500, "MATCH_RESULT_FAILED");
  }
}

function validationResponse(
  parsed: ReturnType<typeof parseMatchResultInput>,
  prepared: ReturnType<typeof prepareMatchResult>,
  reviewIssues: ReturnType<typeof parseMatchReviewIssues>,
  existing: boolean,
) {
  return NextResponse.json({
    status: "VALID",
    existing,
    sourceHash: prepared.sourceHash,
    guestCount: prepared.guestCount,
    reviewIssues,
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

function reviewPath(matchResultId: string) {
  return `/lol-statics/history/${encodeURIComponent(matchResultId)}/edit`;
}

function errorResponse(error: string, status: number, code: string) {
  return NextResponse.json({error, code}, {status});
}
