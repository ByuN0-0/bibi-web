import "server-only";
import {soda, type SodaDocument} from "@/lib/soda";
import type {
  MatchResult,
  InhouseRatingSnapshot,
  PlayerProfile,
  RiotAccountProfile,
  SystemStatus,
  TeamDraft,
  TeamSession,
} from "@/lib/lol/types";
import type {LoginAttemptState} from "@/lib/login-rate-limit";
import {
  syncRequestAvailability,
  type SyncRequestResult,
} from "@/lib/lol/player-sync";

export const COLLECTIONS = {
  players: "bibi_lol_players",
  accounts: "bibi_lol_player_accounts",
  drafts: "bibi_lol_team_drafts",
  sessions: "bibi_lol_team_sessions",
  matchResults: "bibi_lol_match_results",
  ratings: "bibi_lol_inhouse_ratings",
  status: "bibi_lol_system_status",
  loginAttempts: "bibi_web_login_attempts",
} as const;

export class PlayerPuuidConflictError extends Error {
  constructor() {
    super("이미 다른 Discord 계정에 등록된 Riot 계정입니다.");
  }
}

export class PlayerAccountLimitError extends Error {
  constructor() {
    super("Riot 계정은 주계정과 부계정 각 1개까지만 등록할 수 있습니다.");
  }
}

const collectionInitializations = new Map<string, Promise<void>>();

async function ensureCollection(collection: string) {
  let initialization = collectionInitializations.get(collection);
  if (!initialization) {
    initialization = soda.ensureCollection(collection).catch((error) => {
      collectionInitializations.delete(collection);
      throw error;
    });
    collectionInitializations.set(collection, initialization);
  }
  await initialization;
}

export async function ensureCollections() {
  await Promise.all(Object.values(COLLECTIONS).map(ensureCollection));
}

export async function ensureLoginCollection() {
  await ensureCollection(COLLECTIONS.loginAttempts);
}

async function findOne<T>(collection: string, filter: Record<string, unknown>) {
  return (await soda.query<T>(collection, filter))[0] ?? null;
}

async function upsert<T>(
  collection: string,
  filter: Record<string, unknown>,
  value: T,
) {
  await ensureCollection(collection);
  const existing = await findOne<T>(collection, filter);
  if (existing) await soda.replace(collection, existing, value);
  else await soda.insert(collection, value);
}

export async function listPlayers(): Promise<PlayerProfile[]> {
  await ensureCollection(COLLECTIONS.players);
  return (await soda.list<PlayerProfile>(COLLECTIONS.players))
    .map((document) => document.value)
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "ko"));
}

export async function findPlayer(discordUserId: string) {
  await ensureCollection(COLLECTIONS.players);
  return findOne<PlayerProfile>(COLLECTIONS.players, {discordUserId});
}

export async function savePlayer(profile: PlayerProfile) {
  await upsert(COLLECTIONS.players, {discordUserId: profile.discordUserId}, profile);
}

const unranked = () => ({tier: "UNRANKED", division: "", leaguePoints: 0, wins: 0, losses: 0});

export async function listPlayerAccounts(discordUserId?: string): Promise<RiotAccountProfile[]> {
  await ensureCollection(COLLECTIONS.accounts);
  const documents = discordUserId
    ? await soda.query<RiotAccountProfile>(COLLECTIONS.accounts, {discordUserId})
    : await soda.list<RiotAccountProfile>(COLLECTIONS.accounts);
  return documents.map((document) => document.value).sort((left, right) =>
    Number(right.isPrimary) - Number(left.isPrimary) || left.createdAt - right.createdAt);
}

export async function ensurePlayerAccounts(player: PlayerProfile): Promise<RiotAccountProfile[]> {
  const accounts = await listPlayerAccounts(player.discordUserId);
  if (accounts.length) return accounts;
  const now = Date.now();
  const account: RiotAccountProfile = {
    schemaVersion: 1,
    accountId: crypto.randomUUID(),
    discordUserId: player.discordUserId,
    isPrimary: true,
    riotGameName: player.riotGameName,
    riotTagLine: player.riotTagLine,
    puuid: player.puuid,
    soloRank: player.soloRank ?? unranked(),
    flexRank: player.flexRank ?? unranked(),
    recentRoleMatches: [],
    latestScannedMatchId: null,
    syncErrorCode: player.syncErrorCode,
    revision: 1,
    createdAt: player.createdAt || now,
    updatedAt: now,
  };
  await soda.insert(COLLECTIONS.accounts, account);
  return [account];
}

