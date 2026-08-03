import type {MatchResult, PublicMatchResult} from "@/lib/lol/types";

export function toPublicMatchResult(
  result: MatchResult,
  playerNamesById: ReadonlyMap<string, string>,
): PublicMatchResult {
  return {
    matchResultId: result.matchResultId,
    playedOn: result.playedOn,
    winner: result.winner,
    durationSeconds: result.durationSeconds,
    ddragonVersion: result.ddragonVersion,
    teamStats: result.teamStats,
    participants: result.participants.map(({discordUserId, ...participant}) => {
      return {
        ...participant,
        registeredPlayerName: discordUserId
          ? playerNamesById.get(discordUserId) ?? null
          : null,
      };
    }),
  };
}
