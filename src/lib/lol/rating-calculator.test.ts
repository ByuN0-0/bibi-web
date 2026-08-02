import {describe, expect, it} from "vitest";
import {calculateRoleStats, tierScore} from "@/lib/lol/rating-calculator";
import type {MatchPerformance, RankInfo} from "@/lib/lol/types";

const unranked: RankInfo = {tier: "UNRANKED", division: "", leaguePoints: 0, wins: 0, losses: 0};

describe("web Riot rating calculator", () => {
  it("matches the Java rank scale", () => {
    expect(tierScore(
      {tier: "GOLD", division: "I", leaguePoints: 0, wins: 1, losses: 1},
      unranked,
    )).toBeCloseTo(0.375);
  });

  it("uses the same empty-role and confidence adjustment as Java", () => {
    const match: MatchPerformance = {
      matchId: "KR_1",
      playedAt: 1_000,
      role: "TOP",
      goldDiff15: 0,
      xpDiff15: 0,
      csDiff15: 0,
      damagePerGoldDiff: 0,
      killParticipationDiff: 0,
      visionPerMinuteDiff: 0,
      crowdControlPerMinuteDiff: 0,
      objectiveParticipationDiff: 0,
      deathRateDiff: 0,
    };
    const stats = calculateRoleStats(unranked, unranked, [match], 1_000);
    expect(stats.TOP?.confidence).toBeCloseTo(0.2);
    expect(stats.TOP?.formScore).toBeCloseTo(0.5);
    expect(stats.TOP?.balanceSignal).toBeCloseTo(0.41);
    expect(stats.JUNGLE?.balanceSignal).toBeCloseTo(0.35);
  });
});
