import {describe, expect, it} from "vitest";
import fixture from "@/test/fixtures/team-balancing-v1.json";
import {balanceTeam, javaRandom} from "@/lib/lol/team-balancer";
import {ALGORITHM_VERSION, ROLES, type PlayerProfile, type RoleStats} from "@/lib/lol/types";
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
  it("matches the shared seeded fixture", () => {
    const result = balanceTeam(players(), [], new Set(), javaRandom(fixture.seed));
    expect(result.algorithmVersion).toBe(fixture.algorithmVersion);
    expect(result.signature).toBe(fixture.expectedSignature);
    expect([...result.blue, ...result.red]).toHaveLength(10);
    expect(new Set([...result.blue, ...result.red].map((player) => player.discordUserId)).size).toBe(10);
    expect([...result.blue, ...result.red].every((player) => !player.offRole)).toBe(true);
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
});

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
