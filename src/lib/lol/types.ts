export const ALGORITHM_VERSION = "team-balancing-v1";
export const ROLES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
export type Role = (typeof ROLES)[number];
export const MATCH_TEAMS = ["BLUE", "RED"] as const;
export type MatchTeam = (typeof MATCH_TEAMS)[number];

export const ROLE_LABEL: Record<Role, string> = {
  TOP: "탑",
  JUNGLE: "정글",
  MIDDLE: "미드",
  BOTTOM: "원딜",
  UTILITY: "서포터",
};

export type RankInfo = {
  tier: string;
  division: string;
  leaguePoints: number;
  wins: number;
  losses: number;
};

export type RoleStats = {
  sampleCount: number;
  confidence: number;
  goldDiff15: number;
  xpDiff15: number;
  csDiff15: number;
  damagePerGoldDiff: number;
  killParticipationDiff: number;
  visionPerMinuteDiff: number;
  crowdControlPerMinuteDiff: number;
  objectiveParticipationDiff: number;
  formScore: number;
  balanceSignal: number;
};

export type MatchPerformance = {
  matchId: string;
  playedAt: number;
  role: Role;
  goldDiff15: number;
  xpDiff15: number;
  csDiff15: number;
  damagePerGoldDiff: number;
  killParticipationDiff: number;
  visionPerMinuteDiff: number;
  crowdControlPerMinuteDiff: number;
  objectiveParticipationDiff: number;
  deathRateDiff: number;
};

export type PlayerProfile = {
  schemaVersion: number;
  discordUserId: string;
  displayName: string;
  riotGameName: string;
  riotTagLine: string;
  puuid: string | null;
  summonerId: string | null;
  primaryRole: Role;
  secondaryRole: Role;
  soloRank: RankInfo;
  flexRank: RankInfo;
  recentMatches: MatchPerformance[];
  roleStats: Partial<Record<Role, RoleStats>>;
  syncStatus: "REQUESTED" | "SYNCING" | "READY" | "FAILED";
  syncRequestedAt: number;
  lastSyncStartedAt: number;
  lastSyncedAt: number;
  syncErrorCode: string | null;
  revision: number;
  createdAt: number;
  updatedAt: number;
};

export type TeamAssignment = {
  discordUserId: string;
  displayName: string;
  role: Role;
  rank: string;
  offRole: boolean;
  lowConfidence: boolean;
};

export type TeamComposition = {
  algorithmVersion: typeof ALGORITHM_VERSION;
  signature: string;
  blue: TeamAssignment[];
  red: TeamAssignment[];
  cost: number;
  teamGap: number;
  maxLaneGap: number;
  balanceGrade: string;
};

export type TeamDraft = {
  schemaVersion: number;
  draftId: string;
  hostDiscordUserId: string;
  selectedDiscordUserIds: string[];
  excludedSignatures: string[];
  composition: TeamComposition | null;
  status: "DRAFT" | "CONFIRMED";
  expiresAt: number;
  updatedAt: number;
};

export type TeamSession = {
  schemaVersion: number;
  sessionId: string;
  hostDiscordUserId: string;
  composition: TeamComposition;
  confirmedAt: number;
};

export type LolAssetRef = {
  id: string;
  name: string;
  iconPath: string;
};

export type MatchObjectives = {
  turretsDestroyed: number;
  inhibitorsDestroyed: number;
  baronKills: number;
  dragonKills: number;
  riftHeraldKills: number;
  voidGrubKills: number;
};

export type MatchResultParticipant = {
  team: MatchTeam;
  observedName: string;
  discordUserId: string | null;
  guest: boolean;
  champion: LolAssetRef;
  primaryPerk: LolAssetRef;
  summonerSpells: [LolAssetRef, LolAssetRef];
  level: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  goldEarned: number;
  items: [
    LolAssetRef | null,
    LolAssetRef | null,
    LolAssetRef | null,
    LolAssetRef | null,
    LolAssetRef | null,
    LolAssetRef | null,
  ];
  trinket: LolAssetRef | null;
  questSlot: LolAssetRef | null;
};

export type MatchResultTeamStats = {
  team: MatchTeam;
  kills: number;
  deaths: number;
  assists: number;
  goldTotal: number;
  bans: [
    LolAssetRef | null,
    LolAssetRef | null,
    LolAssetRef | null,
    LolAssetRef | null,
    LolAssetRef | null,
  ];
  objectives: MatchObjectives;
};

export type MatchResultCorrection = {
  revision: number;
  correctedAt: number;
  correctedBy: "web-admin";
};

export type MatchResult = {
  schemaVersion: number;
  matchResultId: string;
  ingestionId: string;
  sourceHash: string;
  source: "CHAT_SCREENSHOT";
  playedOn: string;
  winner: MatchTeam;
  durationSeconds: number;
  ddragonVersion: string;
  teamStats: MatchResultTeamStats[];
  participants: MatchResultParticipant[];
  revision: number;
  correctedBy: "ingest-api" | "web-admin";
  corrections: MatchResultCorrection[];
  createdAt: number;
  updatedAt: number;
};

export type SystemStatus = {
  schemaVersion: number;
  instanceId: string;
  heartbeatAt: number;
  algorithmVersion: string;
  lastFullSyncAt: number;
  failedSyncCount: number;
};

export function rankDisplay(rank: RankInfo | null | undefined): string {
  if (!rank || rank.tier === "UNRANKED") return "배치 전";
  const division = rank.division ? ` ${rank.division}` : "";
  return `${rank.tier}${division} ${rank.leaguePoints}LP`;
}
