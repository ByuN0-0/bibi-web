import {describe, expect, it} from "vitest";
import {selectRiotAccountLookup} from "@/lib/lol/riot-account";

describe("selectRiotAccountLookup", () => {
  it("uses PUUID even if the stored Riot ID is outdated", () => {
    expect(selectRiotAccountLookup({
      puuid: "stable-puuid",
      riotGameName: "old-name",
      riotTagLine: "OLD",
    })).toEqual({kind: "PUUID", puuid: "stable-puuid"});
  });

  it("uses Riot ID only before the first PUUID sync", () => {
    expect(selectRiotAccountLookup({
      puuid: null,
      riotGameName: "first-name",
      riotTagLine: "KR1",
    })).toEqual({kind: "RIOT_ID", gameName: "first-name", tagLine: "KR1"});
  });
});