export async function findPlayerAccount(accountId: string) {
  await ensureCollection(COLLECTIONS.accounts);
  return findOne<RiotAccountProfile>(COLLECTIONS.accounts, {accountId});
}

export async function createPlayerAccount(
  discordUserId: string,
  riotGameName: string,
  riotTagLine: string,
): Promise<RiotAccountProfile> {
  const playerDocument = await findPlayer(discordUserId);
  if (!playerDocument) throw new Error("PLAYER_NOT_FOUND");
  const accounts = await ensurePlayerAccounts(playerDocument.value);
  if (accounts.length >= 2) throw new PlayerAccountLimitError();
  const duplicateIdentity = (await listPlayerAccounts()).some((account) =>
    account.riotGameName.toLocaleLowerCase() === riotGameName.toLocaleLowerCase()
      && account.riotTagLine.toLocaleLowerCase() === riotTagLine.toLocaleLowerCase());
  if (duplicateIdentity) throw new PlayerPuuidConflictError();
  const now = Date.now();
  const account: RiotAccountProfile = {
    schemaVersion: 1,
    accountId: crypto.randomUUID(),
    discordUserId,
    isPrimary: false,
    riotGameName,
    riotTagLine,
    puuid: null,
    soloRank: unranked(),
    flexRank: unranked(),
    recentRoleMatches: [],
    latestScannedMatchId: null,
    syncErrorCode: null,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
  await soda.insert(COLLECTIONS.accounts, account);
  await savePlayer({...playerDocument.value, syncStatus: "REQUESTED", syncRequestedAt: now,
    revision: playerDocument.value.revision + 1, updatedAt: now});
  return account;
}

export async function setPrimaryPlayerAccount(discordUserId: string, accountId: string) {
  const accounts = await listPlayerAccounts(discordUserId);
  if (!accounts.some((account) => account.accountId === accountId)) throw new Error("ACCOUNT_NOT_FOUND");
  await Promise.all(accounts.map(async (account) => {
    const document = await findPlayerAccount(account.accountId);
    if (!document || account.isPrimary === (account.accountId === accountId)) return;
    await soda.replace(COLLECTIONS.accounts, document, {
      ...account, isPrimary: account.accountId === accountId, revision: account.revision + 1, updatedAt: Date.now(),
    });
  }));
  const primary = accounts.find((account) => account.accountId === accountId)!;
  const player = await findPlayer(discordUserId);
  if (player) await savePlayer({...player.value, riotGameName: primary.riotGameName,
    riotTagLine: primary.riotTagLine, puuid: primary.puuid, revision: player.value.revision + 1, updatedAt: Date.now()});
}

export async function updatePrimaryPlayerAccount(
  player: PlayerProfile,
  riotGameName: string,
  riotTagLine: string,
) {
  const accounts = await ensurePlayerAccounts(player);
  const primary = accounts.find((account) => account.isPrimary) ?? accounts[0];
  const document = await findPlayerAccount(primary.accountId);
  if (!document) return;
  const identityChanged = primary.riotGameName !== riotGameName || primary.riotTagLine !== riotTagLine;
  await soda.replace(COLLECTIONS.accounts, document, {
    ...primary,
    riotGameName,
    riotTagLine,
    puuid: identityChanged ? null : primary.puuid,
    soloRank: identityChanged ? unranked() : primary.soloRank,
    flexRank: identityChanged ? unranked() : primary.flexRank,
    recentRoleMatches: identityChanged ? [] : primary.recentRoleMatches,
    latestScannedMatchId: identityChanged ? null : primary.latestScannedMatchId ?? null,
    syncErrorCode: null,
    revision: primary.revision + 1,
    updatedAt: Date.now(),
  });
}

export async function deletePlayerAccount(discordUserId: string, accountId: string) {
  const accounts = await listPlayerAccounts(discordUserId);
  if (accounts.length <= 1) throw new Error("LAST_ACCOUNT");
  const target = accounts.find((account) => account.accountId === accountId);
  const document = target ? await findPlayerAccount(accountId) : null;
  if (!target || !document) throw new Error("ACCOUNT_NOT_FOUND");
  await soda.delete(COLLECTIONS.accounts, document);
  if (target.isPrimary) await setPrimaryPlayerAccount(discordUserId, accounts.find((account) => account.accountId !== accountId)!.accountId);
  const player = await findPlayer(discordUserId);
  if (player) await savePlayer({...player.value, syncStatus: "REQUESTED", syncRequestedAt: Date.now(),
    revision: player.value.revision + 1, updatedAt: Date.now()});
}

export async function requestPlayerSync(discordUserId: string, now = Date.now()): Promise<SyncRequestResult> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const document = await findPlayer(discordUserId);
    if (!document) return {discordUserId, status: "NOT_FOUND"};
    const availability = syncRequestAvailability(document.value, now);
    if (availability.status !== "ALLOWED") return {discordUserId, ...availability};
    try {
      await soda.replace(COLLECTIONS.players, document, {...document.value, syncStatus: "REQUESTED",
        syncRequestedAt: now, syncErrorCode: null, revision: document.value.revision + 1, updatedAt: now});
      return {discordUserId, status: "REQUESTED"} as SyncRequestResult;
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "SODA_CONFLICT" || attempt === 2) throw error;
    }
  }
  return {discordUserId, status: "CONFLICT"};
}

