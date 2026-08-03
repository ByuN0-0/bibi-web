import {describe, expect, it} from "vitest";
import {calculateRoleStats, tierScore} from "@/lib/lol/rating-calculator";
import type {MatchPerformance, RankInfo} from "@/lib/lol/types";

const unranked: RankInfo = {tier: "UNRANKED", division: "", leaguePoints: 0, wins: 0, losses: 0};

describe("web Riot rating calculator", () => {
  it("matches the Java evidence-weighted rank scale", () => {
    const solo = {tier: "DIAMOND", division: "I", leaguePoints: 0, wins: 10, losses: 10};
    const flex = {tier: "BRONZE", division: "I", leaguePoints: 0, wins: 10, losses: 10};
    expect(tierScore(solo, flex)).toBeCloseTo((0.35 * 10 + 0.675 * 20 + 0.175 * 6) / 36);
    expect(tierScore(unranked, flex)).toBeCloseTo((0.35 * 10 + 0.175 * 6) / 16);
  });

  it("uses the same empty-role and confidence adjustment as Java", () => {
    const match: MatchPerformance = {
      matchId: "KR_1",
      playedAt: 1_000,
      queueId: 420,
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
    expect(stats.TOP?.confidence).toBeCloseTo(1 / 6);
    expect(stats.TOP?.formScore).toBeCloseTo(0.5);
    expect(stats.TOP?.balanceSignal).toBeCloseTo(0.35);
    expect(stats.JUNGLE?.balanceSignal).toBeCloseTo(0.35);
  });

  it("discounts flex and normal performance samples", () => {
    const match = (queueId: number): MatchPerformance => ({
      matchId: `KR_${queueId}`,
      playedAt: 1_000,
      queueId,
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
    });
    const stats = calculateRoleStats(unranked, unranked,
      [match(420), match(440), match(490)], 1_000);
    expect(stats.TOP?.confidence).toBeCloseTo(1.5 / 6.5);
  });
});
