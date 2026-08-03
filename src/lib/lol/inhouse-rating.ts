import type {
  InhousePlayerRating,
  InhouseRatingSnapshot,
  MatchResult,
  MatchResultParticipant,
} from "@/lib/lol/types";
import {isPublishedMatch} from "@/lib/lol/match-review";

const INITIAL_ELO = 1500;
const K_FACTOR = 32;
const OVERALL_RATING_WEIGHT = 0.30;
const ROLE_RATING_WEIGHT = 0.70;

export function calculateInhouseRatings(
  results: MatchResult[],
  now = Date.now(),
): InhouseRatingSnapshot {
  const ratings = new Map<string, InhousePlayerRating>();
  const ordered = results.filter(isPublishedMatch).sort((left, right) =>
    left.playedOn.localeCompare(right.playedOn) || left.createdAt - right.createdAt
      || left.matchResultId.localeCompare(right.matchResultId));
  let sourceMatchCount = 0;
  for (const result of ordered) {
    const participants = result.participants.filter((participant) => !participant.guest && participant.discordUserId);
    const ids = participants.map((participant) => participant.discordUserId!);
    if (participants.length !== 10 || new Set(ids).size !== 10) continue;
    const blue = participants.filter((participant) => participant.team === "BLUE");
    const red = participants.filter((participant) => participant.team === "RED");
    if (blue.length !== 5 || red.length !== 5) continue;
    const average = (team: MatchResultParticipant[]) => team.reduce(
      (sum, participant) => sum + effectiveElo(ratings.get(participant.discordUserId!), participant),
      0,
    ) / team.length;
    const blueExpected = 1 / (1 + Math.pow(10, (average(red) - average(blue)) / 400));
    const blueScore = result.winner === "BLUE" ? 1 : 0;
    const delta = K_FACTOR * (blueScore - blueExpected);
    for (const [team, direction] of [[blue, 1], [red, -1]] as const) {
      for (const participant of team) {
        const id = participant.discordUserId!;
        const current = ratings.get(id) ?? {
          discordUserId: id,
          elo: INITIAL_ELO,
          matchCount: 0,
          roleRatings: {},
        };
        const roleRating = current.roleRatings?.[participant.role]
          ?? {elo: INITIAL_ELO, matchCount: 0};
        ratings.set(id, {
          ...current,
          elo: current.elo + direction * delta,
          matchCount: current.matchCount + 1,
          roleRatings: {
            ...current.roleRatings,
            [participant.role]: {
              elo: roleRating.elo + direction * delta,
              matchCount: roleRating.matchCount + 1,
            },
          },
        });
      }
    }
    sourceMatchCount += 1;
  }
  return {
    schemaVersion: 2,
    snapshotId: "current",
    ratings: [...ratings.values()]
      .sort((left, right) => left.discordUserId.localeCompare(right.discordUserId)),
    sourceMatchCount,
    computedAt: now,
  };
}

function effectiveElo(rating: InhousePlayerRating | undefined, participant: MatchResultParticipant) {
  if (!rating) return INITIAL_ELO;
  const roleElo = rating.roleRatings?.[participant.role]?.elo ?? INITIAL_ELO;
  return OVERALL_RATING_WEIGHT * rating.elo + ROLE_RATING_WEIGHT * roleElo;
}

export function inhouseBalanceSignal(elo: number) {
  return Math.max(0, Math.min(1, 0.5 + (elo - INITIAL_ELO) / 800));
}
