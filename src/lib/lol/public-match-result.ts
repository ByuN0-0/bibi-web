import type {MatchResult, PublicMatchResult} from "@/lib/lol/types";

export function toPublicMatchResult(result: MatchResult): PublicMatchResult {
  return {
    matchResultId: result.matchResultId,
    playedOn: result.playedOn,
    winner: result.winner,
    durationSeconds: result.durationSeconds,
    ddragonVersion: result.ddragonVersion,
    teamStats: result.teamStats,
    participants: result.participants.map(({discordUserId, ...participant}) => {
      void discordUserId;
      return participant;
    }),
  };
}