export async function claimPlayerWebSync(
  discordUserId: string,
  now = Date.now(),
): Promise<{player: PlayerProfile; result?: never} | {player?: never; result: SyncRequestResult}> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const document = await findPlayer(discordUserId);
    if (!document) return {result: {discordUserId, status: "NOT_FOUND"}};
    const availability = syncRequestAvailability(document.value, now);
    if (availability.status !== "ALLOWED") {
      return {result: {discordUserId, ...availability}};
    }
    const syncing: PlayerProfile = {
      ...document.value,
      syncStatus: "SYNCING",
      syncRequestedAt: now,
      lastSyncStartedAt: now,
      syncErrorCode: null,
      revision: document.value.revision + 1,
      updatedAt: now,
    };
    try {
      await soda.replace(COLLECTIONS.players, document, syncing);
      return {player: syncing};
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "SODA_CONFLICT" || attempt === 2) {
        throw error;
      }
    }
  }
  return {result: {discordUserId, status: "CONFLICT"}};
}

export async function completePlayerWebSync(
  discordUserId: string,
  claimRevision: number,
  data: Pick<PlayerProfile, "riotGameName" | "riotTagLine" | "puuid" | "summonerId" | "soloRank" | "flexRank" | "recentMatches" | "roleStats">,
  now = Date.now(),
) {
  const document = await findPlayer(discordUserId);
  if (!document || document.value.revision !== claimRevision || document.value.syncStatus !== "SYNCING") {
    return null;
  }
  if (data.puuid) {
    const duplicate = (await soda.query<PlayerProfile>(COLLECTIONS.players, {puuid: data.puuid}))
      .some((candidate) => candidate.value.discordUserId !== discordUserId);
    if (duplicate) throw new PlayerPuuidConflictError();
  }
  const synced: PlayerProfile = {
    ...document.value,
    ...data,
    syncStatus: "READY",
    lastSyncedAt: now,
    syncErrorCode: null,
    revision: document.value.revision + 1,
    updatedAt: now,
  };
  await soda.replace(COLLECTIONS.players, document, synced);
  return synced;
}

export async function failPlayerWebSync(
  discordUserId: string,
  claimRevision: number,
  errorCode: string,
  now = Date.now(),
) {
  const document = await findPlayer(discordUserId);
  if (!document || document.value.revision !== claimRevision || document.value.syncStatus !== "SYNCING") {
    return false;
  }
  await soda.replace(COLLECTIONS.players, document, {
    ...document.value,
    syncStatus: "FAILED",
    syncErrorCode: errorCode,
    revision: document.value.revision + 1,
    updatedAt: now,
  } satisfies PlayerProfile);
  return true;
}

export async function deletePlayer(discordUserId: string) {
  const player = await findPlayer(discordUserId);
  if (player) await soda.delete(COLLECTIONS.players, player);
  await ensureCollection(COLLECTIONS.accounts);
  const accounts = await soda.query<RiotAccountProfile>(COLLECTIONS.accounts, {discordUserId});
  await Promise.all(accounts.map((account) => soda.delete(COLLECTIONS.accounts, account)));
  await Promise.all([
    ensureCollection(COLLECTIONS.sessions),
    ensureCollection(COLLECTIONS.drafts),
  ]);
  const sessions = await soda.list<TeamSession>(COLLECTIONS.sessions);
  const drafts = await soda.list<TeamDraft>(COLLECTIONS.drafts);
  await Promise.all([
    ...sessions.filter((document) => hasPlayer(document.value, discordUserId))
      .map((document) => soda.delete(COLLECTIONS.sessions, document)),
    ...drafts.filter((document) => document.value.selectedDiscordUserIds.includes(discordUserId))
      .map((document) => soda.delete(COLLECTIONS.drafts, document)),
  ]);
}

