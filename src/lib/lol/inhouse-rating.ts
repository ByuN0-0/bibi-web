import type {InhouseRatingSnapshot, MatchResult} from "@/lib/lol/types";
import {isPublishedMatch} from "@/lib/lol/match-review";

const INITIAL_ELO = 1500;
const K_FACTOR = 32;

export function calculateInhouseRatings(
  results: MatchResult[],
  now = Date.now(),
): InhouseRatingSnapshot {
  const ratings = new Map<string, {elo: number; matchCount: number}>();
  const ordered = results.filter(isPublishedMatch).sort((left, right) =>
    left.playedOn.localeCompare(right.playedOn) || left.createdAt - right.createdAt
      || left.matchResultId.localeCompare(right.matchResultId));
  let sourceMatchCount = 0;
  for (const result of ordered) {
    const participants = result.participants.filter((participant) => !participant.guest && participant.discordUserId);
    const ids = participants.map((participant) => participant.discordUserId!);
    if (participants.length !== 10 || new Set(ids).size !== 10) continue;
    const blue = participants.filter((participant) => participant.team === "BLUE").map((participant) => participant.discordUserId!);
    const red = participants.filter((participant) => participant.team === "RED").map((participant) => participant.discordUserId!);
    if (blue.length !== 5 || red.length !== 5) continue;
    const average = (team: string[]) => team.reduce((sum, id) => sum + (ratings.get(id)?.elo ?? INITIAL_ELO), 0) / team.length;
    const blueExpected = 1 / (1 + Math.pow(10, (average(red) - average(blue)) / 400));
    const blueScore = result.winner === "BLUE" ? 1 : 0;
    const delta = K_FACTOR * (blueScore - blueExpected);
    for (const [team, direction] of [[blue, 1], [red, -1]] as const) {
      for (const id of team) {
        const current = ratings.get(id) ?? {elo: INITIAL_ELO, matchCount: 0};
        ratings.set(id, {elo: current.elo + direction * delta, matchCount: current.matchCount + 1});
      }
    }
    sourceMatchCount += 1;
  }
  return {
    schemaVersion: 1,
    snapshotId: "current",
    ratings: [...ratings].map(([discordUserId, rating]) => ({discordUserId, ...rating}))
      .sort((left, right) => left.discordUserId.localeCompare(right.discordUserId)),
    sourceMatchCount,
    computedAt: now,
  };
}

export function inhouseBalanceSignal(elo: number) {
  return Math.max(0, Math.min(1, 0.5 + (elo - INITIAL_ELO) / 800));
}
