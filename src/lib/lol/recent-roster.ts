import type {PlayerProfile} from "@/lib/lol/types";

export const RECENT_ROSTER_STORAGE_KEY = "bibi.lol.recent-roster.v1";

export type RecentRosterResolution =
  | {status: "empty" | "invalid"}
  | {status: "valid"; playerIds: string[]};

export function resolveRecentRoster(
  value: unknown,
  players: Pick<PlayerProfile, "discordUserId" | "syncStatus">[],
): RecentRosterResolution {
  if (value === null || value === undefined) return {status: "empty"};
  if (!Array.isArray(value) || value.length !== 10 || !value.every((id) => typeof id === "string")) {
    return {status: "invalid"};
  }
  const playerIds = value as string[];
  if (new Set(playerIds).size !== 10) return {status: "invalid"};
  const readyIds = new Set(
    players.filter((player) => player.syncStatus === "READY").map((player) => player.discordUserId),
  );
  return playerIds.every((id) => readyIds.has(id))
    ? {status: "valid", playerIds: [...playerIds]}
    : {status: "invalid"};
}

export function toggleRosterPlayer(selected: string[], discordUserId: string, limit = 10) {
  return selected.includes(discordUserId)
    ? selected.filter((id) => id !== discordUserId)
    : selected.length < limit ? [...selected, discordUserId] : selected;
}
