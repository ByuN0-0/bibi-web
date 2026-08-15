import {describe, expect, it} from "vitest";
import fixture from "@/test/fixtures/team-balancing-v1.json";
import {balanceTeam, compareLanePriority, javaRandom, summarizeLaneAdvantage} from "@/lib/lol/team-balancer";
import {ALGORITHM_VERSION, REPEAT_HISTORY_ALGORITHM_VERSIONS, ROLES, type PlayerProfile, type Role, type RoleStats, type TeamConstraints} from "@/lib/lol/types";
import {parseTeamConstraints} from "@/lib/lol/team-constraints";
import {legacyRolePreferences, parseRolePreferences, resolveRolePreferences} from "@/lib/lol/role-preferences";

function players(): PlayerProfile[] {
  return fixture.players.map((player) => ({
    schemaVersion: 2, discordUserId: player.id, displayName: player.name,
    riotGameName: player.name, riotTagLine: "KR1", puuid: player.id, summonerId: player.id,
    primaryRole: player.primaryRole as PlayerProfile["primaryRole"],
    secondaryRole: player.secondaryRole as PlayerProfile["secondaryRole"],
    soloRank: {tier: "GOLD", division: "I", leaguePoints: 0, wins: 10, losses: 10},
    flexRank: {tier: "UNRANKED", division: "", leaguePoints: 0, wins: 0, losses: 0},
    recentMatches: [],
    roleStats: Object.fromEntries(ROLES.map((role) => [role, {
      sampleCount: 5, confidence: 1, goldDiff15: 0, xpDiff15: 0, csDiff15: 0,
      damagePerGoldDiff: 0, killParticipationDiff: 0, visionPerMinuteDiff: 0,
      crowdControlPerMinuteDiff: 0, objectiveParticipationDiff: 0, formScore: 0.5,
      balanceSignal: player.signals[role],
    } satisfies RoleStats])),
    syncStatus: "READY", syncRequestedAt: 0, lastSyncStartedAt: 0, lastSyncedAt: 1,
    syncErrorCode: null, revision: 1, createdAt: 1, updatedAt: 1,
  }));
}

