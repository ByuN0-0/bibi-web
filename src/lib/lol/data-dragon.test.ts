import {beforeEach, describe, expect, it, vi} from "vitest";

vi.mock("server-only", () => ({}));

import {dataDragonIconUrl, validateDataDragonReferences} from "@/lib/lol/data-dragon";

const version = "16.15.1";
const champion = {id: "Ahri", name: "아리", iconPath: "img/champion/Ahri.png"};
const item = {id: "3089", name: "라바돈의 죽음모자", iconPath: "img/item/3089.png"};
const spell = {id: "SummonerFlash", name: "점멸", iconPath: "img/spell/SummonerFlash.png"};
const perk = {id: "8112", name: "감전", iconPath: "perk-images/Styles/Domination/Electrocute/Electrocute.png"};

describe("Data Dragon references", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const body = url.endsWith("versions.json")
        ? [version]
        : url.endsWith("champion.json")
          ? {data: {Ahri: {id: "Ahri", name: "아리", image: {full: "Ahri.png"}}}}
        : url.endsWith("item.json")
          ? {data: {"3089": {name: "라바돈의 죽음모자", image: {full: "3089.png"}}}}
          : url.endsWith("summoner.json")
            ? {data: {SummonerFlash: {id: "SummonerFlash", name: "점멸", image: {full: "SummonerFlash.png"}, modes: ["CLASSIC"]}}}
            : [{slots: [{runes: [{id: 8112, name: "감전", icon: perk.iconPath}]}]}];
      return {ok: true, json: async () => body};
    }));
  });

  it("accepts canonical assets and builds CDN URLs", async () => {
    await expect(validateDataDragonReferences(payload())).resolves.toBeUndefined();
    expect(dataDragonIconUrl(version, champion.iconPath)).toBe(`https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/Ahri.png`);
    expect(dataDragonIconUrl(version, perk.iconPath)).toBe(`https://ddragon.leagueoflegends.com/cdn/img/${perk.iconPath}`);
  });

  it("rejects mismatched names or paths", async () => {
    const invalid = payload();
    invalid.participants[0].champion = {...champion, name: "잘못된 이름"};
    await expect(validateDataDragonReferences(invalid)).rejects.toMatchObject({code: "INVALID_DDRAGON_ASSET"});
  });

  it("rejects a version absent from the official version list", async () => {
    const invalid = payload();
    invalid.ddragonVersion = "99.99.99";
    await expect(validateDataDragonReferences(invalid)).rejects.toMatchObject({code: "INVALID_DDRAGON_VERSION"});
  });
});

function payload() {
  const participant = {
    team: "BLUE" as const,
    observedName: "선수",
    champion: {...champion},
    primaryPerk: {...perk},
    summonerSpells: [{...spell}, {...spell}] as [typeof spell, typeof spell],
    level: 18,
    kills: 1,
    deaths: 1,
    assists: 1,
    cs: 100,
    goldEarned: 10000,
    items: [{...item}, null, null, null, null, null] as [typeof item, null, null, null, null, null],
    trinket: null,
    questSlot: null,
  };
  return {
    ddragonVersion: version,
    teamStats: [
      {team: "BLUE" as const, kills: 5, deaths: 5, assists: 5, goldTotal: 50000, bans: [champion, null, null, null, null] as [typeof champion, null, null, null, null], objectives: zeroObjectives()},
      {team: "RED" as const, kills: 5, deaths: 5, assists: 5, goldTotal: 50000, bans: [null, null, null, null, null] as [null, null, null, null, null], objectives: zeroObjectives()},
    ],
    participants: Array.from({length: 10}, (_, index) => ({...participant, team: index < 5 ? "BLUE" as const : "RED" as const})),
  };
}

const zeroObjectives = () => ({turretsDestroyed: 0, inhibitorsDestroyed: 0, baronKills: 0, dragonKills: 0, riftHeraldKills: 0, voidGrubKills: 0});
