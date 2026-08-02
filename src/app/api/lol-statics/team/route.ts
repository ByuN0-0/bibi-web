import {NextRequest, NextResponse} from "next/server";
import {hasApiSession, hasSameOrigin} from "@/lib/auth-server";
import {
  findDraft,
  latestSystemStatus,
  listPlayers,
  listRecentSessions,
  saveDraft,
  saveSession,
} from "@/lib/lol/repository";
import {balanceTeam} from "@/lib/lol/team-balancer";
import {ALGORITHM_VERSION, type TeamDraft} from "@/lib/lol/types";

type RequestBody = {
  action?: "generate" | "reroll" | "confirm";
  selectedDiscordUserIds?: string[];
  draftId?: string;
};

export async function POST(request: NextRequest) {
  if (!await hasApiSession(request)) return responseError("인증이 필요합니다.", 401);
  if (!hasSameOrigin(request)) return responseError("허용되지 않은 요청 출처입니다.", 403);
  const body = await request.json() as RequestBody;
  try {
    if (body.action === "confirm") return await confirm(body.draftId);
    if (body.action === "generate" || body.action === "reroll") {
      return await generate(body);
    }
    return responseError("지원하지 않는 작업입니다.", 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "팀 편성에 실패했습니다.";
    return responseError(message, 400);
  }
}

async function generate(body: RequestBody) {
  const status = await latestSystemStatus();
  if (!status || status.algorithmVersion !== ALGORITHM_VERSION) {
    return responseError("Java 봇과 웹의 팀 편성 알고리즘 버전이 일치하지 않습니다.", 409);
  }
  const previous = body.draftId ? await findDraft(body.draftId) : null;
  if (body.action === "reroll" && !previous) return responseError("내전 초안을 찾을 수 없습니다.", 404);
  if (previous?.value.status === "CONFIRMED") return responseError("이미 확정된 내전입니다.", 409);
  const selected = body.action === "reroll"
    ? previous!.value.selectedDiscordUserIds
    : body.selectedDiscordUserIds ?? [];
  if (selected.length !== 10 || new Set(selected).size !== 10) {
    return responseError("선수를 정확히 10명 선택해 주세요.", 400);
  }
  const byId = new Map((await listPlayers()).map((player) => [player.discordUserId, player]));
  const players = selected.map((id) => byId.get(id));
  if (players.some((player) => !player)) return responseError("미등록 선수가 포함되어 있습니다.", 400);
  const pending = players.filter((player) => player!.syncStatus !== "READY" || !player!.lastSyncedAt);
  if (pending.length) {
    return responseError(`초기 동기화가 끝나지 않은 선수가 있습니다: ${pending.map((player) => player!.displayName).join(", ")}`, 409);
  }
  const excluded = new Set(previous?.value.excludedSignatures ?? []);
  const composition = balanceTeam(players as NonNullable<(typeof players)[number]>[], await listRecentSessions(5), excluded);
  excluded.add(composition.signature);
  const now = Date.now();
  const draft: TeamDraft = {
    schemaVersion: 1,
    draftId: previous?.value.draftId ?? crypto.randomUUID(),
    hostDiscordUserId: "web-admin",
    selectedDiscordUserIds: selected,
    excludedSignatures: [...excluded],
    composition,
    status: "DRAFT",
    expiresAt: now + 2 * 60 * 60 * 1000,
    updatedAt: now,
  };
  await saveDraft(draft);
  return NextResponse.json({draft});
}

async function confirm(draftId?: string) {
  if (!draftId) return responseError("내전 초안 ID가 필요합니다.", 400);
  const document = await findDraft(draftId);
  if (!document) return responseError("확정할 팀 편성이 없습니다.", 404);
  const draft = document.value;
  const composition = draft.composition;
  if (!composition) return responseError("확정할 팀 편성이 없습니다.", 404);
  if (draft.status === "CONFIRMED") return responseError("이미 확정된 내전입니다.", 409);
  if (composition.algorithmVersion !== ALGORITHM_VERSION) {
    return responseError("지원하지 않는 알고리즘 버전입니다.", 409);
  }
  const now = Date.now();
  await saveSession({
    schemaVersion: 1,
    sessionId: crypto.randomUUID(),
    hostDiscordUserId: "web-admin",
    composition,
    confirmedAt: now,
  });
  const confirmed = {...draft, status: "CONFIRMED" as const, updatedAt: now};
  await saveDraft(confirmed);
  return NextResponse.json({draft: confirmed});
}

function responseError(error: string, status: number) {
  return NextResponse.json({error}, {status});
}