describe(ALGORITHM_VERSION, () => {
  it("keeps v3 through v6 sessions for repeat teammate history", () => {
    expect(REPEAT_HISTORY_ALGORITHM_VERSIONS).toEqual([
      "team-balancing-v3", "team-balancing-v4", "team-balancing-v5", "team-balancing-v6",
    ]);
  });

  it("matches the shared seeded fixture", () => {
    const result = balanceTeam(players(), [], new Set(), javaRandom(fixture.seed));
    expect(result.algorithmVersion).toBe(fixture.algorithmVersion);
    expect(result.signature).toBe(fixture.expectedSignature);
    expect(result.laneAdvantage).toEqual(fixture.expectedLaneAdvantage);
    expect([...result.blue, ...result.red]).toHaveLength(10);
    expect(new Set([...result.blue, ...result.red].map((player) => player.discordUserId)).size).toBe(10);
    expect([...result.blue, ...result.red].every((player) => !player.offRole)).toBe(true);
    expect(result.laneAdvantage?.balanced).toBe(true);
    expect((result.laneAdvantage?.blueCount ?? 0) + (result.laneAdvantage?.redCount ?? 0)
      + (result.laneAdvantage?.neutralCount ?? 0)).toBe(4);
  });

  it("excludes a previously presented team signature", () => {
    const first = balanceTeam(players(), [], new Set(), javaRandom(fixture.seed));
    const second = balanceTeam(players(), [], new Set([first.signature]), javaRandom(fixture.seed));
    expect(second.signature).not.toBe(first.signature);
  });

  it("handles a worst-case shared role preference without exhaustive objects", () => {
    const samePreferences = players().map((player) => ({
      ...player,
      primaryRole: "TOP" as const,
      secondaryRole: "JUNGLE" as const,
    }));

    const result = balanceTeam(samePreferences, [], new Set(), javaRandom(fixture.seed));

    expect([...result.blue, ...result.red].filter((player) => player.offRole)).toHaveLength(6);
  });

  it("applies fixed roles and same-team pairs as hard constraints", () => {
    const constraints = parseTeamConstraints({
      roleLocks: [{discordUserId: "1001", role: "BOTTOM"}],
      sameTeamPairs: [
        {firstDiscordUserId: "1001", secondDiscordUserId: "1002"},
        {firstDiscordUserId: "1002", secondDiscordUserId: "1003"},
      ],
    }, players().map((player) => player.discordUserId));

    const result = balanceTeam(players(), [], new Set(), javaRandom(fixture.seed), new Map(), constraints);
    const blueIds = new Set(result.blue.map((player) => player.discordUserId));

    expect([...result.blue, ...result.red].find((player) => player.discordUserId === "1001")?.role).toBe("BOTTOM");
    expect(blueIds.has("1001")).toBe(blueIds.has("1002"));
    expect(blueIds.has("1002")).toBe(blueIds.has("1003"));
  });

  it("rejects impossible fixed conditions", () => {
    const constraints = {
      roleLocks: ["1001", "1002", "1003"].map((discordUserId) => ({discordUserId, role: "TOP" as const})),
      sameTeamPairs: [],
    };
    expect(() => balanceTeam(players(), [], new Set(), javaRandom(fixture.seed), new Map(), constraints))
      .toThrow("고정 조건을 만족하는 팀 조합이 없습니다");
  });

  it("prioritizes a balanced four-battlefield split over a lower team-gap split", () => {
    const {players: matchupPlayers, constraints} = directionalMatchup();

    const result = balanceTeam(matchupPlayers, [], new Set(), javaRandom(fixture.seed), new Map(), constraints);
    const lowerGap = balanceTeam(matchupPlayers, [], new Set(), javaRandom(fixture.seed), new Map(),
      forceThreeToOne(constraints));

    expect(result.laneAdvantage?.balanced).toBe(true);
    expect(lowerGap.laneAdvantage?.balanced).toBe(false);
    expect(result.teamGap).toBeGreaterThan(lowerGap.teamGap);
  });

  it("falls back to the closest forced split and caps its grade at ordinary", () => {
    const matchup = directionalMatchup();

    const result = balanceTeam(matchup.players, [], new Set(), javaRandom(fixture.seed), new Map(),
      forceThreeToOne(matchup.constraints));

    expect(result.laneAdvantage?.balanced).toBe(false);
    expect(result.balanceGrade).toBe("보통");
  });

  it("keeps the advantage priority when a presented team is excluded", () => {
    const matchup = directionalMatchup();
    const first = balanceTeam(matchup.players, [], new Set(), javaRandom(fixture.seed), new Map(), matchup.constraints);
    const second = balanceTeam(matchup.players, [], new Set([first.signature]), javaRandom(fixture.seed), new Map(), matchup.constraints);

    expect(second.signature).not.toBe(first.signature);
    expect(second.laneAdvantage?.balanced).toBe(true);
  });
});

describe("lane advantage summary", () => {
  it("combines bottom and utility and treats three points as neutral", () => {
    expect(summarizeLaneAdvantage([0.05, -0.04, 0.031, 0.20, -0.12])).toEqual({
      blueCount: 3, redCount: 1, neutralCount: 0, balanced: false,
    });
    expect(summarizeLaneAdvantage([0.031, -0.04, 0.03, 0.20, -0.19])).toEqual({
      blueCount: 1, redCount: 1, neutralCount: 2, balanced: true,
    });
  });

  it("treats values above three points as clear advantages", () => {
    expect(summarizeLaneAdvantage([0.03, -0.03, 0.030001, -0.030001, -0.030001])).toEqual({
      blueCount: 1, redCount: 1, neutralCount: 2, balanced: true,
    });
  });

  it("prefers more neutral lanes over a lower cost when imbalance is equal", () => {
    const twoToTwo = {blueCount: 2, redCount: 2, neutralCount: 0, balanced: true};
    const oneToOne = {blueCount: 1, redCount: 1, neutralCount: 2, balanced: true};
    expect(compareLanePriority(twoToTwo, 0.01, oneToOne, 0.20)).toBeGreaterThan(0);
    expect(compareLanePriority(oneToOne, 0.20, twoToTwo, 0.01)).toBeLessThan(0);
  });

  it("keeps advantage imbalance ahead of neutral count", () => {
    const balanced = {blueCount: 2, redCount: 2, neutralCount: 0, balanced: true};
    const unbalanced = {blueCount: 2, redCount: 0, neutralCount: 2, balanced: false};
    expect(compareLanePriority(balanced, 0.20, unbalanced, 0.01)).toBeLessThan(0);
  });
});

