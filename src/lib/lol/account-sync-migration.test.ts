import {describe, expect, it, vi} from "vitest";
import type {PlayerProfile, RiotAccountProfile} from "@/lib/lol/types";

vi.mock("server-only", () => ({}));

import {normalizePlayerAccount} from "@/lib/lol/repository";

describe("account sync schema migration", () => {
  it("backfills a legacy synced account from its player snapshot", () => {
    const player = makePlayer();
    const migrated = normalizePlayerAccount(legacyAccount({puuid: "puuid"}), player);

    expect(migrated).toMatchObject({
      schemaVersion: 2,
      syncStatus: "READY",
      lastSyncStartedAt: player.lastSyncStartedAt,
      lastSyncedAt: player.lastSyncedAt,
      recentMatches: player.recentMatches,
    });
  });

  it("marks a legacy account without PUUID as never synced", () => {
    const migrated = normalizePlayerAccount(legacyAccount({puuid: null}), makePlayer());
    expect(migrated).toMatchObject({syncStatus: "UNSYNCED", lastSyncedAt: 0, syncErrorCode: "SYNC_REQUIRED"});
  });
});

function legacyAccount(patch: {puuid: string | null}) {
  return {
    schemaVersion: 1, accountId: "account-1", discordUserId: "123456789", isPrimary: true,
    riotGameName: "비비", riotTagLine: "KR1", puuid: patch.puuid, soloRank: rank, flexRank: rank,
    recentRoleMatches: [], latestScannedMatchId: null, syncErrorCode: null,
    revision: 1, createdAt: 1, updatedAt: 1,
  } as unknown as RiotAccountProfile;
}

const rank = {tier: "GOLD", division: "I", leaguePoints: 10, wins: 1, losses: 1};
function makePlayer(): PlayerProfile {
  return {schemaVersion: 2, discordUserId: "123456789", displayName: "비비", riotGameName: "비비", riotTagLine: "KR1", puuid: "puuid", summonerId: null, primaryRole: "TOP", secondaryRole: "JUNGLE", soloRank: rank, flexRank: rank, recentMatches: [{matchId: "match-1", playedAt: 1, queueId: 420, role: "TOP", goldDiff15: 1, xpDiff15: 1, csDiff15: 1, damagePerGoldDiff: 1, killParticipationDiff: 1, visionPerMinuteDiff: 1, crowdControlPerMinuteDiff: 1, objectiveParticipationDiff: 1, deathRateDiff: 1}], roleStats: {}, recentRoleCounts: {}, recentRoleSampleCount: 0, syncStatus: "READY", syncRequestedAt: 0, lastSyncStartedAt: 8_000, lastSyncedAt: 10_000, syncErrorCode: null, revision: 1, createdAt: 1, updatedAt: 1};
}
