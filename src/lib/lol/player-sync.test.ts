import {describe, expect, it} from "vitest";
import {
  MANUAL_SYNC_COOLDOWN_MS,
  syncRequestAvailability,
} from "@/lib/lol/player-sync";
import type {PlayerProfile} from "@/lib/lol/types";

const now = 2_000_000;

function player(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    schemaVersion: 1,
    discordUserId: "123456789",
    displayName: "비비",
    riotGameName: "BIBI",
    riotTagLine: "KR1",
    puuid: "puuid",
    summonerId: "summoner-id",
    primaryRole: "TOP",
    secondaryRole: "JUNGLE",
    soloRank: {tier: "GOLD", division: "I", leaguePoints: 0, wins: 1, losses: 1},
    flexRank: {tier: "UNRANKED", division: "", leaguePoints: 0, wins: 0, losses: 0},
    recentMatches: [],
    roleStats: {},
    syncStatus: "READY",
    syncRequestedAt: 0,
    lastSyncStartedAt: 0,
    lastSyncedAt: 0,
    syncErrorCode: null,
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("syncRequestAvailability", () => {
  it("allows a request after the cooldown", () => {
    expect(syncRequestAvailability(player({
      syncRequestedAt: now - MANUAL_SYNC_COOLDOWN_MS,
    }), now)).toEqual({status: "ALLOWED"});
  });

  it("returns the retry time during the cooldown", () => {
    const syncRequestedAt = now - 1_000;
    expect(syncRequestAvailability(player({syncRequestedAt}), now)).toEqual({
      status: "COOLDOWN",
      retryAt: syncRequestedAt + MANUAL_SYNC_COOLDOWN_MS,
    });
  });

  it.each([
    ["REQUESTED", "ALREADY_REQUESTED"],
    ["SYNCING", "SYNCING"],
  ] as const)("does not overwrite a %s player", (syncStatus, status) => {
    expect(syncRequestAvailability(player({syncStatus, lastSyncStartedAt: now - 1_000}), now)).toEqual({status});
  });

  it("allows a stale web sync to recover", () => {
    expect(syncRequestAvailability(player({
      syncStatus: "SYNCING",
      syncRequestedAt: 1,
      lastSyncStartedAt: 1,
    }), now)).toEqual({status: "ALLOWED"});
  });
});
