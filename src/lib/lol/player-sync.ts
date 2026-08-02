import type {PlayerProfile} from "@/lib/lol/types";

export const MANUAL_SYNC_COOLDOWN_MS = 15 * 60 * 1000;
export const SYNC_STALE_AFTER_MS = 15 * 60 * 1000;

export type SyncRequestResult = {
  discordUserId: string;
  status: "ALLOWED" | "REQUESTED" | "ALREADY_REQUESTED" | "SYNCING" | "COOLDOWN" | "NOT_FOUND" | "CONFLICT";
  retryAt?: number;
};

export function syncRequestAvailability(
  player: PlayerProfile,
  now = Date.now(),
): Pick<SyncRequestResult, "status" | "retryAt"> {
  if (player.syncStatus === "REQUESTED") return {status: "ALREADY_REQUESTED"};
  if (player.syncStatus === "SYNCING"
      && (player.lastSyncStartedAt <= 0 || now - player.lastSyncStartedAt < SYNC_STALE_AFTER_MS)) {
    return {status: "SYNCING"};
  }

  const retryAt = player.syncRequestedAt + MANUAL_SYNC_COOLDOWN_MS;
  if (player.syncRequestedAt > 0 && retryAt > now) {
    return {status: "COOLDOWN", retryAt};
  }
  return {status: "ALLOWED"};
}
