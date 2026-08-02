import type {LolAssetRef, MatchResultParticipant, Role} from "@/lib/lol/types";

export const TOP_WITH_TELEPORT_QUEST_IDS = new Set(["1221", "1222"]);
export const TOP_WITHOUT_TELEPORT_QUEST_IDS = new Set(["1200", "1220"]);
export const JUNGLE_QUEST_IDS = new Set(["1204", "1209", "1210", "1211"]);
export const MIDDLE_QUEST_IDS = new Set(["1201", "1206"]);
export const BOTTOM_QUEST_IDS = new Set(["1202", "1207"]);
export const UTILITY_QUEST_IDS = new Set(["1203", "1208"]);
export const CONTROL_WARD_ID = "2055";
export const TRINKET_IDS = new Set(["3340", "3363", "3364"]);

// Summoner's Rift boots present in the Data Dragon item catalog. This includes
// basic, upgraded, Feats of Strength and role-upgraded boots that can occupy
// the bottom-role quest slot.
export const BOOTS_ITEM_IDS = new Set([
  "1001", "2422", "3006", "3008", "3009", "3010", "3013", "3020", "3047",
  "3111", "3117", "3158", "3168", "3170", "3171", "3173", "3174", "3175", "3176",
]);

const TOP_QUEST_IDS = new Set([...TOP_WITH_TELEPORT_QUEST_IDS, ...TOP_WITHOUT_TELEPORT_QUEST_IDS]);

export function roleFromQuestSlot(asset: LolAssetRef): Role | null {
  if (TOP_QUEST_IDS.has(asset.id)) return "TOP";
  if (JUNGLE_QUEST_IDS.has(asset.id)) return "JUNGLE";
  if (MIDDLE_QUEST_IDS.has(asset.id)) return "MIDDLE";
  if (BOTTOM_QUEST_IDS.has(asset.id) || BOOTS_ITEM_IDS.has(asset.id)) return "BOTTOM";
  if (UTILITY_QUEST_IDS.has(asset.id) || asset.id === CONTROL_WARD_ID) return "UTILITY";
  return null;
}

export function hasTeleport(spells: LolAssetRef[]): boolean {
  return spells.some((spell) => spell.id.toLocaleLowerCase("en-US").includes("teleport")
    || normalize(spell.name).includes(normalize("순간이동")));
}

export function hasSmite(spells: LolAssetRef[]): boolean {
  return spells.some((spell) => spell.id.toLocaleLowerCase("en-US").includes("smite")
    || normalize(spell.name) === normalize("강타"));
}

export function isQuestSlotAllowed(asset: LolAssetRef, role: Role, spells: LolAssetRef[]): boolean {
  if (role === "TOP") {
    return (hasTeleport(spells) ? TOP_WITH_TELEPORT_QUEST_IDS : TOP_WITHOUT_TELEPORT_QUEST_IDS).has(asset.id);
  }
  if (role === "JUNGLE") return JUNGLE_QUEST_IDS.has(asset.id);
  if (role === "MIDDLE") return MIDDLE_QUEST_IDS.has(asset.id);
  if (role === "BOTTOM") return BOTTOM_QUEST_IDS.has(asset.id) || BOOTS_ITEM_IDS.has(asset.id);
  return UTILITY_QUEST_IDS.has(asset.id) || asset.id === CONTROL_WARD_ID;
}

export function participantRoleAssetError(participant: Pick<MatchResultParticipant, "observedName" | "role" | "summonerSpells" | "trinket" | "questSlot">): string | null {
  if (hasSmite(participant.summonerSpells) !== (participant.role === "JUNGLE")) {
    return `${participant.observedName}의 강타와 정글 포지션이 일치하지 않습니다.`;
  }
  if (!participant.questSlot) return `${participant.observedName}의 포지션 퀘스트 슬롯을 선택해 주세요.`;
  if (!isQuestSlotAllowed(participant.questSlot, participant.role, participant.summonerSpells)) {
    return `${participant.observedName}의 포지션과 퀘스트 슬롯이 일치하지 않습니다.`;
  }
  if (participant.trinket && !TRINKET_IDS.has(participant.trinket.id)) {
    return `${participant.observedName}의 장신구 슬롯에는 투명 와드, 망원형 개조, 예언자의 렌즈만 사용할 수 있습니다.`;
  }
  return null;
}

function normalize(value: string) {
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}
