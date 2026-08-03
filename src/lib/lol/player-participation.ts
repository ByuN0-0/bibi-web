import {isPublishedMatch} from "@/lib/lol/match-review";
import type {MatchResult, PlayerProfile} from "@/lib/lol/types";

export type PlayerParticipation = {
  matchCount: number;
  lastPlayedOn: string | null;
};

export type PlayerParticipationMap = Record<string, PlayerParticipation>;

export function summarizePlayerParticipation(results: MatchResult[]): PlayerParticipationMap {
  const summary: PlayerParticipationMap = {};
  for (const result of results) {
    if (!isPublishedMatch(result)) continue;
    const participantIds = new Set(
      result.participants
        .filter((participant) => !participant.guest && participant.discordUserId)
        .map((participant) => participant.discordUserId!),
    );
    for (const discordUserId of participantIds) {
      const current = summary[discordUserId] ?? {matchCount: 0, lastPlayedOn: null};
      summary[discordUserId] = {
        matchCount: current.matchCount + 1,
        lastPlayedOn: !current.lastPlayedOn || result.playedOn > current.lastPlayedOn
          ? result.playedOn
          : current.lastPlayedOn,
      };
    }
  }
  return summary;
}

export function sortPlayersByParticipation(
  players: PlayerProfile[],
  participation: PlayerParticipationMap,
): PlayerProfile[] {
  return [...players].sort((left, right) => {
    const readyOrder = Number(right.syncStatus === "READY") - Number(left.syncStatus === "READY");
    if (readyOrder) return readyOrder;
    const leftStats = participation[left.discordUserId];
    const rightStats = participation[right.discordUserId];
    const matchCountOrder = (rightStats?.matchCount ?? 0) - (leftStats?.matchCount ?? 0);
    if (matchCountOrder) return matchCountOrder;
    const lastPlayedOrder = (rightStats?.lastPlayedOn ?? "").localeCompare(leftStats?.lastPlayedOn ?? "");
    if (lastPlayedOrder) return lastPlayedOrder;
    return left.displayName.localeCompare(right.displayName, "ko")
      || left.discordUserId.localeCompare(right.discordUserId);
  });
}
