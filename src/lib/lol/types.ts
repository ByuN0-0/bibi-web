export const ALGORITHM_VERSION = "team-balancing-v3";
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

export const MAX_LEVEL_BY_ROLE: Record<Role, number> = {
  TOP: 20,
  JUNGLE: 18,
  MIDDLE: 18,
  BOTTOM: 18,
  UTILITY: 18,
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
  queueId?: number;
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

export type RecentRoleMatch = {
  matchId: string;
  playedAt: number;
  queueId: number;
  role: Role;
};

export type RiotAccountProfile = {
  schemaVersion: number;
  accountId: string;
  discordUserId: string;
  isPrimary: boolean;
  riotGameName: string;
  riotTagLine: string;
  puuid: string | null;
  soloRank: RankInfo;
  flexRank: RankInfo;
  recentRoleMatches: RecentRoleMatch[];
  latestScannedMatchId?: string | null;
  syncErrorCode: string | null;
  revision: number;
  createdAt: number;
  updatedAt: number;
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
  recentRoleCounts?: Partial<Record<Role, number>>;
  recentRoleSampleCount?: number;
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
  rankQueue?: "SOLO" | "FLEX" | null;
  offRole: boolean;
  lowConfidence: boolean;
};

export type InhousePlayerRating = {
  discordUserId: string;
  elo: number;
  matchCount: number;
  roleRatings?: Partial<Record<Role, InhouseRoleRating>>;
};

export type InhouseRoleRating = {
  elo: number;
  matchCount: number;
};

export type InhouseRatingSnapshot = {
  schemaVersion: number;
  snapshotId: "current";
  ratings: InhousePlayerRating[];
  sourceMatchCount: number;
  computedAt: number;
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

export const DATA_DRAGON_ASSET_KINDS = ["champions", "items", "perks", "spells"] as const;
export type DataDragonAssetKind = (typeof DATA_DRAGON_ASSET_KINDS)[number];

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
  role: Role;
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
  correctedBy: "ingest-api" | "web-admin";
};

export type MatchReviewStatus = "PENDING_REVIEW" | "PUBLISHED";
export type MatchReviewIssueStatus = "OPEN" | "CONFIRMED" | "CORRECTED";
export type MatchReviewIssueReason = "LEVEL_UNRESOLVED" | "LOW_MARGIN" | "METHOD_DISAGREEMENT" | "CONSTRAINT_OVERRIDE";
export type MatchReviewTarget =
  | {scope: "TEAM"; team: MatchTeam; field: "ban"; slot: number}
  | {
    scope: "PARTICIPANT";
    team: MatchTeam;
    role: Role;
    field: "level" | "champion" | "primaryPerk" | "summonerSpell" | "item" | "trinket" | "questSlot";
    slot?: number;
  };

export type MatchReviewIssue = {
  key: string;
  target: MatchReviewTarget;
  reasons: MatchReviewIssueReason[];
  detectedText?: string;
  selectedAssetId?: string;
  score?: number;
  runnerUpGap?: number | null;
  status: MatchReviewIssueStatus;
  resolvedAt: number | null;
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
  reviewStatus?: MatchReviewStatus;
  reviewIssues?: MatchReviewIssue[];
  reviewedAt?: number | null;
  createdAt: number;
  updatedAt: number;
};

export type PublicMatchResultParticipant = Omit<MatchResultParticipant, "discordUserId"> & {
  registeredPlayerName: string | null;
};

export type PublicMatchResult = Pick<
  MatchResult,
  "matchResultId" | "playedOn" | "winner" | "durationSeconds" | "ddragonVersion" | "teamStats"
> & {
  participants: PublicMatchResultParticipant[];
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

export function rankTierDisplay(rank: RankInfo | null | undefined): string {
  if (!rank || rank.tier === "UNRANKED") return "배치 전";
  return `${rank.tier}${rank.division ? ` ${rank.division}` : ""}`;
}
