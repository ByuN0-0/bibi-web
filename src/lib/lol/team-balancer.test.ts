import {describe, expect, it} from "vitest";
import fixture from "@/test/fixtures/team-balancing-v1.json";
import {balanceTeam, javaRandom} from "@/lib/lol/team-balancer";
import {ALGORITHM_VERSION, ROLES, type PlayerProfile, type RoleStats} from "@/lib/lol/types";

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
});
