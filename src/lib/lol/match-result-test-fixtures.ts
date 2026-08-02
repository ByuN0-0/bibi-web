import type {LolAssetRef, MatchResult, MatchResultParticipant, PlayerProfile, TeamAssignment, TeamSession} from "@/lib/lol/types";

export const fixtureNow = Date.UTC(2026, 7, 2, 12);
export const champion: LolAssetRef = {id: "Ahri", name: "아리", iconPath: "img/champion/Ahri.png"};
export const perk: LolAssetRef = {id: "8112", name: "감전", iconPath: "perk-images/Styles/Domination/Electrocute/Electrocute.png"};
export const spell: LolAssetRef = {id: "SummonerFlash", name: "점멸", iconPath: "img/spell/SummonerFlash.png"};
export const item: LolAssetRef = {id: "3089", name: "라바돈의 죽음모자", iconPath: "img/item/3089.png"};

export function zeroObjectives() {
  return {turretsDestroyed: 0, inhibitorsDestroyed: 0, baronKills: 0, dragonKills: 0, riftHeraldKills: 0, voidGrubKills: 0};
}

export function makeMatchInput(players = makePlayers(), action: "validate" | "commit" = "validate") {
  const participants = players.slice(0, 10).map((player, index) => ({
    team: index < 5 ? "BLUE" : "RED",
    observedName: player.riotGameName,
    discordUserId: null as string | null,
    champion: {...champion},
    primaryPerk: {...perk},
    summonerSpells: [{...spell}, {...spell}],
    level: 15,
    kills: index < 5 ? index : index - 5,
    deaths: 1,
    assists: 2,
    cs: 100 + index,
    goldEarned: 10_000 + index,
    items: [{...item}, null, null, null, null, null],
    trinket: null,
    questSlot: null,
  }));
  const totals = (team: "BLUE" | "RED") => {
    const members = participants.filter((participant) => participant.team === team);
    return {
      kills: members.reduce((sum, participant) => sum + participant.kills, 0),
      deaths: members.reduce((sum, participant) => sum + participant.deaths, 0),
      assists: members.reduce((sum, participant) => sum + participant.assists, 0),
      goldTotal: members.reduce((sum, participant) => sum + participant.goldEarned, 0),
    };
  };
  return {
    action,
    ingestionId: "match-ingestion-0001",
    playedOn: "2026-08-02",
    winner: "BLUE",
    durationSeconds: 1800,
    ddragonVersion: "16.15.1",
    teamStats: (["BLUE", "RED"] as const).map((team) => ({team, ...totals(team), bans: [champion, null, null, null, null], objectives: zeroObjectives()})),
    participants,
  };
}

export function makePlayers(count = 10): PlayerProfile[] {
  return Array.from({length: count}, (_, index) => ({
    schemaVersion: 1,
    discordUserId: `player-${index + 1}`,
    displayName: `선수 ${index + 1}`,
    riotGameName: `RiotPlayer${index + 1}`,
    riotTagLine: "KR1",
    puuid: `puuid-${index}`,
    summonerId: `summoner-${index}`,
    primaryRole: "TOP",
    secondaryRole: "JUNGLE",
    soloRank: {tier: "GOLD", division: "I", leaguePoints: 0, wins: 0, losses: 0},
    flexRank: {tier: "UNRANKED", division: "", leaguePoints: 0, wins: 0, losses: 0},
    recentMatches: [],
    roleStats: {},
    syncStatus: "READY",
    syncRequestedAt: 0,
    lastSyncStartedAt: 0,
    lastSyncedAt: fixtureNow,
    syncErrorCode: null,
    revision: 1,
    createdAt: fixtureNow,
    updatedAt: fixtureNow,
  }));
}

export function makeSession(players = makePlayers(), sessionId = "session-1"): TeamSession {
  const assignments = players.slice(0, 10).map((player, index): TeamAssignment => ({
    discordUserId: player.discordUserId,
    displayName: player.displayName,
    role: (["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const)[index % 5],
    rank: "GOLD I",
    offRole: false,
    lowConfidence: false,
  }));
  return {schemaVersion: 1, sessionId, hostDiscordUserId: "web-admin", composition: {algorithmVersion: "team-balancing-v1", signature: `signature-${sessionId}`, blue: assignments.slice(0, 5), red: assignments.slice(5), cost: 0, teamGap: 0, maxLaneGap: 0, balanceGrade: "A"}, confirmedAt: fixtureNow - 60_000};
}

export function makeStoredResult(): MatchResult {
  const input = makeMatchInput();
  return {
    schemaVersion: 3,
    matchResultId: "result-1",
    ingestionId: input.ingestionId,
    sourceHash: "source-hash",
    source: "CHAT_SCREENSHOT",
    playedOn: input.playedOn,
    winner: "BLUE",
    durationSeconds: input.durationSeconds,
    ddragonVersion: input.ddragonVersion,
    teamStats: input.teamStats as MatchResult["teamStats"],
    participants: input.participants.map((participant, index) => ({...participant, team: participant.team as "BLUE" | "RED", discordUserId: `player-${index + 1}`, guest: false})) as MatchResultParticipant[],
    revision: 1,
    correctedBy: "ingest-api",
    corrections: [],
    createdAt: fixtureNow,
    updatedAt: fixtureNow,
  };
}
