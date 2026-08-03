import {isPublishedMatch} from "@/lib/lol/match-review";
import type {
  LolAssetRef,
  MatchResult,
  MatchResultParticipant,
  PlayerProfile,
  Role,
} from "@/lib/lol/types";
import {ROLES} from "@/lib/lol/types";

export type PlayerStatsLine = {
  matchCount: number;
  wins: number;
  losses: number;
  winRate: number;
  averageKills: number;
  averageDeaths: number;
  averageAssists: number;
  kda: number | null;
  csPerMinute: number;
  goldPerMinute: number;
  killParticipation: number;
};

export type PlayerStatsBreakdown = PlayerStatsLine & {
  lastPlayedOn: string | null;
};

export type PlayerChampionStats = PlayerStatsBreakdown & {
  champion: LolAssetRef;
  ddragonVersion: string;
};

export type PlayerStatsMatch = {
  matchResultId: string;
  playedOn: string;
  result: "WIN" | "LOSS";
  champion: LolAssetRef;
  ddragonVersion: string;
  role: Role;
  kills: number;
  deaths: number;
  assists: number;
  csPerMinute: number;
  goldPerMinute: number;
};

export type PlayerHeadToHeadMatch = {
  matchResultId: string;
  playedOn: string;
  player: PlayerStatsMatch;
  opponent: PlayerStatsMatch;
};

export type PlayerHeadToHeadStats = {
  opponentDiscordUserId: string;
  opponentDisplayName: string;
  matchCount: number;
  lastPlayedOn: string;
  player: PlayerStatsLine;
  opponent: PlayerStatsLine;
  recentMatches: PlayerHeadToHeadMatch[];
};

export type PlayerInhouseStats = {
  discordUserId: string;
  displayName: string;
  overall: PlayerStatsLine;
  recent: PlayerStatsLine;
  byRole: Partial<Record<Role, PlayerStatsBreakdown>>;
  champions: PlayerChampionStats[];
  recentMatches: PlayerStatsMatch[];
  headToHead: PlayerHeadToHeadStats[];
};

export type PlayerInhouseStatsMap = Record<string, PlayerInhouseStats>;

type PlayerSample = {
  result: MatchResult;
  participant: MatchResultParticipant;
};

type HeadToHeadSample = {
  result: MatchResult;
  player: MatchResultParticipant;
  opponent: MatchResultParticipant;
};

export function summarizePlayerStats(
  results: MatchResult[],
  players: Array<Pick<PlayerProfile, "discordUserId" | "displayName">>,
): PlayerInhouseStatsMap {
  const playersById = new Map(players.map((player) => [player.discordUserId, player]));
  const playerSamples = new Map<string, PlayerSample[]>();
  const headToHeadSamples = new Map<string, Map<string, HeadToHeadSample[]>>();

  for (const result of results.filter(isPublishedMatch)) {
    const participants = new Map<string, MatchResultParticipant>();
    for (const participant of result.participants) {
      if (participant.guest || !participant.discordUserId || !playersById.has(participant.discordUserId)) continue;
      participants.set(participant.discordUserId, participant);
    }

    for (const [discordUserId, participant] of participants) {
      append(playerSamples, discordUserId, {result, participant});
      for (const [opponentId, opponent] of participants) {
        if (opponent.team === participant.team) continue;
        const opponents = headToHeadSamples.get(discordUserId) ?? new Map<string, HeadToHeadSample[]>();
        append(opponents, opponentId, {result, player: participant, opponent});
        headToHeadSamples.set(discordUserId, opponents);
      }
    }
  }

  return Object.fromEntries(players.map((player) => {
    const samples = [...(playerSamples.get(player.discordUserId) ?? [])].sort(compareSamples);
    const recent = samples.slice(0, 10);
    return [player.discordUserId, {
      discordUserId: player.discordUserId,
      displayName: player.displayName,
      overall: statsLine(samples),
      recent: statsLine(recent),
      byRole: roleBreakdown(samples),
      champions: championBreakdown(samples),
      recentMatches: recent.map(toStatsMatch),
      headToHead: headToHeadBreakdown(
        headToHeadSamples.get(player.discordUserId),
        playersById,
      ),
    } satisfies PlayerInhouseStats];
  }));
}

function roleBreakdown(samples: PlayerSample[]): Partial<Record<Role, PlayerStatsBreakdown>> {
  return Object.fromEntries(ROLES.flatMap((role) => {
    const roleSamples = samples.filter((sample) => sample.participant.role === role);
    return roleSamples.length ? [[role, {
      ...statsLine(roleSamples),
      lastPlayedOn: roleSamples[0].result.playedOn,
    } satisfies PlayerStatsBreakdown]] : [];
  }));
}

function championBreakdown(samples: PlayerSample[]): PlayerChampionStats[] {
  const byChampion = new Map<string, PlayerSample[]>();
  for (const sample of samples) append(byChampion, sample.participant.champion.id, sample);
  return [...byChampion.values()]
    .map((championSamples): PlayerChampionStats => ({
      champion: championSamples[0].participant.champion,
      ddragonVersion: championSamples[0].result.ddragonVersion,
      ...statsLine(championSamples),
      lastPlayedOn: championSamples[0].result.playedOn,
    }))
    .sort((left, right) => right.matchCount - left.matchCount
      || (right.lastPlayedOn ?? "").localeCompare(left.lastPlayedOn ?? "")
      || left.champion.name.localeCompare(right.champion.name, "ko"))
    .slice(0, 5);
}

