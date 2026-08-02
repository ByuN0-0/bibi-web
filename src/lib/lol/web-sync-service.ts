import "server-only";
import {
  claimPlayerWebSync,
  completePlayerWebSync,
  failPlayerWebSync,
  PlayerPuuidConflictError,
} from "@/lib/lol/repository";
import {loadRiotProfile, RiotApiError} from "@/lib/lol/riot-client";
import type {SyncRequestResult} from "@/lib/lol/player-sync";

export class WebSyncError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAt?: number,
  ) {
    super(message);
  }
}

export async function syncPlayerFromWeb(discordUserId: string) {
  const claim = await claimPlayerWebSync(discordUserId);
  if (!claim.player) throw unavailable(claim.result);
  const player = claim.player;
  try {
    const data = await loadRiotProfile(player);
    const synced = await completePlayerWebSync(discordUserId, player.revision, data);
    if (!synced) throw new WebSyncError("갱신 중 선수 정보가 변경되었습니다. 다시 시도해 주세요.", 409);
    return synced;
  } catch (error) {
    const errorCode = error instanceof PlayerPuuidConflictError
      ? "DUPLICATE_PUUID"
      : error instanceof RiotApiError
      ? `RIOT_HTTP_${error.status}`
      : error instanceof Error && error.message.startsWith("Missing required environment variable")
        ? "CONFIGURATION_ERROR"
        : "SYNC_FAILED";
    try {
      await failPlayerWebSync(discordUserId, player.revision, errorCode);
    } catch (saveError) {
      console.error("[lol-web-sync] failed to persist sync failure", saveError);
    }
    if (error instanceof PlayerPuuidConflictError) {
      throw new WebSyncError(error.message, 409);
    }
    throw error;
  }
}

function unavailable(result: SyncRequestResult) {
  if (result.status === "NOT_FOUND") return new WebSyncError("등록된 선수를 찾을 수 없습니다.", 404);
  if (result.status === "ALREADY_REQUESTED") {
    return new WebSyncError("디스코드 봇에서 이미 갱신을 기다리고 있습니다.", 409);
  }
  if (result.status === "SYNCING") return new WebSyncError("이미 롤 계정을 갱신하고 있습니다.", 409);
  if (result.status === "COOLDOWN") {
    return new WebSyncError("롤 계정 갱신은 15분에 한 번 가능합니다.", 429, result.retryAt);
  }
  return new WebSyncError("갱신 요청이 충돌했습니다. 다시 시도해 주세요.", 409);
}
