import {createHash, timingSafeEqual} from "node:crypto";
import type {
  LolAssetRef,
  MatchObjectives,
  MatchResult,
  MatchResultParticipant,
  MatchResultTeamStats,
  MatchTeam,
  PlayerProfile,
  Role,
  RiotAccountProfile,
} from "@/lib/lol/types";
import {MATCH_TEAMS, ROLES} from "@/lib/lol/types";

const ASSET_PATH = /^(?:img\/(?:champion|item|spell)\/[A-Za-z0-9_.-]+\.png|perk-images\/[A-Za-z0-9_./-]+\.png)$/;
const OBJECTIVE_FIELDS = [
  "turretsDestroyed",
  "inhibitorsDestroyed",
  "baronKills",
  "dragonKills",
  "riftHeraldKills",
  "voidGrubKills",
] as const satisfies ReadonlyArray<keyof MatchObjectives>;

export type ParsedMatchParticipant = Omit<MatchResultParticipant, "guest">;

export type ParsedMatchResultInput = {
  ingestionId: string;
  playedOn: string;
  winner: MatchTeam;
  durationSeconds: number;
  ddragonVersion: string;
  teamStats: MatchResultTeamStats[];
  participants: ParsedMatchParticipant[];
};

export type PreparedMatchResult = {
  input: ParsedMatchResultInput;
  participants: MatchResultParticipant[];
  sourceHash: string;
  guestCount: number;
};

export type MatchResultAdminUpdate = {
  revision: number;
  playedOn: string;
  winner: MatchTeam;
  durationSeconds: number;
  ddragonVersion: string;
  teamStats: MatchResultTeamStats[];
  participants: MatchResultParticipant[];
};

export class MatchResultError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly code = "INVALID_MATCH_RESULT",
  ) {
    super(message);
  }
}

export function parseMatchResultInput(input: unknown): ParsedMatchResultInput {
  const body = record(input, "요청 본문이 올바르지 않습니다.");
  const ingestionId = text(body.ingestionId, "ingestionId", 128);
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(ingestionId)) {
    throw new MatchResultError("ingestionId 형식이 올바르지 않습니다.");
  }
  const result = {
    ingestionId,
    playedOn: dateText(body.playedOn, "playedOn"),
    winner: matchTeam(body.winner),
    durationSeconds: positiveInteger(body.durationSeconds, "durationSeconds"),
    ddragonVersion: ddragonVersion(body.ddragonVersion),
    teamStats: parseTeamStats(body.teamStats),
    participants: sortParticipantsByRole(parseParticipants(body.participants)),
  };
  validateMatchTotals(result.teamStats, result.participants);
  return result;
}

export function prepareMatchResult(
  input: ParsedMatchResultInput,
  players: PlayerProfile[],
  accounts: RiotAccountProfile[] = [],
): PreparedMatchResult {
  const participants = resolveParticipants(input.participants, players, accounts);
  return {
    input,
    participants,
    sourceHash: matchResultSourceHash(input),
    guestCount: participants.filter((participant) => participant.guest).length,
  };
}

