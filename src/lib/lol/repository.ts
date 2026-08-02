import "server-only";
import {soda, type SodaDocument} from "@/lib/soda";
import type {
  PlayerProfile,
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
  drafts: "bibi_lol_team_drafts",
  sessions: "bibi_lol_team_sessions",
  status: "bibi_lol_system_status",
  loginAttempts: "bibi_web_login_attempts",
} as const;

export class PlayerPuuidConflictError extends Error {
  constructor() {
    super("이미 다른 Discord 계정에 등록된 Riot 계정입니다.");
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
