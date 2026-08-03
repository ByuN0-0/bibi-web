import "server-only";
import {listPlayers, listRecentSessions} from "@/lib/lol/repository";
import {getOrRebuildInhouseRatingSnapshot} from "@/lib/lol/inhouse-rating-service";
import {balanceTeam} from "@/lib/lol/team-balancer";
import {ALGORITHM_VERSION} from "@/lib/lol/types";

export class TeamGenerationError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function generateTeamComposition(
  selectedDiscordUserIds: string[],
  excludedSignatures: string[] = [],
) {
  if (selectedDiscordUserIds.length !== 10 || new Set(selectedDiscordUserIds).size !== 10) {
    throw new TeamGenerationError("선수를 정확히 10명 선택해 주세요.", 400);
  }
  const [allPlayers, recentSessions, ratingSnapshot] = await Promise.all([
    listPlayers(),
    listRecentSessions(10, ALGORITHM_VERSION),
    getOrRebuildInhouseRatingSnapshot(),
  ]);
  const byId = new Map(allPlayers.map((player) => [player.discordUserId, player]));
  const players = selectedDiscordUserIds.map((id) => byId.get(id));
  if (players.some((player) => !player)) {
    throw new TeamGenerationError("미등록 선수가 포함되어 있습니다.", 400);
  }
  const pending = players.filter((player) => player!.syncStatus !== "READY" || !player!.lastSyncedAt);
  if (pending.length) {
    throw new TeamGenerationError(
      `초기 동기화가 끝나지 않은 선수가 있습니다: ${pending.map((player) => player!.displayName).join(", ")}`,
      409,
    );
  }

  return balanceTeam(
    players as NonNullable<(typeof players)[number]>[],
    recentSessions,
    new Set(excludedSignatures.slice(0, 20)),
    Math.random,
    new Map((ratingSnapshot?.ratings ?? []).map((rating) => [rating.discordUserId, rating])),
  );
}