export function createMatchResult(
  prepared: PreparedMatchResult,
  now = Date.now(),
  correctedBy: MatchResult["correctedBy"] = "ingest-api",
): MatchResult {
  return {
    schemaVersion: 4,
    matchResultId: crypto.randomUUID(),
    ingestionId: prepared.input.ingestionId,
    sourceHash: prepared.sourceHash,
    source: "CHAT_SCREENSHOT",
    playedOn: prepared.input.playedOn,
    winner: prepared.input.winner,
    durationSeconds: prepared.input.durationSeconds,
    ddragonVersion: prepared.input.ddragonVersion,
    teamStats: prepared.input.teamStats,
    participants: prepared.participants,
    revision: 1,
    correctedBy,
    corrections: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function parseAdminMatchResultUpdate(input: unknown, players: PlayerProfile[]): MatchResultAdminUpdate {
  const body = record(input, "요청 본문이 올바르지 않습니다.");
  const revision = positiveInteger(body.revision, "revision");
  const teamStats = parseTeamStats(body.teamStats);
  const parsed = parseParticipants(body.participants);
  validateTeamCounts(parsed);
  validateMatchTotals(teamStats, parsed);
  const playerById = new Map(players.map((player) => [player.discordUserId, player]));
  const used = new Set<string>();
  const rawParticipants = body.participants as unknown[];
  const participants = parsed.map((participant, index): MatchResultParticipant => {
    const source = record(rawParticipants[index], `participants[${index}]가 올바르지 않습니다.`);
    const requestedId = typeof source.discordUserId === "string" ? source.discordUserId.trim() : "";
    if (!requestedId) return {...participant, discordUserId: null, guest: true};
    if (!playerById.has(requestedId)) {
      throw new MatchResultError(`${participant.observedName}의 등록 선수를 찾을 수 없습니다.`);
    }
    if (used.has(requestedId)) throw new MatchResultError("같은 등록 선수를 두 번 연결할 수 없습니다.");
    used.add(requestedId);
    return {...participant, discordUserId: requestedId, guest: false};
  });
  return {
    revision,
    playedOn: dateText(body.playedOn, "playedOn"),
    winner: matchTeam(body.winner),
    durationSeconds: positiveInteger(body.durationSeconds, "durationSeconds"),
    ddragonVersion: ddragonVersion(body.ddragonVersion),
    teamStats,
    participants: sortParticipantsByRole(participants),
  };
}

export function bearerTokenMatches(header: string | null, expected: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const actual = header.slice("Bearer ".length).trim();
  if (!actual) return false;
  const actualDigest = createHash("sha256").update(actual).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

export function normalizePlayerName(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

export function matchResultSourceHash(input: ParsedMatchResultInput): string {
  return createHash("sha256").update(JSON.stringify({
    ...input,
    participants: input.participants.map((participant) => ({
      ...participant,
      discordUserId: undefined,
      observedName: normalizePlayerName(participant.observedName),
    })),
  })).digest("hex");
}

function parseParticipants(value: unknown): ParsedMatchParticipant[] {
  if (!Array.isArray(value) || value.length !== 10) {
    throw new MatchResultError("참가자는 정확히 10명이어야 합니다.");
  }
  const teamOffsets: Record<MatchTeam, number> = {BLUE: 0, RED: 0};
  const participants = value.map((item, index): ParsedMatchParticipant => {
    const participant = record(item, `participants[${index}]가 올바르지 않습니다.`);
    const team = matchTeam(participant.team);
    const fallbackRole = ROLES[teamOffsets[team]++];
    const requestedDiscordUserId = typeof participant.discordUserId === "string" && participant.discordUserId.trim()
      ? text(participant.discordUserId, `participants[${index}].discordUserId`, 80)
      : null;
    const questSlot = nullableAssetRef(participant.questSlot, `participants[${index}].questSlot`);
    const questRole = questSlot ? roleFromQuest(questSlot) : null;
    const requestedRole = participant.role === undefined ? null : matchRole(participant.role, `participants[${index}].role`);
    if (questSlot && !questRole) throw new MatchResultError(`${participant.observedName ?? `participants[${index}]`}의 퀘스트가 포지션 퀘스트가 아닙니다.`);
    if (questRole && requestedRole && questRole !== requestedRole) throw new MatchResultError(`participants[${index}]의 포지션과 퀘스트가 일치하지 않습니다.`);
    return {
      team,
      role: questRole ?? requestedRole ?? fallbackRole,
      observedName: text(participant.observedName, `participants[${index}].observedName`, 80),
      discordUserId: requestedDiscordUserId,
      champion: assetRef(participant.champion, `participants[${index}].champion`),
      primaryPerk: assetRef(participant.primaryPerk, `participants[${index}].primaryPerk`),
      summonerSpells: fixedAssetSlots(participant.summonerSpells, 2, `participants[${index}].summonerSpells`, false),
      level: positiveInteger(participant.level, `participants[${index}].level`),
      kills: nonNegativeInteger(participant.kills, `participants[${index}].kills`),
      deaths: nonNegativeInteger(participant.deaths, `participants[${index}].deaths`),
      assists: nonNegativeInteger(participant.assists, `participants[${index}].assists`),
      cs: nonNegativeInteger(participant.cs, `participants[${index}].cs`),
      goldEarned: nonNegativeInteger(participant.goldEarned, `participants[${index}].goldEarned`),
      items: fixedAssetSlots(participant.items, 6, `participants[${index}].items`, true),
      trinket: nullableAssetRef(participant.trinket, `participants[${index}].trinket`),
      questSlot,
    };
  });
  validateTeamCounts(participants);
  validateParticipantRolesAndSpells(participants);
  return participants;
}

function parseTeamStats(value: unknown): MatchResultTeamStats[] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new MatchResultError("teamStats는 BLUE와 RED 팀 통계를 각각 하나씩 포함해야 합니다.");
  }
  const parsed = value.map((item, index): MatchResultTeamStats => {
    const stats = record(item, `teamStats[${index}]가 올바르지 않습니다.`);
    return {
      team: matchTeam(stats.team),
      kills: nonNegativeInteger(stats.kills, `teamStats[${index}].kills`),
      deaths: nonNegativeInteger(stats.deaths, `teamStats[${index}].deaths`),
      assists: nonNegativeInteger(stats.assists, `teamStats[${index}].assists`),
      goldTotal: nonNegativeInteger(stats.goldTotal, `teamStats[${index}].goldTotal`),
      bans: fixedAssetSlots(stats.bans, 5, `teamStats[${index}].bans`, true),
      objectives: objectives(stats.objectives, `teamStats[${index}].objectives`),
    };
  });
  if (new Set(parsed.map((stats) => stats.team)).size !== 2) {
    throw new MatchResultError("teamStats에는 BLUE와 RED 팀이 하나씩 있어야 합니다.");
  }
  return parsed;
}

function objectives(value: unknown, field: string): MatchObjectives {
  const source = record(value, `${field}가 올바르지 않습니다.`);
  const unknown = Object.keys(source).filter((key) => !OBJECTIVE_FIELDS.includes(key as keyof MatchObjectives));
  if (unknown.length) throw new MatchResultError(`${field}에 지원하지 않는 목표물 필드가 있습니다: ${unknown.join(", ")}`);
  return Object.fromEntries(OBJECTIVE_FIELDS.map((key) => [key, nonNegativeInteger(source[key], `${field}.${key}`)])) as MatchObjectives;
}

function assetRef(value: unknown, field: string): LolAssetRef {
  const source = record(value, `${field}가 올바르지 않습니다.`);
  const ref = {
    id: text(source.id, `${field}.id`, 80),
    name: text(source.name, `${field}.name`, 100),
    iconPath: text(source.iconPath, `${field}.iconPath`, 240),
  };
  if (!ASSET_PATH.test(ref.iconPath) || ref.iconPath.includes("..")) {
    throw new MatchResultError(`${field}.iconPath가 허용된 Data Dragon 경로가 아닙니다.`);
  }
  return ref;
}

function nullableAssetRef(value: unknown, field: string): LolAssetRef | null {
  return value === null ? null : assetRef(value, field);
}

function fixedAssetSlots<N extends number>(value: unknown, count: N, field: string, nullable: boolean) {
  if (!Array.isArray(value) || value.length !== count) {
    throw new MatchResultError(`${field}는 정확히 ${count}칸이어야 합니다.`);
  }
  const parsed = value.map((entry, index) => {
    if (nullable && entry === null) return null;
    return assetRef(entry, `${field}[${index}]`);
  });
  return parsed as N extends 2
    ? [LolAssetRef, LolAssetRef]
    : N extends 5
      ? [LolAssetRef | null, LolAssetRef | null, LolAssetRef | null, LolAssetRef | null, LolAssetRef | null]
      : [LolAssetRef | null, LolAssetRef | null, LolAssetRef | null, LolAssetRef | null, LolAssetRef | null, LolAssetRef | null];
}

function validateMatchTotals(teamStats: MatchResultTeamStats[], participants: ParsedMatchParticipant[]) {
  for (const team of MATCH_TEAMS) {
    const teamTotal = teamStats.find((stats) => stats.team === team)!;
    const members = participants.filter((participant) => participant.team === team);
    const sums = {
      kills: sum(members, "kills"),
      deaths: sum(members, "deaths"),
      assists: sum(members, "assists"),
      goldTotal: members.reduce((total, participant) => total + participant.goldEarned, 0),
    };
    for (const [field, value] of Object.entries(sums)) {
      if (teamTotal[field as keyof typeof sums] !== value) {
        throw new MatchResultError(`${team} 팀 ${field} 합계가 개인 합계와 일치하지 않습니다.`);
      }
    }
  }
}

function sum(participants: ParsedMatchParticipant[], field: "kills" | "deaths" | "assists") {
  return participants.reduce((total, participant) => total + participant[field], 0);
}

function resolveParticipants(participants: ParsedMatchParticipant[], players: PlayerProfile[], accounts: RiotAccountProfile[]): MatchResultParticipant[] {
  const candidates = new Map<string, Set<string>>();
  const playerById = new Map(players.map((player) => [player.discordUserId, player]));
  for (const player of players) {
    for (const key of [player.displayName, player.riotGameName, `${player.riotGameName}#${player.riotTagLine}`].map(normalizePlayerName)) {
      const ids = candidates.get(key) ?? new Set<string>();
      ids.add(player.discordUserId);
      candidates.set(key, ids);
    }
  }
  for (const account of accounts) {
    for (const key of [account.riotGameName, `${account.riotGameName}#${account.riotTagLine}`].map(normalizePlayerName)) {
      const ids = candidates.get(key) ?? new Set<string>();
      ids.add(account.discordUserId);
      candidates.set(key, ids);
    }
  }
  const used = new Set<string>();
  return participants.map((participant) => {
    const matches = [...(candidates.get(normalizePlayerName(participant.observedName)) ?? [])];
    if (participant.discordUserId && !playerById.has(participant.discordUserId)) {
      throw new MatchResultError(`${participant.observedName}에 지정한 등록 선수를 찾을 수 없습니다.`);
    }
    const discordUserId = participant.discordUserId ?? (matches.length === 1 ? matches[0] : null);
    if (discordUserId && used.has(discordUserId)) {
      throw new MatchResultError("같은 등록 선수가 결과표에서 두 번 인식되었습니다.");
    }
    if (discordUserId) used.add(discordUserId);
    return {...participant, discordUserId, guest: !discordUserId};
  });
}

function validateTeamCounts(participants: Array<{team: MatchTeam}>) {
  for (const team of MATCH_TEAMS) {
    if (participants.filter((participant) => participant.team === team).length !== 5) {
      throw new MatchResultError(`${team} 팀 참가자는 정확히 5명이어야 합니다.`);
    }
  }
}

function validateParticipantRolesAndSpells(participants: ParsedMatchParticipant[]) {
  for (const team of MATCH_TEAMS) {
    const members = participants.filter((participant) => participant.team === team);
    if (new Set(members.map((participant) => participant.role)).size !== ROLES.length) {
      throw new MatchResultError(`${team} 팀은 탑, 정글, 미드, 원딜, 서포터 포지션을 각각 한 명씩 포함해야 합니다.`);
    }
    for (const participant of members) {
      const spellIds = participant.summonerSpells.map((spell) => spell.id);
      if (new Set(spellIds).size !== spellIds.length) throw new MatchResultError(`${participant.observedName}의 소환사 주문이 중복되었습니다.`);
      const hasSmite = participant.summonerSpells.some((spell) => spell.id.toLocaleLowerCase("en-US").includes("smite") || normalizePlayerName(spell.name) === normalizePlayerName("강타"));
      if (hasSmite !== (participant.role === "JUNGLE")) throw new MatchResultError(`${participant.observedName}의 강타와 정글 포지션이 일치하지 않습니다.`);
    }
  }
}

function roleFromQuest(asset: LolAssetRef): Role | null {
  const name = normalizePlayerName(asset.name);
  if (name.includes(normalizePlayerName("상단 공격로"))) return "TOP";
  if (name.includes(normalizePlayerName("정글 퀘스트"))) return "JUNGLE";
  if (name.includes(normalizePlayerName("중단 공격로"))) return "MIDDLE";
  if (name.includes(normalizePlayerName("하단 공격로"))) return "BOTTOM";
  if (name.includes(normalizePlayerName("서포터 퀘스트"))) return "UTILITY";
  return null;
}

function matchRole(value: unknown, field: string): Role {
  const role = String(value ?? "").toUpperCase() as Role;
  if (!ROLES.includes(role)) throw new MatchResultError(`${field}는 TOP, JUNGLE, MIDDLE, BOTTOM, UTILITY 중 하나여야 합니다.`);
  return role;
}

function sortParticipantsByRole<T extends {team: MatchTeam; role: Role}>(participants: T[]): T[] {
  return [...participants].sort((left, right) => MATCH_TEAMS.indexOf(left.team) - MATCH_TEAMS.indexOf(right.team)
    || ROLES.indexOf(left.role) - ROLES.indexOf(right.role));
}

function matchTeam(value: unknown): MatchTeam {
  const team = String(value ?? "").toUpperCase() as MatchTeam;
  if (!MATCH_TEAMS.includes(team)) throw new MatchResultError("승리 팀과 참가자 팀은 BLUE 또는 RED여야 합니다.");
  return team;
}

function dateText(value: unknown, field: string): string {
  const date = text(value, field, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00+09:00`))) {
    throw new MatchResultError(`${field} 값은 YYYY-MM-DD 형식의 유효한 날짜여야 합니다.`);
  }
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new MatchResultError(`${field} 값은 YYYY-MM-DD 형식의 유효한 날짜여야 합니다.`);
  }
  return date;
}

function ddragonVersion(value: unknown): string {
  const version = text(value, "ddragonVersion", 32);
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new MatchResultError("ddragonVersion 형식이 올바르지 않습니다.");
  return version;
}

function nonNegativeInteger(value: unknown, field: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number < 0) throw new MatchResultError(`${field} 값은 음수가 아닌 정수여야 합니다.`);
  return number;
}

function positiveInteger(value: unknown, field: string): number {
  const number = nonNegativeInteger(value, field);
  if (number < 1) throw new MatchResultError(`${field} 값은 1 이상의 정수여야 합니다.`);
  return number;
}

function text(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") throw new MatchResultError(`${field} 값은 문자열이어야 합니다.`);
  const normalized = value.normalize("NFC").trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > maxLength) throw new MatchResultError(`${field} 값은 1~${maxLength}자여야 합니다.`);
  return normalized;
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MatchResultError(message);
  return value as Record<string, unknown>;
}