function headToHeadBreakdown(
  opponents: Map<string, HeadToHeadSample[]> | undefined,
  playersById: Map<string, Pick<PlayerProfile, "discordUserId" | "displayName">>,
): PlayerHeadToHeadStats[] {
  if (!opponents) return [];
  return [...opponents.entries()].flatMap(([opponentDiscordUserId, samples]) => {
    const opponentIdentity = playersById.get(opponentDiscordUserId);
    if (!opponentIdentity) return [];
    const ordered = [...samples].sort(compareHeadToHeadSamples);
    const playerSamples = ordered.map(({result, player}) => ({result, participant: player}));
    const opponentSamples = ordered.map(({result, opponent}) => ({result, participant: opponent}));
    return [{
      opponentDiscordUserId,
      opponentDisplayName: opponentIdentity.displayName,
      matchCount: ordered.length,
      lastPlayedOn: ordered[0].result.playedOn,
      player: statsLine(playerSamples),
      opponent: statsLine(opponentSamples),
      recentMatches: ordered.slice(0, 10).map(({result, player, opponent}) => ({
        matchResultId: result.matchResultId,
        playedOn: result.playedOn,
        player: toStatsMatch({result, participant: player}),
        opponent: toStatsMatch({result, participant: opponent}),
      })),
    }];
  }).sort((left, right) => right.matchCount - left.matchCount
    || right.lastPlayedOn.localeCompare(left.lastPlayedOn)
    || left.opponentDisplayName.localeCompare(right.opponentDisplayName, "ko")
    || left.opponentDiscordUserId.localeCompare(right.opponentDiscordUserId));
}

function statsLine(samples: PlayerSample[]): PlayerStatsLine {
  const matchCount = samples.length;
  if (!matchCount) return emptyStatsLine();
  const totals = samples.reduce((sum, {result, participant}) => {
    const teamKills = result.teamStats.find((team) => team.team === participant.team)?.kills ?? 0;
    return {
      wins: sum.wins + Number(result.winner === participant.team),
      kills: sum.kills + participant.kills,
      deaths: sum.deaths + participant.deaths,
      assists: sum.assists + participant.assists,
      cs: sum.cs + participant.cs,
      gold: sum.gold + participant.goldEarned,
      seconds: sum.seconds + Math.max(0, result.durationSeconds),
      killParticipation: sum.killParticipation
        + (teamKills > 0 ? (participant.kills + participant.assists) / teamKills : 0),
    };
  }, {wins: 0, kills: 0, deaths: 0, assists: 0, cs: 0, gold: 0, seconds: 0, killParticipation: 0});
  const minutes = totals.seconds / 60;
  return {
    matchCount,
    wins: totals.wins,
    losses: matchCount - totals.wins,
    winRate: totals.wins / matchCount,
    averageKills: totals.kills / matchCount,
    averageDeaths: totals.deaths / matchCount,
    averageAssists: totals.assists / matchCount,
    kda: totals.deaths === 0 ? null : (totals.kills + totals.assists) / totals.deaths,
    csPerMinute: minutes > 0 ? totals.cs / minutes : 0,
    goldPerMinute: minutes > 0 ? totals.gold / minutes : 0,
    killParticipation: totals.killParticipation / matchCount,
  };
}

function emptyStatsLine(): PlayerStatsLine {
  return {
    matchCount: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    averageKills: 0,
    averageDeaths: 0,
    averageAssists: 0,
    kda: null,
    csPerMinute: 0,
    goldPerMinute: 0,
    killParticipation: 0,
  };
}

function toStatsMatch({result, participant}: PlayerSample): PlayerStatsMatch {
  const minutes = Math.max(0, result.durationSeconds) / 60;
  return {
    matchResultId: result.matchResultId,
    playedOn: result.playedOn,
    result: result.winner === participant.team ? "WIN" : "LOSS",
    champion: participant.champion,
    ddragonVersion: result.ddragonVersion,
    role: participant.role,
    kills: participant.kills,
    deaths: participant.deaths,
    assists: participant.assists,
    csPerMinute: minutes > 0 ? participant.cs / minutes : 0,
    goldPerMinute: minutes > 0 ? participant.goldEarned / minutes : 0,
  };
}

function compareSamples(left: PlayerSample, right: PlayerSample) {
  return right.result.playedOn.localeCompare(left.result.playedOn)
    || right.result.createdAt - left.result.createdAt
    || right.result.matchResultId.localeCompare(left.result.matchResultId);
}

function compareHeadToHeadSamples(left: HeadToHeadSample, right: HeadToHeadSample) {
  return right.result.playedOn.localeCompare(left.result.playedOn)
    || right.result.createdAt - left.result.createdAt
    || right.result.matchResultId.localeCompare(left.result.matchResultId);
}

function append<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const values = map.get(key);
  if (values) values.push(value);
  else map.set(key, [value]);
}
