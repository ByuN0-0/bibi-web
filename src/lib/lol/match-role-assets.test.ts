import {describe, expect, it} from "vitest";
import {
  isQuestSlotAllowed,
  participantRoleAssetError,
  roleFromQuestSlot,
  TRINKET_IDS,
} from "@/lib/lol/match-role-assets";
import type {LolAssetRef} from "@/lib/lol/types";

const asset = (id: string, name = id): LolAssetRef => ({id, name, iconPath: `img/item/${id}.png`});
const flash = {id: "SummonerFlash", name: "점멸", iconPath: "img/spell/SummonerFlash.png"};
const heal = {id: "SummonerHeal", name: "회복", iconPath: "img/spell/SummonerHeal.png"};
const teleport = {id: "SummonerTeleport", name: "순간이동", iconPath: "img/spell/SummonerTeleport.png"};

describe("scoreboard role assets", () => {
  it("classifies all four top IDs before applying the teleport constraint", () => {
    for (const id of ["1200", "1220", "1221", "1222"]) expect(roleFromQuestSlot(asset(id))).toBe("TOP");
    expect(isQuestSlotAllowed(asset("1221"), "TOP", [flash, teleport])).toBe(true);
    expect(isQuestSlotAllowed(asset("1200"), "TOP", [flash, teleport])).toBe(false);
    expect(isQuestSlotAllowed(asset("1200"), "TOP", [flash, heal])).toBe(true);
    expect(isQuestSlotAllowed(asset("1221"), "TOP", [flash, heal])).toBe(false);
  });

  it("accepts exact jungle and middle IDs", () => {
    for (const id of ["1204", "1209", "1210", "1211"]) expect(roleFromQuestSlot(asset(id))).toBe("JUNGLE");
    for (const id of ["1201", "1206"]) expect(roleFromQuestSlot(asset(id))).toBe("MIDDLE");
    expect(roleFromQuestSlot(asset("1205"))).toBeNull();
  });

  it("accepts boots for bottom and a control ward for support", () => {
    expect(roleFromQuestSlot(asset("3006", "광전사의 군화"))).toBe("BOTTOM");
    expect(roleFromQuestSlot(asset("2055", "제어 와드"))).toBe("UTILITY");
  });

  it("restricts trinkets and reports an invalid role slot", () => {
    expect([...TRINKET_IDS]).toEqual(["3340", "3363", "3364"]);
    expect(participantRoleAssetError({
      observedName: "탑",
      role: "TOP",
      summonerSpells: [flash, heal],
      trinket: asset("3340", "투명 와드"),
      questSlot: asset("1221"),
    })).toContain("포지션과 퀘스트 슬롯");
  });
});
