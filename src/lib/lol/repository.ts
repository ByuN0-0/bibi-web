import "server-only";
import {soda, type SodaDocument} from "@/lib/soda";
import type {
  PlayerProfile,
  SystemStatus,
  TeamDraft,
  TeamSession,
} from "@/lib/lol/types";
import type {LoginAttemptState} from "@/lib/login-rate-limit";

export const COLLECTIONS = {
  players: "bibi_lol_players",
  drafts: "bibi_lol_team_drafts",
  sessions: "bibi_lol_team_sessions",
  status: "bibi_lol_system_status",
  loginAttempts: "bibi_web_login_attempts",
} as const;

let collectionInitialization: Promise<void> | null = null;
let loginCollectionInitialization: Promise<void> | null = null;

export async function ensureCollections() {
  if (!collectionInitialization) {
    collectionInitialization = Promise.all(
      Object.values(COLLECTIONS).map((name) => soda.ensureCollection(name)),
    ).then(() => undefined).catch((error) => {
      collectionInitialization = null;
      throw error;
    });
  }
  await collectionInitialization;
}

export async function ensureLoginCollection() {
  if (!loginCollectionInitialization) {
    loginCollectionInitialization = soda.ensureCollection(COLLECTIONS.loginAttempts)
      .catch((error) => {
        loginCollectionInitialization = null;
        throw error;
      });
  }
  await loginCollectionInitialization;
}

async function findOne<T>(collection: string, filter: Record<string, unknown>) {
  return (await soda.query<T>(collection, filter))[0] ?? null;
}

async function upsert<T>(
  collection: string,
  filter: Record<string, unknown>,
  value: T,
) {
  const existing = await findOne<T>(collection, filter);
  if (existing) await soda.replace(collection, existing, value);
  else await soda.insert(collection, value);
}

export async function listPlayers(): Promise<PlayerProfile[]> {
  return (await soda.list<PlayerProfile>(COLLECTIONS.players))
    .map((document) => document.value)
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "ko"));
}

export async function findPlayer(discordUserId: string) {
  return findOne<PlayerProfile>(COLLECTIONS.players, {discordUserId});
}

export async function savePlayer(profile: PlayerProfile) {
  await upsert(COLLECTIONS.players, {discordUserId: profile.discordUserId}, profile);
}

export async function requestPlayerSync(discordUserId: string, now = Date.now()) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const document = await findPlayer(discordUserId);
    if (!document) return false;
    const requested: PlayerProfile = {
      ...document.value,
      syncStatus: "REQUESTED",
      syncRequestedAt: now,
      syncErrorCode: null,
      revision: document.value.revision + 1,
      updatedAt: now,
    };
    try {
      await soda.replace(COLLECTIONS.players, document, requested);
      return true;
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "SODA_CONFLICT" || attempt === 2) {
        throw error;
      }
    }
  }
  return false;
}

export async function deletePlayer(discordUserId: string) {
  const player = await findPlayer(discordUserId);
  if (player) await soda.delete(COLLECTIONS.players, player);
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
  return (await soda.list<TeamSession>(COLLECTIONS.sessions))
    .map((document) => document.value)
    .sort((left, right) => right.confirmedAt - left.confirmedAt)
    .slice(0, limit);
}

export async function listAllSessions(): Promise<TeamSession[]> {
  return listRecentSessions(1000);
}

export async function saveSession(session: TeamSession) {
  await soda.insert(COLLECTIONS.sessions, session);
}

export async function findDraft(draftId: string) {
  return findOne<TeamDraft>(COLLECTIONS.drafts, {draftId});
}

export async function saveDraft(draft: TeamDraft) {
  await upsert(COLLECTIONS.drafts, {draftId: draft.draftId}, draft);
}

export async function latestSystemStatus(): Promise<SystemStatus | null> {
  const statuses = (await soda.list<SystemStatus>(COLLECTIONS.status))
    .map((document) => document.value)
    .sort((left, right) => right.heartbeatAt - left.heartbeatAt);
  return statuses[0] ?? null;
}

export type LoginAttempt = LoginAttemptState;

export async function getLoginAttempt(ipHash: string) {
  return findOne<LoginAttempt>(COLLECTIONS.loginAttempts, {ipHash});
}

export async function saveLoginAttempt(attempt: LoginAttempt) {
  await upsert(COLLECTIONS.loginAttempts, {ipHash: attempt.ipHash}, attempt);
}

export async function clearLoginAttempt(document: SodaDocument<LoginAttempt> | null) {
  if (document) await soda.delete(COLLECTIONS.loginAttempts, document);
}
