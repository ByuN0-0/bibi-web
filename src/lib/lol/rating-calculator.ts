import {
  ROLES,
  type MatchPerformance,
  type RankInfo,
  type Role,
  type RoleStats,
} from "@/lib/lol/types";

const HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000;
export const DEFAULT_TIER_PRIOR = 0.35;
const PRIOR_MATCHES = 10;
const FLEX_EVIDENCE_WEIGHT = 0.30;
const PERFORMANCE_PRIOR_MATCHES = 5;
const FORM_ADJUSTMENT_RANGE = 0.30;

export function calculateRoleStats(
  solo: RankInfo,
  flex: RankInfo,
  matches: MatchPerformance[],
  now = Date.now(),
): Partial<Record<Role, RoleStats>> {
  const tier = tierScore(solo, flex);
  return Object.fromEntries(ROLES.map((role) => {
    const roleMatches = matches
      .filter((match) => match.role === role)
      .map((match) => ({
        match,
        weight: Math.pow(0.5, Math.max(now - match.playedAt, 0) / HALF_LIFE_MS)
          * queueWeight(match.queueId),
      }));
    if (!roleMatches.length) return [role, emptyRoleStats(tier)];

    const totalWeight = roleMatches.reduce((sum, value) => sum + value.weight, 0);
    const average = (metric: keyof MatchPerformance) => roleMatches.reduce(
      (sum, value) => sum + Number(value.match[metric]) * value.weight,
      0,
    ) / totalWeight;
    const gold = average("goldDiff15");
    const xp = average("xpDiff15");
    const cs = average("csDiff15");
    const damage = average("damagePerGoldDiff");
    const kp = average("killParticipationDiff");
    const vision = average("visionPerMinuteDiff");
    const cc = average("crowdControlPerMinuteDiff");
    const objective = average("objectiveParticipationDiff");
    const deaths = average("deathRateDiff");
    const form = formScore(role, gold, xp, cs, damage, kp, vision, cc, objective, deaths);
    const confidence = totalWeight / (totalWeight + PERFORMANCE_PRIOR_MATCHES);
    return [role, {
      sampleCount: roleMatches.length,
      confidence,
      goldDiff15: gold,
      xpDiff15: xp,
      csDiff15: cs,
      damagePerGoldDiff: damage,
      killParticipationDiff: kp,
      visionPerMinuteDiff: vision,
      crowdControlPerMinuteDiff: cc,
      objectiveParticipationDiff: objective,
      formScore: form,
      balanceSignal: clamp(tier + confidence * FORM_ADJUSTMENT_RANGE * (form - 0.5), 0, 1),
    } satisfies RoleStats];
  })) as Partial<Record<Role, RoleStats>>;
}

export function tierScore(solo: RankInfo, flex: RankInfo, prior = DEFAULT_TIER_PRIOR) {
  const soloEvidence = evidence(solo, 1);
  const flexEvidence = evidence(flex, FLEX_EVIDENCE_WEIGHT);
  const total = PRIOR_MATCHES + soloEvidence + flexEvidence;
  return (clamp(prior, 0, 1) * PRIOR_MATCHES
    + (soloEvidence ? rankValue(solo) * soloEvidence : 0)
    + (flexEvidence ? rankValue(flex) * flexEvidence : 0)) / total;
}

export function observedRankScore(solo: RankInfo, flex: RankInfo) {
  const soloEvidence = evidence(solo, 1);
  const flexEvidence = evidence(flex, FLEX_EVIDENCE_WEIGHT);
  const total = soloEvidence + flexEvidence;
  if (!total) return null;
  return ((soloEvidence ? rankValue(solo) * soloEvidence : 0)
    + (flexEvidence ? rankValue(flex) * flexEvidence : 0)) / total;
}

function ranked(rank: RankInfo) {
  return !!rank?.tier && rank.tier !== "UNRANKED";
}

function evidence(rank: RankInfo, queueEvidenceWeight: number) {
  if (!ranked(rank)) return 0;
  return Math.min(Math.max(1, rank.wins + rank.losses), 40) * queueEvidenceWeight;
}

function queueWeight(queueId?: number) {
  if (queueId === 440) return 0.35;
  if (queueId === 400 || queueId === 480 || queueId === 490) return 0.15;
  // Legacy documents did not store queueId and only contained ranked games.
  return 1;
}

function rankValue(rank: RankInfo) {
  const tiers: Record<string, number> = {
    IRON: 0, BRONZE: 400, SILVER: 800, GOLD: 1200, PLATINUM: 1600,
    EMERALD: 2000, DIAMOND: 2400, MASTER: 2800, GRANDMASTER: 3200, CHALLENGER: 3600,
  };
  const divisions: Record<string, number> = {I: 300, II: 200, III: 100};
  return clamp(((tiers[rank.tier] ?? 1200) + (divisions[rank.division] ?? 0)
    + Math.min(rank.leaguePoints, 399)) / 4000, 0, 1);
}

function formScore(
  role: Role,
  gold: number,
  xp: number,
  cs: number,
  damage: number,
  kp: number,
  vision: number,
  cc: number,
  objective: number,
  deaths: number,
) {
  const early = role === "UTILITY"
    ? 0.6 * normalize(gold, 1000) + 0.4 * normalize(xp, 1000)
    : role === "JUNGLE"
      ? 0.5 * normalize(gold, 1500) + 0.3 * normalize(xp, 1200) + 0.2 * normalize(cs, 25)
      : 0.5 * normalize(gold, 1500) + 0.3 * normalize(xp, 1200) + 0.2 * normalize(cs, 30);
  const impact = role === "TOP"
    ? 0.4 * normalize(damage, 0.5) + 0.2 * normalize(kp, 0.25) + 0.2 * normalize(deaths, 0.1) + 0.2 * normalize(vision, 0.5)
    : role === "JUNGLE"
      ? 0.3 * normalize(kp, 0.25) + 0.3 * normalize(objective, 0.5) + 0.2 * normalize(vision, 0.7) + 0.2 * normalize(damage, 0.5)
      : role === "MIDDLE"
        ? 0.45 * normalize(damage, 0.5) + 0.3 * normalize(kp, 0.25) + 0.15 * normalize(deaths, 0.1) + 0.1 * normalize(vision, 0.5)
        : role === "BOTTOM"
          ? 0.55 * normalize(damage, 0.5) + 0.2 * normalize(kp, 0.25) + 0.15 * normalize(cs, 30) + 0.1 * normalize(deaths, 0.1)
          : 0.35 * normalize(vision, 1) + 0.3 * normalize(kp, 0.25) + 0.2 * normalize(cc, 1) + 0.15 * normalize(deaths, 0.1);
  return clamp(0.5 + 0.25 * early + 0.25 * impact, 0, 1);
}

function emptyRoleStats(balanceSignal: number): RoleStats {
  return {
    sampleCount: 0, confidence: 0, goldDiff15: 0, xpDiff15: 0, csDiff15: 0,
    damagePerGoldDiff: 0, killParticipationDiff: 0, visionPerMinuteDiff: 0,
    crowdControlPerMinuteDiff: 0, objectiveParticipationDiff: 0,
    formScore: 0.5, balanceSignal,
  };
}

const normalize = (value: number, scale: number) => Math.tanh(value / scale);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
