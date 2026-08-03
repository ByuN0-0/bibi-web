import "server-only";
import {getRiotServerEnv} from "@/lib/server-env";
import {selectRiotAccountLookup} from "@/lib/lol/riot-account";
import {
  type MatchPerformance,
  type RankInfo,
  type RecentRoleMatch,
  type RiotAccountProfile,
  type Role,
} from "@/lib/lol/types";

const REQUEST_INTERVAL_MS = 1_300;
const MAX_MATCH_AGE_MS = 60 * 24 * 60 * 60 * 1000;
const PERFORMANCE_QUEUES = [420, 440, 400, 480, 490] as const;
const MATCHES_PER_QUEUE = 6;
const MAX_RECENT_MATCHES = 30;
const unranked = (): RankInfo => ({tier: "UNRANKED", division: "", leaguePoints: 0, wins: 0, losses: 0});

let throttleQueue = Promise.resolve();
let nextRequestAt = 0;

export class RiotApiError extends Error {
  constructor(readonly status: number) {
    super(`Riot API request failed with HTTP ${status}`);
  }
}

export type RiotAccountSyncData = Pick<
  RiotAccountProfile,
  "riotGameName" | "riotTagLine" | "puuid" | "soloRank" | "flexRank" | "recentMatches" | "recentRoleMatches" | "latestScannedMatchId"
>;

export async function loadRiotAccountProfile(
  accountProfile: Pick<RiotAccountProfile, "riotGameName" | "riotTagLine" | "puuid">,
): Promise<RiotAccountSyncData> {
  const client = new RiotClient();
  const lookup = selectRiotAccountLookup(accountProfile);
  const account = lookup.kind === "PUUID"
    ? await client.resolveAccountByPuuid(lookup.puuid, accountProfile.riotGameName, accountProfile.riotTagLine)
    : await client.resolveAccountByRiotId(lookup.gameName, lookup.tagLine);
  const [entries, matches] = await Promise.all([
    client.getLeagueEntries(account.puuid),
    client.getRecentPerformanceMatches(account.puuid),
  ]);
  const ranks = parseRanks(entries);
  const cutoff = Date.now() - MAX_MATCH_AGE_MS;
  const recentMatches: MatchPerformance[] = [];
  for (const match of matches) {
    if (numberAt(objectAt(match, "info"), "gameStartTimestamp") < cutoff) continue;
    const matchId = stringAt(objectAt(match, "metadata"), "matchId");
    const timeline = await client.getTimeline(matchId);
    const performance = parsePerformance(account.puuid, match, timeline);
    if (performance) recentMatches.push(performance);
  }
  const recentRoleMatches: RecentRoleMatch[] = recentMatches.map(({matchId, playedAt, queueId, role}) => ({
    matchId,
    playedAt,
    queueId: queueId ?? 0,
    role,
  }));
  return {
    riotGameName: account.gameName,
    riotTagLine: account.tagLine,
    puuid: account.puuid,
    soloRank: ranks.get("RANKED_SOLO_5x5") ?? unranked(),
    flexRank: ranks.get("RANKED_FLEX_SR") ?? unranked(),
    recentMatches,
    recentRoleMatches,
    latestScannedMatchId: matches.length
      ? stringAt(objectAt(matches[0], "metadata"), "matchId") || null
      : null,
  };
}

class RiotClient {
  private readonly env = getRiotServerEnv();
  private readonly matchCache = new Map<string, Promise<JsonObject>>();

