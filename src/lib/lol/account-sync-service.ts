import "server-only";
import {
  findPlayer,
  findPlayerAccount,
  getAccountSyncControlDocument,
  listNormalizedPlayerAccounts,
  listPlayers,
  migratePlayerAccounts,
  replaceAccountSyncControl,
  replacePlayerAccount,
  savePlayer,
  PlayerPuuidConflictError,
} from "@/lib/lol/repository";
import {calculateRoleStats} from "@/lib/lol/rating-calculator";
import {loadRiotAccountProfile, RiotApiError} from "@/lib/lol/riot-client";
import type {
  PlayerProfile,
  RankInfo,
  RiotAccountProfile,
  RiotAccountSyncControl,
  RiotAccountSyncRow,
  Role,
} from "@/lib/lol/types";

export const ACCOUNT_SYNC_INTERVAL_MS = 2 * 60 * 1000;
export const ACCOUNT_SYNC_LEASE_MS = 6 * 60 * 1000;

export class AccountSyncError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAt?: number,
  ) {
    super(message);
  }
}

export async function getAccountSyncDashboard(now = Date.now()): Promise<{
  accounts: RiotAccountSyncRow[];
  activeAccountId: string | null;
  nextAllowedAt: number;
}> {
  await migratePlayerAccounts();
  await recoverStaleAccountSync(now);
  const [accounts, players, control] = await Promise.all([
    listNormalizedPlayerAccounts(),
    listPlayers(),
    getAccountSyncControlDocument(),
  ]);
  const names = new Map(players.map((player) => [player.discordUserId, player.displayName]));
  return {
    accounts: accounts
      .map((account) => ({...account, displayName: names.get(account.discordUserId) ?? account.discordUserId}))
      .sort((left, right) => accountOrder(left, right, control.value.activeAccountId)),
    activeAccountId: control.value.activeAccountId,
    nextAllowedAt: control.value.nextAllowedAt,
  };
}

export async function syncRiotAccountFromWeb(accountId: string, now = Date.now()) {
  const claimed = await claimAccountSync(accountId, now);
  try {
    const data = await loadRiotAccountProfile(claimed);
    const current = await findPlayerAccount(accountId);
    if (!current || current.value.revision !== claimed.revision || current.value.syncStatus !== "SYNCING") {
      throw new AccountSyncError("갱신 중 계정 정보가 변경되었습니다. 다시 시도해 주세요.", 409);
    }
    const duplicates = (await listNormalizedPlayerAccounts()).some((account) =>
      account.accountId !== accountId && account.puuid === data.puuid);
    if (duplicates) throw new PlayerPuuidConflictError();
    const completedAt = Date.now();
    const synced: RiotAccountProfile = {
      ...current.value,
      ...data,
      schemaVersion: 2,
      syncStatus: "READY",
      lastSyncedAt: completedAt,
      syncErrorCode: null,
      revision: current.value.revision + 1,
      updatedAt: completedAt,
    };
    await replacePlayerAccount(synced);
    await rebuildPlayerFromAccounts(synced.discordUserId, completedAt);
    return synced;
  } catch (error) {
    const errorCode = error instanceof PlayerPuuidConflictError
      ? "DUPLICATE_PUUID"
      : error instanceof RiotApiError
        ? `RIOT_HTTP_${error.status}`
        : error instanceof Error && error.message.startsWith("Missing required environment variable")
          ? "CONFIGURATION_ERROR"
          : error instanceof AccountSyncError && error.status === 409
            ? "SYNC_CONFLICT"
            : "SYNC_FAILED";
    await failAccountSync(accountId, errorCode);
    if (error instanceof PlayerPuuidConflictError) throw new AccountSyncError(error.message, 409);
    throw error;
  } finally {
    await releaseAccountSync(accountId);
  }
}