function hasPlayer(session: TeamSession, discordUserId: string) {
  return [...session.composition.blue, ...session.composition.red]
    .some((assignment) => assignment.discordUserId === discordUserId);
}

export async function listRecentSessions(limit = 5): Promise<TeamSession[]> {
  await ensureCollection(COLLECTIONS.sessions);
  return (await soda.list<TeamSession>(COLLECTIONS.sessions))
    .map((document) => document.value)
    .sort((left, right) => right.confirmedAt - left.confirmedAt)
    .slice(0, limit);
}

export async function listAllSessions(): Promise<TeamSession[]> {
  return listRecentSessions(1000);
}

export async function saveSession(session: TeamSession) {
  await ensureCollection(COLLECTIONS.sessions);
  await soda.insert(COLLECTIONS.sessions, session);
}

export async function listMatchResults(): Promise<MatchResult[]> {
  await ensureCollection(COLLECTIONS.matchResults);
  return (await soda.list<MatchResult>(COLLECTIONS.matchResults))
    .map((document) => document.value)
    .sort((left, right) => right.playedOn.localeCompare(left.playedOn) || right.createdAt - left.createdAt);
}

export async function listMatchResultsPage(offset: number, limit: number): Promise<{
  results: MatchResult[];
  nextOffset: number | null;
}> {
  const all = await listMatchResults();
  const results = all.slice(offset, offset + limit);
  const next = offset + results.length;
  return {results, nextOffset: next < all.length ? next : null};
}

export async function findMatchResult(matchResultId: string) {
  await ensureCollection(COLLECTIONS.matchResults);
  return findOne<MatchResult>(COLLECTIONS.matchResults, {matchResultId});
}

export async function findMatchResultByIngestionId(ingestionId: string) {
  await ensureCollection(COLLECTIONS.matchResults);
  return findOne<MatchResult>(COLLECTIONS.matchResults, {ingestionId});
}

export async function saveMatchResult(result: MatchResult) {
  await ensureCollection(COLLECTIONS.matchResults);
  const sameIngestion = await findOne<MatchResult>(COLLECTIONS.matchResults, {ingestionId: result.ingestionId});
  if (sameIngestion) return {created: false as const, result: sameIngestion.value};
  await soda.insert(COLLECTIONS.matchResults, result);
  return {created: true as const, result};
}

export async function replaceMatchResult(
  document: SodaDocument<MatchResult>,
  result: MatchResult,
) {
  await ensureCollection(COLLECTIONS.matchResults);
  await soda.replace(COLLECTIONS.matchResults, document, result);
}

export async function getInhouseRatingSnapshot(): Promise<InhouseRatingSnapshot | null> {
  await ensureCollection(COLLECTIONS.ratings);
  return (await findOne<InhouseRatingSnapshot>(COLLECTIONS.ratings, {snapshotId: "current"}))?.value ?? null;
}

export async function saveInhouseRatingSnapshot(snapshot: InhouseRatingSnapshot) {
  await upsert(COLLECTIONS.ratings, {snapshotId: "current"}, snapshot);
}

export async function findDraft(draftId: string) {
  await ensureCollection(COLLECTIONS.drafts);
  return findOne<TeamDraft>(COLLECTIONS.drafts, {draftId});
}

export async function saveDraft(draft: TeamDraft) {
  await ensureCollection(COLLECTIONS.drafts);
  await upsert(COLLECTIONS.drafts, {draftId: draft.draftId}, draft);
}

export async function latestSystemStatus(): Promise<SystemStatus | null> {
  await ensureCollection(COLLECTIONS.status);
  const statuses = (await soda.list<SystemStatus>(COLLECTIONS.status))
    .map((document) => document.value)
    .sort((left, right) => right.heartbeatAt - left.heartbeatAt);
  return statuses[0] ?? null;
}

export type LoginAttempt = LoginAttemptState;

export async function getLoginAttempt(ipHash: string) {
  await ensureCollection(COLLECTIONS.loginAttempts);
  return findOne<LoginAttempt>(COLLECTIONS.loginAttempts, {ipHash});
}

export async function saveLoginAttempt(attempt: LoginAttempt) {
  await ensureCollection(COLLECTIONS.loginAttempts);
  await upsert(COLLECTIONS.loginAttempts, {ipHash: attempt.ipHash}, attempt);
}

export async function clearLoginAttempt(document: SodaDocument<LoginAttempt> | null) {
  await ensureCollection(COLLECTIONS.loginAttempts);
  if (document) await soda.delete(COLLECTIONS.loginAttempts, document);
}
