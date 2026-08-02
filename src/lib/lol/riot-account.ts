import type {PlayerProfile} from "@/lib/lol/types";

export type RiotAccountLookup =
  | {kind: "PUUID"; puuid: string}
  | {kind: "RIOT_ID"; gameName: string; tagLine: string};

export function selectRiotAccountLookup(
  player: Pick<PlayerProfile, "puuid" | "riotGameName" | "riotTagLine">,
): RiotAccountLookup {
  return player.puuid
    ? {kind: "PUUID", puuid: player.puuid}
    : {kind: "RIOT_ID", gameName: player.riotGameName, tagLine: player.riotTagLine};
}