async function claimAccountSync(accountId: string, now: number) {
  await migratePlayerAccounts();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await recoverStaleAccountSync(now);
    const [accountDocument, controlDocument] = await Promise.all([
      findPlayerAccount(accountId),
      getAccountSyncControlDocument(),
    ]);
    if (!accountDocument) throw new AccountSyncError("Riot 계정을 찾을 수 없습니다.", 404);
    const control = controlDocument.value;
    if (control.activeAccountId) throw new AccountSyncError("다른 Riot 계정을 갱신하고 있습니다.", 409);
    if (control.nextAllowedAt > now) {
      throw new AccountSyncError("Riot 계정은 전체 기준 2분에 하나만 갱신할 수 있습니다.", 429, control.nextAllowedAt);
    }
    const nextControl: RiotAccountSyncControl = {
      ...control,
      activeAccountId: accountId,
      lastStartedAt: now,
      nextAllowedAt: now + ACCOUNT_SYNC_INTERVAL_MS,
      leaseExpiresAt: now + ACCOUNT_SYNC_LEASE_MS,
      revision: control.revision + 1,
      updatedAt: now,
    };
    try {
      await replaceAccountSyncControl(controlDocument, nextControl);
    } catch (error) {
      if (error instanceof Error && error.message === "SODA_CONFLICT" && attempt < 3) continue;
      throw error;
    }
    const normalized = (await listNormalizedPlayerAccounts(accountDocument.value.discordUserId))
      .find((account) => account.accountId === accountId);
    if (!normalized) {
      await releaseAccountSync(accountId);
      throw new AccountSyncError("Riot 계정을 찾을 수 없습니다.", 404);
    }
    const syncing: RiotAccountProfile = {
      ...normalized,
      syncStatus: "SYNCING",
      lastSyncStartedAt: now,
      syncErrorCode: null,
      revision: normalized.revision + 1,
      updatedAt: now,
    };
    try {
      await replacePlayerAccount(syncing);
      await markPlayerSyncing(syncing.discordUserId, now);
      return syncing;
    } catch (error) {
      await releaseAccountSync(accountId);
      throw error;
    }
  }
  throw new AccountSyncError("갱신 요청이 충돌했습니다. 다시 시도해 주세요.", 409);
}

async function recoverStaleAccountSync(now: number) {
  const controlDocument = await getAccountSyncControlDocument();
  const control = controlDocument.value;
  if (!control.activeAccountId || control.leaseExpiresAt > now) return;
  await failAccountSync(control.activeAccountId, "SYNC_TIMEOUT");
  try {
    await replaceAccountSyncControl(controlDocument, {
      ...control,
      activeAccountId: null,
      leaseExpiresAt: 0,
      revision: control.revision + 1,
      updatedAt: now,
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "SODA_CONFLICT") throw error;
  }
}

async function releaseAccountSync(accountId: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const document = await getAccountSyncControlDocument();
    if (document.value.activeAccountId !== accountId) return;
    try {
      await replaceAccountSyncControl(document, {
        ...document.value,
        activeAccountId: null,
        leaseExpiresAt: 0,
        revision: document.value.revision + 1,
        updatedAt: Date.now(),
      });
      return;
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "SODA_CONFLICT" || attempt === 2) throw error;
    }
  }
}

async function failAccountSync(accountId: string, errorCode: string) {
  const document = await findPlayerAccount(accountId);
  if (!document) return;
  const failed: RiotAccountProfile = {
    ...document.value,
    schemaVersion: 2,
    recentMatches: document.value.recentMatches ?? [],
    syncStatus: "FAILED",
    lastSyncStartedAt: document.value.lastSyncStartedAt ?? 0,
    lastSyncedAt: document.value.lastSyncedAt ?? 0,
    syncErrorCode: errorCode,
    revision: document.value.revision + 1,
    updatedAt: Date.now(),
  };
  try {
    await replacePlayerAccount(failed);
    await rebuildPlayerFromAccounts(failed.discordUserId, Date.now());
  } catch (error) {
    console.error("[lol-account-sync] failed to persist account failure", error);
  }
}

