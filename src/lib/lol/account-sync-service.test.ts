import {beforeEach, describe, expect, it, vi} from "vitest";
import type {PlayerProfile, RiotAccountProfile, RiotAccountSyncControl} from "@/lib/lol/types";

const mocks = vi.hoisted(() => ({
  findPlayer: vi.fn(), findAccount: vi.fn(), getControl: vi.fn(), listAccounts: vi.fn(), listPlayers: vi.fn(),
  migrate: vi.fn(), replaceControl: vi.fn(), replaceAccount: vi.fn(), savePlayer: vi.fn(), loadRiot: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/lol/repository", () => ({
  findPlayer: mocks.findPlayer,
  findPlayerAccount: mocks.findAccount,
  getAccountSyncControlDocument: mocks.getControl,
  listNormalizedPlayerAccounts: mocks.listAccounts,
  listPlayers: mocks.listPlayers,
  migratePlayerAccounts: mocks.migrate,
  replaceAccountSyncControl: mocks.replaceControl,
  replacePlayerAccount: mocks.replaceAccount,
  savePlayer: mocks.savePlayer,
  PlayerPuuidConflictError: class PlayerPuuidConflictError extends Error {},
}));
vi.mock("@/lib/lol/riot-client", () => ({
  loadRiotAccountProfile: mocks.loadRiot,
  RiotApiError: class RiotApiError extends Error { constructor(readonly status: number) { super(); } },
}));
vi.mock("@/lib/lol/rating-calculator", () => ({calculateRoleStats: vi.fn(() => ({}))}));

import {
  ACCOUNT_SYNC_INTERVAL_MS,
  AccountSyncError,
  getAccountSyncDashboard,
  syncRiotAccountFromWeb,
} from "@/lib/lol/account-sync-service";

describe("account sync service", () => {
  let account: RiotAccountProfile;
  let player: PlayerProfile;
  let control: RiotAccountSyncControl;
  let controlEtag: string;
  let controlVersion: number;

  beforeEach(() => {
    account = makeAccount("account-1", 0);
    player = makePlayer();
    control = makeControl();
    controlVersion = 1;
    controlEtag = `control-${controlVersion}`;
    mocks.migrate.mockReset().mockResolvedValue(undefined);
    mocks.findPlayer.mockReset().mockImplementation(async () => document("player", player));
    mocks.findAccount.mockReset().mockImplementation(async (accountId: string) => accountId === account.accountId ? document(accountId, account) : null);
    mocks.getControl.mockReset().mockImplementation(async () => ({id: "control", etag: controlEtag, value: {...control}}));
    mocks.listAccounts.mockReset().mockImplementation(async (discordUserId?: string) => !discordUserId || discordUserId === account.discordUserId ? [{...account}] : []);
    mocks.listPlayers.mockReset().mockImplementation(async () => [{...player}]);
    mocks.replaceControl.mockReset().mockImplementation(async (doc: {etag: string}, next: RiotAccountSyncControl) => {
      if (doc.etag !== controlEtag) throw new Error("SODA_CONFLICT");
      control = {...next};
      controlVersion += 1;
      controlEtag = `control-${controlVersion}`;
    });
    mocks.replaceAccount.mockReset().mockImplementation(async (next: RiotAccountProfile) => { account = {...next}; });
    mocks.savePlayer.mockReset().mockImplementation(async (next: PlayerProfile) => { player = {...next}; });
    mocks.loadRiot.mockReset().mockResolvedValue(syncData());
  });

  it("allows only one active account and enforces two minutes from the start", async () => {
    let resolveRiot!: (value: ReturnType<typeof syncData>) => void;
    mocks.loadRiot.mockImplementationOnce(() => new Promise((resolve) => { resolveRiot = resolve; }));
    const first = syncRiotAccountFromWeb(account.accountId, 1_000);
    await vi.waitFor(() => expect(mocks.loadRiot).toHaveBeenCalledTimes(1));

    await expect(syncRiotAccountFromWeb(account.accountId, 2_000)).rejects.toMatchObject({status: 409});
    resolveRiot(syncData());
    await first;
    await expect(syncRiotAccountFromWeb(account.accountId, 1_000 + ACCOUNT_SYNC_INTERVAL_MS - 1))
      .rejects.toMatchObject({status: 429, retryAt: 1_000 + ACCOUNT_SYNC_INTERVAL_MS});
  });

  it("recovers an expired lease as a failed account", async () => {
    account = {...account, syncStatus: "SYNCING", lastSyncStartedAt: 1_000};
    control = {...control, activeAccountId: account.accountId, leaseExpiresAt: 2_000};
    const dashboard = await getAccountSyncDashboard(2_001);

    expect(account).toMatchObject({syncStatus: "FAILED", syncErrorCode: "SYNC_TIMEOUT"});
    expect(dashboard.activeAccountId).toBeNull();
  });

  it("sorts never-synced and older accounts first", async () => {
    const newer = makeAccount("account-2", 20_000);
    account = {...account, lastSyncedAt: 10_000, syncStatus: "READY"};
    mocks.listAccounts.mockResolvedValue([newer, account]);
    const dashboard = await getAccountSyncDashboard(30_000);
    expect(dashboard.accounts.map((value) => value.accountId)).toEqual(["account-1", "account-2"]);
  });

  it("rebuilds the player from every linked account", async () => {
    const other = {...makeAccount("account-2", 20_000), soloRank: {...rank, tier: "DIAMOND"}};
    mocks.listAccounts.mockImplementation(async (discordUserId?: string) =>
      !discordUserId || discordUserId === account.discordUserId ? [account, other] : []);

    await syncRiotAccountFromWeb(account.accountId, 1_000);

    expect(player).toMatchObject({syncStatus: "READY", soloRank: {tier: "DIAMOND"}});
  });

  it("keeps the last successful snapshot when a refresh fails", async () => {
    account = makeAccount("account-1", 10_000);
    mocks.loadRiot.mockRejectedValueOnce(new Error("network"));

    await expect(syncRiotAccountFromWeb(account.accountId, 20_000)).rejects.toThrow("network");
    expect(account).toMatchObject({syncStatus: "FAILED", lastSyncedAt: 10_000, syncErrorCode: "SYNC_FAILED"});
    expect(player.syncStatus).toBe("READY");
  });

  it("surfaces cooldown errors as AccountSyncError", async () => {
    control = {...control, nextAllowedAt: 50_000};
    await expect(syncRiotAccountFromWeb(account.accountId, 49_000)).rejects.toBeInstanceOf(AccountSyncError);
  });
});