function directionalMatchup() {
  const roleDifferences = [0.40, 0.30, 0.20, 0.45, 0.45];
  const matchupPlayers = players().map((player, index) => {
    const role = ROLES[Math.floor(index / 2)];
    const signal = 0.5 + (index % 2 === 0 ? 1 : -1) * roleDifferences[Math.floor(index / 2)] / 2;
    const currentStats = player.roleStats?.[role];
    if (!currentStats) throw new Error(`missing ${role} fixture stats`);
    return {
      ...player,
      schemaVersion: 3,
      rolePreferences: {TOP: 20, JUNGLE: 20, MIDDLE: 20, BOTTOM: 20, UTILITY: 20},
      roleStats: {...player.roleStats, [role]: {...currentStats, balanceSignal: signal}},
    };
  });
  const constraints: TeamConstraints = {
    roleLocks: matchupPlayers.map((player, index) => ({
      discordUserId: player.discordUserId,
      role: ROLES[Math.floor(index / 2)] as Role,
    })),
    sameTeamPairs: [],
  };
  return {players: matchupPlayers, constraints};
}

function forceThreeToOne(base: TeamConstraints): TeamConstraints {
  const forcedIds = ["1001", "1003", "1005", "1008", "1010"];
  return {
    ...base,
    sameTeamPairs: forcedIds.slice(1).map((id, index) => ({
      firstDiscordUserId: forcedIds[index],
      secondDiscordUserId: id,
    })),
  };
}

describe("role preferences and constraints", () => {
  it.each([
    {TOP: 100, JUNGLE: 0, MIDDLE: 0, BOTTOM: 0, UTILITY: 0},
    {TOP: 80, JUNGLE: 20, MIDDLE: 0, BOTTOM: 0, UTILITY: 0},
    {TOP: 50, JUNGLE: 30, MIDDLE: 20, BOTTOM: 0, UTILITY: 0},
    {TOP: 25, JUNGLE: 25, MIDDLE: 25, BOTTOM: 25, UTILITY: 0},
    {TOP: 20, JUNGLE: 20, MIDDLE: 20, BOTTOM: 20, UTILITY: 20},
  ])("accepts one through five preferred roles", (preferences) => {
    expect(parseRolePreferences(preferences)).toEqual(preferences);
  });

  it("falls back to legacy 80/20 preferences", () => {
    expect(resolveRolePreferences({primaryRole: "TOP", secondaryRole: "BOTTOM"}))
      .toEqual(legacyRolePreferences("TOP", "BOTTOM"));
  });

  it("validates percentages and connected same-team groups", () => {
    expect(parseRolePreferences({TOP: 55, JUNGLE: 20, MIDDLE: 20, BOTTOM: 0, UTILITY: 0})).toBeNull();
    const ids = Array.from({length: 10}, (_, index) => String(1001 + index));
    expect(() => parseTeamConstraints({sameTeamPairs: ids.slice(0, 5).map((id, index) => ({
      firstDiscordUserId: id,
      secondDiscordUserId: ids[index + 1],
    }))}, ids)).toThrow("최대 5명");
  });
});