async function markPlayerSyncing(discordUserId: string, now: number) {
  const document = await findPlayer(discordUserId);
  if (!document) return;
  await savePlayer({
    ...document.value,
    syncStatus: "SYNCING",
    syncRequestedAt: now,
    lastSyncStartedAt: now,
    syncErrorCode: null,
    revision: document.value.revision + 1,
    updatedAt: now,
  });
}

export async function rebuildPlayerFromAccounts(discordUserId: string, now = Date.now()) {
  const [playerDocument, accounts] = await Promise.all([
    findPlayer(discordUserId),
    listNormalizedPlayerAccounts(discordUserId),
  ]);
  if (!playerDocument) return;
  const snapshots = accounts.filter((account) => account.puuid && account.lastSyncedAt > 0);
  if (!snapshots.length) {
    await savePlayer({
      ...playerDocument.value,
      syncStatus: "FAILED",
      syncErrorCode: accounts.find((account) => account.syncErrorCode)?.syncErrorCode ?? "SYNC_REQUIRED",
      revision: playerDocument.value.revision + 1,
      updatedAt: now,
    });
    return;
  }
  const primary = accounts.find((account) => account.isPrimary) ?? accounts[0];
  const soloRank = bestRank(snapshots.map((account) => account.soloRank));
  const flexRank = bestRank(snapshots.map((account) => account.flexRank));
  const recentMatches = uniqueNewest(snapshots.flatMap((account) => account.recentMatches ?? []), 30);
  const recentRoles = uniqueNewest(snapshots.flatMap((account) => account.recentRoleMatches ?? []), 50);
  const recentRoleCounts: Partial<Record<Role, number>> = {};
  recentRoles.forEach((match) => { recentRoleCounts[match.role] = (recentRoleCounts[match.role] ?? 0) + 1; });
  const lastSyncedAt = Math.max(...snapshots.map((account) => account.lastSyncedAt));
  const lastSyncStartedAt = Math.max(...accounts.map((account) => account.lastSyncStartedAt));
  const synced: PlayerProfile = {
    ...playerDocument.value,
    riotGameName: primary.riotGameName,
    riotTagLine: primary.riotTagLine,
    puuid: primary.puuid,
    soloRank,
    flexRank,
    recentMatches,
    roleStats: calculateRoleStats(soloRank, flexRank, recentMatches, now),
    recentRoleCounts,
    recentRoleSampleCount: recentRoles.length,
    syncStatus: "READY",
    lastSyncStartedAt,
    lastSyncedAt,
    syncErrorCode: null,
    revision: playerDocument.value.revision + 1,
    updatedAt: now,
  };
  await savePlayer(synced);
}

function uniqueNewest<T extends {matchId: string; playedAt: number}>(values: T[], limit: number): T[] {
  const seen = new Set<string>();
  return [...values]
    .sort((left, right) => right.playedAt - left.playedAt || left.matchId.localeCompare(right.matchId))
    .filter((value) => !seen.has(value.matchId) && !!seen.add(value.matchId))
    .slice(0, limit);
}

function bestRank(ranks: RankInfo[]) {
  return ranks.reduce((best, rank) => rankScore(rank) > rankScore(best) ? rank : best, unranked());
}

function rankScore(rank: RankInfo) {
  const tier = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"].indexOf(rank.tier);
  const division = ["IV", "III", "II", "I"].indexOf(rank.division);
  return tier < 0 ? -1 : tier * 400 + Math.max(division, 0) * 100 + rank.leaguePoints;
}

function unranked(): RankInfo {
  return {tier: "UNRANKED", division: "", leaguePoints: 0, wins: 0, losses: 0};
}

function accountOrder(left: RiotAccountSyncRow, right: RiotAccountSyncRow, activeAccountId: string | null) {
  if (left.accountId === activeAccountId) return -1;
  if (right.accountId === activeAccountId) return 1;
  return left.lastSyncedAt - right.lastSyncedAt
    || left.displayName.localeCompare(right.displayName, "ko")
    || left.accountId.localeCompare(right.accountId);
}
