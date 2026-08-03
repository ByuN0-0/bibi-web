import type {DataDragonAssetKind, LolAssetRef, MatchResultParticipant, MatchResultTeamStats} from "@/lib/lol/types";
import {MatchResultError} from "@/lib/lol/match-result";
export {dataDragonIconUrl} from "@/lib/lol/data-dragon-url";

const DDRAGON_ORIGIN = "https://ddragon.leagueoflegends.com";
const catalogCache = new Map<string, Promise<DataDragonCatalog>>();

export const MATCH_KEYSTONE_NAMES = [
  "폭풍전사의 포효",
  "콩콩이 소환",
  "죽음불꽃 손길",
  "신비로운 유성",
  "어둠의 수확",
  "감전",
  "칼날비",
  "기민한 발놀림",
  "치명적 속도",
  "집중 공격",
  "정복자",
  "수호자",
  "여진",
  "착취의 손아귀",
  "빙결 강화",
  "선제공격",
  "봉인 풀린 주문서",
] as const;

const normalizedMatchKeystoneNames = new Set(MATCH_KEYSTONE_NAMES.map(normalizeRuneName));

type DataDragonCatalog = {
  champions: Map<string, LolAssetRef>;
  items: Map<string, LolAssetRef>;
  perks: Map<string, LolAssetRef>;
  spells: Map<string, LolAssetRef>;
};

type VersionedData = {data: Record<string, {id: string; name: string; image: {full: string}; modes?: string[]}>};
type ItemData = {data: Record<string, {name: string; image: {full: string}}>};
type RuneTree = {slots: Array<{runes: Array<{id: number; name: string; icon: string}>}>};

export async function validateDataDragonReferences(input: {
  ddragonVersion: string;
  teamStats: MatchResultTeamStats[];
  participants: Array<Omit<MatchResultParticipant, "discordUserId" | "guest"> | MatchResultParticipant>;
}) {
  const catalog = await loadCatalog(input.ddragonVersion);
  for (const [teamIndex, team] of input.teamStats.entries()) {
    team.bans.forEach((ref, slot) => ref && assertCanonical(ref, catalog.champions, `teamStats[${teamIndex}].bans[${slot}]`));
  }
  for (const [index, participant] of input.participants.entries()) {
    assertCanonical(participant.champion, catalog.champions, `participants[${index}].champion`);
    assertCanonical(participant.primaryPerk, catalog.perks, `participants[${index}].primaryPerk`);
    participant.summonerSpells.forEach((ref, slot) => assertCanonical(ref, catalog.spells, `participants[${index}].summonerSpells[${slot}]`));
    participant.items.forEach((ref, slot) => ref && assertCanonical(ref, catalog.items, `participants[${index}].items[${slot}]`));
    if (participant.trinket) assertCanonical(participant.trinket, catalog.items, `participants[${index}].trinket`);
    if (participant.questSlot) assertCanonical(participant.questSlot, catalog.items, `participants[${index}].questSlot`);
  }
}

export async function listDataDragonAssets(version: string, kind: DataDragonAssetKind): Promise<LolAssetRef[]> {
  const catalog = await loadCatalog(version);
  return [...catalog[kind].values()].sort((left, right) => left.name.localeCompare(right.name, "ko"));
}

async function loadCatalog(version: string): Promise<DataDragonCatalog> {
  let pending = catalogCache.get(version);
  if (!pending) {
    pending = fetchCatalog(version).catch((error) => {
      catalogCache.delete(version);
      throw error;
    });
    catalogCache.set(version, pending);
  }
  return pending;
}

async function fetchCatalog(version: string): Promise<DataDragonCatalog> {
  try {
    const base = `${DDRAGON_ORIGIN}/cdn/${encodeURIComponent(version)}/data/ko_KR`;
    const [versions, champions, items, spells, runeTrees] = await Promise.all([
      fetchJson<string[]>(`${DDRAGON_ORIGIN}/api/versions.json`),
      fetchJson<VersionedData>(`${base}/champion.json`),
      fetchJson<ItemData>(`${base}/item.json`),
      fetchJson<VersionedData>(`${base}/summoner.json`),
      fetchJson<RuneTree[]>(`${base}/runesReforged.json`),
    ]);
    if (!versions.includes(version)) {
      throw new MatchResultError("지원하지 않는 Data Dragon 버전입니다.", 400, "INVALID_DDRAGON_VERSION");
    }
    return {
      champions: new Map(Object.values(champions.data).filter((entry) => !entry.id.includes("_")).map((entry) => [entry.id, {
        id: entry.id,
        name: entry.name,
        iconPath: `img/champion/${entry.image.full}`,
      }])),
      items: new Map(Object.entries(items.data).map(([id, entry]) => [id, {
        id,
        name: entry.name,
        iconPath: `img/item/${entry.image.full}`,
      }])),
      spells: new Map(Object.values(spells.data).filter((entry) => entry.modes?.includes("CLASSIC")).map((entry) => [entry.id, {
        id: entry.id,
        name: entry.name,
        iconPath: `img/spell/${entry.image.full}`,
      }])),
      perks: new Map(runeTrees.flatMap((tree) => tree.slots.flatMap((slot) => slot.runes))
        .filter((entry) => normalizedMatchKeystoneNames.has(normalizeRuneName(entry.name)))
        .map((entry) => [String(entry.id), {
        id: String(entry.id),
        name: entry.name,
        iconPath: entry.icon,
      }])),
    };
  } catch (error) {
    if (error instanceof MatchResultError) throw error;
    throw new MatchResultError(
      "Data Dragon 카탈로그를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      503,
      "DDRAGON_UNAVAILABLE",
    );
  }
}

function normalizeRuneName(name: string) {
  return name.replace(/\s+/g, "");
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {signal: AbortSignal.timeout(5_000), cache: "force-cache"});
  if (!response.ok) throw new Error(`Data Dragon ${response.status}`);
  return response.json() as Promise<T>;
}

function assertCanonical(ref: LolAssetRef, catalog: Map<string, LolAssetRef>, field: string) {
  const expected = catalog.get(ref.id);
  if (!expected || expected.name !== ref.name || expected.iconPath !== ref.iconPath) {
    throw new MatchResultError(
      `${field}의 ID·이름·아이콘 경로가 Data Dragon ${expected ? "카탈로그와 일치하지 않습니다" : "카탈로그에 없습니다"}.`,
      400,
      "INVALID_DDRAGON_ASSET",
    );
  }
}
