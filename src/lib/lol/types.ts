export const ALGORITHM_VERSION = "team-balancing-v1";
export const ROLES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
export type Role = (typeof ROLES)[number];

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