  async resolveAccountByRiotId(gameName: string, tagLine: string) {
    const account = object(await this.get(this.regional(
      `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
    )));
    return {
      puuid: stringAt(account, "puuid"),
      gameName: stringAt(account, "gameName") || gameName,
      tagLine: stringAt(account, "tagLine") || tagLine,
    };
  }

  async resolveAccountByPuuid(puuid: string, gameName: string, tagLine: string) {
    const account = object(await this.get(this.regional(
      `/riot/account/v1/accounts/by-puuid/${encodeURIComponent(puuid)}`,
    )));
    return {
      puuid: stringAt(account, "puuid") || puuid,
      gameName: stringAt(account, "gameName") || gameName,
      tagLine: stringAt(account, "tagLine") || tagLine,
    };
  }

  async getLeagueEntries(puuid: string) {
    return array(await this.get(this.platform(`/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`)))
      .map(object);
  }

  async getRecentPerformanceMatches(puuid: string) {
    const byQueue = await Promise.all(PERFORMANCE_QUEUES.map((queue) =>
      this.getMatchIds(puuid, queue)));
    const ids = [...new Set(byQueue.flat())];
    const matches = await Promise.all(ids.map((id) => this.getMatch(id)));
    return matches
      .sort((left, right) => numberAt(objectAt(right, "info"), "gameStartTimestamp")
        - numberAt(objectAt(left, "info"), "gameStartTimestamp"))
      .slice(0, MAX_RECENT_MATCHES);
  }

  async getTimeline(matchId: string) {
    return object(await this.get(this.regional(`/lol/match/v5/matches/${encodeURIComponent(matchId)}/timeline`)));
  }

  private async getMatchIds(puuid: string, queue: number) {
    const payload = await this.get(this.regional(
      `/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?queue=${queue}&start=0&count=${MATCHES_PER_QUEUE}`,
    ));
    return array(payload).filter((value): value is string => typeof value === "string");
  }

  private getMatch(matchId: string) {
    let match = this.matchCache.get(matchId);
    if (!match) {
      match = this.get(this.regional(`/lol/match/v5/matches/${encodeURIComponent(matchId)}`)).then(object);
      this.matchCache.set(matchId, match);
    }
    return match;
  }

  private async get(url: string): Promise<unknown> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await throttle();
      try {
        const response = await fetch(url, {
          headers: {"X-Riot-Token": this.env.apiKey, Accept: "application/json"},
          signal: AbortSignal.timeout(this.env.timeoutMs),
          cache: "no-store",
        });
        if ((response.status === 429 || response.status >= 500) && attempt < 3) {
          await retryDelay(response.headers.get("retry-after"), attempt);
          continue;
        }
        if (!response.ok) throw new RiotApiError(response.status);
        return await response.json();
      } catch (error) {
        if (error instanceof RiotApiError) throw error;
        lastError = error;
        if (attempt < 3) await retryDelay(null, attempt);
      }
    }
    throw new Error("Riot API request failed", {cause: lastError});
  }

  private platform(path: string) {
    return `https://${this.env.platform}.api.riotgames.com${path}`;
  }

  private regional(path: string) {
    return `https://${this.env.region}.api.riotgames.com${path}`;
  }
}

function parseRanks(entries: JsonObject[]) {
  const ranks = new Map<string, RankInfo>();
  entries.forEach((entry) => ranks.set(stringAt(entry, "queueType"), {
    tier: stringAt(entry, "tier") || "UNRANKED",
    division: stringAt(entry, "rank"),
    leaguePoints: numberAt(entry, "leaguePoints"),
    wins: numberAt(entry, "wins"),
    losses: numberAt(entry, "losses"),
  }));
  return ranks;
}

export function parsePerformance(
  puuid: string,
  match: JsonObject,
  timeline: JsonObject,
): MatchPerformance | null {
  const info = objectAt(match, "info");
  const participants = arrayAt(info, "participants").map(object);
  const player = participants.find((participant) => stringAt(participant, "puuid") === puuid);
  if (!player) return null;
  const role = roleFromRiot(stringAt(player, "teamPosition"));
  if (!role) return null;
  const opponent = participants.find((participant) =>
    numberAt(participant, "teamId") !== numberAt(player, "teamId")
      && stringAt(participant, "teamPosition") === role,
  );
  if (!opponent) return null;
  const frame = arrayAt(objectAt(timeline, "info"), "frames")
    .map(object)
    .find((candidate) => numberAt(candidate, "timestamp") >= 15 * 60 * 1000);
  if (!frame) return null;
  const frames = objectAt(frame, "participantFrames");
  const playerFrame = object(frames[String(numberAt(player, "participantId"))]);
  const opponentFrame = object(frames[String(numberAt(opponent, "participantId"))]);
  const durationMinutes = Math.max(numberAt(info, "gameDuration") / 60, 1);
  const teamId = numberAt(player, "teamId");
  const teamKills = participants
    .filter((participant) => numberAt(participant, "teamId") === teamId)
    .reduce((sum, participant) => sum + numberAt(participant, "kills"), 0);
  const opponentTeamKills = participants
    .filter((participant) => numberAt(participant, "teamId") !== teamId)
    .reduce((sum, participant) => sum + numberAt(participant, "kills"), 0);
  const playerKp = (numberAt(player, "kills") + numberAt(player, "assists")) / Math.max(teamKills, 1);
  const opponentKp = (numberAt(opponent, "kills") + numberAt(opponent, "assists")) / Math.max(opponentTeamKills, 1);
  return {
    matchId: stringAt(objectAt(match, "metadata"), "matchId"),
    playedAt: numberAt(info, "gameStartTimestamp"),
    queueId: numberAt(info, "queueId"),
    role,
    goldDiff15: numberAt(playerFrame, "totalGold") - numberAt(opponentFrame, "totalGold"),
    xpDiff15: numberAt(playerFrame, "xp") - numberAt(opponentFrame, "xp"),
    csDiff15: cs(playerFrame, role) - cs(opponentFrame, role),
    damagePerGoldDiff: ratio(player, "totalDamageDealtToChampions", "goldEarned")
      - ratio(opponent, "totalDamageDealtToChampions", "goldEarned"),
    killParticipationDiff: playerKp - opponentKp,
    visionPerMinuteDiff: numberAt(player, "visionScore") / durationMinutes
      - numberAt(opponent, "visionScore") / durationMinutes,
    crowdControlPerMinuteDiff: numberAt(player, "totalTimeCCDealt") / durationMinutes
      - numberAt(opponent, "totalTimeCCDealt") / durationMinutes,
    objectiveParticipationDiff: objectiveParticipation(player) - objectiveParticipation(opponent),
    deathRateDiff: numberAt(opponent, "deaths") / durationMinutes
      - numberAt(player, "deaths") / durationMinutes,
  };
}

async function throttle() {
  const scheduled = throttleQueue.then(async () => {
    const wait = nextRequestAt - Date.now();
    if (wait > 0) await delay(wait);
    nextRequestAt = Date.now() + REQUEST_INTERVAL_MS;
  });
  throttleQueue = scheduled.catch(() => undefined);
  await scheduled;
}

async function retryDelay(retryAfter: string | null, attempt: number) {
  const parsed = Number(retryAfter ?? attempt);
  const seconds = Number.isFinite(parsed) && parsed >= 0 ? parsed : attempt;
  await delay(seconds * 1000);
}

function roleFromRiot(value: string): Role | null {
  return value === "TOP" || value === "JUNGLE" || value === "MIDDLE"
    || value === "BOTTOM" || value === "UTILITY" ? value : null;
}

function cs(frame: JsonObject, role: Role) {
  return numberAt(frame, role === "JUNGLE" ? "jungleMinionsKilled" : "minionsKilled");
}

function ratio(value: JsonObject, numerator: string, denominator: string) {
  return numberAt(value, numerator) / Math.max(numberAt(value, denominator), 1);
}

function objectiveParticipation(participant: JsonObject) {
  const challenges = objectAt(participant, "challenges");
  return numberAt(challenges, "dragonTakedowns") + numberAt(challenges, "baronTakedowns");
}

type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject => value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const objectAt = (value: JsonObject, key: string) => object(value[key]);
const arrayAt = (value: JsonObject, key: string) => array(value[key]);
const stringAt = (value: JsonObject, key: string) => typeof value[key] === "string" ? value[key] : "";
const numberAt = (value: JsonObject, key: string) => typeof value[key] === "number" ? value[key] : 0;
const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