const rank = {tier: "GOLD", division: "I", leaguePoints: 10, wins: 1, losses: 1};
function makeAccount(accountId: string, lastSyncedAt: number): RiotAccountProfile {
  return {schemaVersion: 2, accountId, discordUserId: "123456789", isPrimary: accountId === "account-1", riotGameName: accountId, riotTagLine: "KR1", puuid: lastSyncedAt ? `puuid-${accountId}` : null, soloRank: rank, flexRank: rank, recentMatches: [], recentRoleMatches: [], latestScannedMatchId: null, syncStatus: lastSyncedAt ? "READY" : "UNSYNCED", lastSyncStartedAt: 0, lastSyncedAt, syncErrorCode: lastSyncedAt ? null : "SYNC_REQUIRED", revision: 1, createdAt: 1, updatedAt: 1};
}
function makePlayer(): PlayerProfile {
  return {schemaVersion: 2, discordUserId: "123456789", displayName: "비비", riotGameName: "account-1", riotTagLine: "KR1", puuid: null, summonerId: null, primaryRole: "TOP", secondaryRole: "JUNGLE", soloRank: rank, flexRank: rank, recentMatches: [], roleStats: {}, recentRoleCounts: {}, recentRoleSampleCount: 0, syncStatus: "FAILED", syncRequestedAt: 0, lastSyncStartedAt: 0, lastSyncedAt: 0, syncErrorCode: "SYNC_REQUIRED", revision: 1, createdAt: 1, updatedAt: 1};
}
function makeControl(): RiotAccountSyncControl {
  return {schemaVersion: 1, controlId: "global", activeAccountId: null, lastStartedAt: 0, nextAllowedAt: 0, leaseExpiresAt: 0, revision: 1, updatedAt: 0};
}
function syncData() {
  return {riotGameName: "synced", riotTagLine: "KR1", puuid: "puuid-account-1", soloRank: rank, flexRank: rank, recentMatches: [], recentRoleMatches: [], latestScannedMatchId: null};
}
function document<T>(id: string, value: T) { return {id, etag: `${id}-${(value as {revision?: number}).revision ?? 1}`, value}; }
