import {NextRequest, NextResponse} from "next/server";
import {hasApiSession, hasSameOrigin} from "@/lib/auth-server";
import {MatchResultError, parseAdminMatchResultUpdate} from "@/lib/lol/match-result";
import {validateDataDragonReferences} from "@/lib/lol/data-dragon";
import {deleteMatchResult, findMatchResult, listPlayers, replaceMatchResult} from "@/lib/lol/repository";
import type {MatchResult} from "@/lib/lol/types";
import {rebuildInhouseRatingSnapshot} from "@/lib/lol/inhouse-rating-service";
import {isPublishedMatch, matchReviewIssues, matchReviewStatus, reviewTargetValue} from "@/lib/lol/match-review";
import type {MatchReviewIssue, MatchReviewIssueStatus} from "@/lib/lol/types";

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
    const body = await request.json() as Record<string, unknown>;
    const action = body.action === undefined ? "save" : body.action;
    if (action !== "save" && action !== "publish") return responseError("지원하지 않는 검토 작업입니다.", 400);
    const update = parseAdminMatchResultUpdate(body, await listPlayers());
    await validateDataDragonReferences(update);
    if (update.revision !== document.value.revision) {
      return responseError("다른 관리자가 먼저 수정했습니다. 새로고침 후 다시 시도해 주세요.", 409);
    }
    const now = Date.now();
    const reviewIssues = resolveReviewIssues(document.value, update, body.reviewIssues, now);
    const wasPublished = isPublishedMatch(document.value);
    if (action === "publish" && reviewIssues.some((issue) => issue.status === "OPEN")) {
      return responseError("모든 저신뢰 항목을 확인하거나 수정해야 공개할 수 있습니다.", 400);
    }
    const reviewStatus = wasPublished || action === "publish" ? "PUBLISHED" as const : matchReviewStatus(document.value);
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
      reviewStatus,
      reviewIssues,
      reviewedAt: reviewStatus === "PUBLISHED" ? document.value.reviewedAt ?? document.value.updatedAt ?? now : null,
      updatedAt: now,
    };
    await replaceMatchResult(document, result);
    if (wasPublished || reviewStatus === "PUBLISHED") await rebuildInhouseRatingSnapshot();
    return NextResponse.json({result});
  } catch (error) {
    if (error instanceof MatchResultError) return responseError(error.message, error.status);
    if (error instanceof Error && error.message === "SODA_CONFLICT") {
      return responseError("다른 관리자가 먼저 수정했습니다. 새로고침 후 다시 시도해 주세요.", 409);
    }
    return responseError("경기 결과를 수정하지 못했습니다.", 500);
  }
}

export async function DELETE(
  request: NextRequest,
  {params}: {params: Promise<{matchResultId: string}>},
) {
  if (!await hasApiSession(request)) return responseError("인증이 필요합니다.", 401);
  if (!hasSameOrigin(request)) return responseError("허용되지 않은 요청 출처입니다.", 403);
  const {matchResultId} = await params;
  const document = await findMatchResult(matchResultId);
  if (!document) return responseError("경기 결과를 찾을 수 없습니다.", 404);
  try {
    await deleteMatchResult(document);
    if (isPublishedMatch(document.value)) await rebuildInhouseRatingSnapshot();
    return NextResponse.json({ok: true});
  } catch {
    return responseError("경기 결과를 삭제하지 못했습니다.", 500);
  }
}

function resolveReviewIssues(
  current: MatchResult,
  proposed: Pick<MatchResult, "teamStats" | "participants">,
  rawResolutions: unknown,
  now: number,
): MatchReviewIssue[] {
  const issues = matchReviewIssues(current);
  if (!issues.length) return [];
  if (!Array.isArray(rawResolutions)) throw new MatchResultError("저신뢰 항목 확인 상태가 필요합니다.");
  const resolutions = new Map<string, MatchReviewIssueStatus>();
  for (const [index, value] of rawResolutions.entries()) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new MatchResultError(`reviewIssues[${index}]가 올바르지 않습니다.`);
    const entry = value as Record<string, unknown>;
    if (typeof entry.key !== "string" || !["OPEN", "CONFIRMED", "CORRECTED"].includes(String(entry.status))) {
      throw new MatchResultError(`reviewIssues[${index}]가 올바르지 않습니다.`);
    }
    resolutions.set(entry.key, entry.status as MatchReviewIssueStatus);
  }
  return issues.map((issue) => {
    const status = issue.status === "OPEN" ? resolutions.get(issue.key) ?? "OPEN" : issue.status;
    if (issue.status === "OPEN" && status === "CORRECTED" && reviewTargetValue(current, issue.target) === reviewTargetValue(proposed as MatchResult, issue.target)) {
      throw new MatchResultError(`${issue.key} 항목이 변경되지 않아 수정 완료로 처리할 수 없습니다.`);
    }
    return {...issue, status, resolvedAt: status === "OPEN" ? null : issue.resolvedAt ?? now};
  });
}

function responseError(error: string, status: number) {
  return NextResponse.json({error}, {status});
}
