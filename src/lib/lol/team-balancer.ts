import {
  ALGORITHM_VERSION,
  rankTierDisplay,
  type InhousePlayerRating,
  type LaneAdvantage,
  type PlayerProfile,
  type Role,
  type TeamAssignment,
  type TeamComposition,
  type TeamConstraints,
  type TeamSession,
} from "@/lib/lol/types";
import {
  DEFAULT_TIER_PRIOR,
  observedRankScore,
  tierScore,
} from "@/lib/lol/rating-calculator";
import {resolveRolePreferences} from "@/lib/lol/role-preferences";
import {emptyTeamConstraints} from "@/lib/lol/team-constraints";

const ROLES: Role[] = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
const PLAYER_COUNT = 10;
const FULL_PLAYER_MASK = (1 << PLAYER_COUNT) - 1;
const OVERALL_RATING_WEIGHT = 0.30;
const ROLE_RATING_WEIGHT = 0.70;
const MAX_INHOUSE_WEIGHT = 0.30;
const NEUTRAL_LANE_GAP = 0.03;

type Candidate = {
  signature: string;
  slots: number[];
  cost: number;
  teamGap: number;
  maxLaneGap: number;
  laneAdvantage: LaneAdvantage;
  advantageImbalance: number;
};

type SearchContext = {
  players: PlayerProfile[];
  signals: number[][];
  preferences: number[][];
  repeatWeights: number[][];
  recentWeightTotal: number;
  minimumOffRoles: number;
  minimumOffRoleMemo: number[][];
  lockedRoleIndexes: number[];
  sameTeamPairs: Array<[number, number]>;
  bestByTeamMask: Map<number, Candidate>;
};

export function balanceTeam(
  players: PlayerProfile[],
  recent: TeamSession[],
  excludedSignatures = new Set<string>(),
  random: () => number = Math.random,
  ratings = new Map<string, InhousePlayerRating>(),
  constraints: TeamConstraints = emptyTeamConstraints(),
): TeamComposition {
  if (players.length !== PLAYER_COUNT) throw new Error("정확히 10명의 선수가 필요합니다.");
  if (new Set(players.map((player) => player.discordUserId)).size !== PLAYER_COUNT) {
    throw new Error("중복된 선수가 포함되어 있습니다.");
  }
  const ordered = [...players].sort((left, right) =>
    left.discordUserId < right.discordUserId ? -1 : left.discordUserId > right.discordUserId ? 1 : 0,
  );
  const prior = groupPrior(ordered);
  const signals = ordered.map((player) => ROLES.map((role) =>
    signal(player, role, ratings.get(player.discordUserId), prior)));
  const preferences = ordered.map((player) => ROLES.map((role) => preferencePenalty(player, role)));
  const indexById = new Map(ordered.map((player, index) => [player.discordUserId, index]));
  const lockedRoleById = new Map(constraints.roleLocks.map((lock) => [lock.discordUserId, ROLES.indexOf(lock.role)]));
  const minimumOffRoleMemo = Array.from({length: ROLES.length + 1}, () =>
    new Array<number>(1 << PLAYER_COUNT).fill(-1));
  const context: SearchContext = {
    players: ordered,
    signals,
    preferences,
    repeatWeights: buildRepeatWeights(ordered, recent),
    recentWeightTotal: recent.reduce((sum, _session, index) => sum + Math.pow(0.85, index), 0),
    minimumOffRoles: PLAYER_COUNT + 1,
    minimumOffRoleMemo,
    lockedRoleIndexes: ordered.map((player) => lockedRoleById.get(player.discordUserId) ?? -1),
    sameTeamPairs: constraints.sameTeamPairs.map((pair) => [
      indexById.get(pair.firstDiscordUserId)!, indexById.get(pair.secondDiscordUserId)!,
    ]),
    bestByTeamMask: new Map(),
  };
  pairRoles(0, FULL_PLAYER_MASK, new Array<number>(PLAYER_COUNT), 0, 0, 0, 0, context);

  let candidates = [...context.bestByTeamMask.values()].sort((left, right) =>
    left.cost - right.cost
      || (left.signature < right.signature ? -1 : left.signature > right.signature ? 1 : 0),
  );
  if (!candidates.length) throw new Error("고정 조건을 만족하는 팀 조합이 없습니다. 라인 고정과 같은 팀 고정의 충돌을 확인해 주세요.");
  candidates = candidates.filter((candidate) => !excludedSignatures.has(candidate.signature));
  if (!candidates.length) throw new Error("현재 조건에서 새로운 팀 조합이 없습니다.");
  const minimumAdvantageImbalance = Math.min(...candidates.map((candidate) => candidate.advantageImbalance));
  candidates = candidates.filter((candidate) => candidate.advantageImbalance === minimumAdvantageImbalance);
  const maximumNeutralCount = Math.max(...candidates.map((candidate) => candidate.laneAdvantage.neutralCount));
  candidates = candidates.filter((candidate) => candidate.laneAdvantage.neutralCount === maximumNeutralCount);
  const veryBalanced = candidates.filter((candidate) => candidate.laneAdvantage.balanced
    && candidate.teamGap <= 0.03 && candidate.maxLaneGap <= 0.10);
  const balanced = candidates.filter((candidate) => candidate.laneAdvantage.balanced
    && candidate.teamGap <= 0.06 && candidate.maxLaneGap <= 0.18);
  candidates = (veryBalanced.length ? veryBalanced : balanced.length ? balanced : candidates)
    .slice(0, 20);
  return toComposition(weightedChoice(candidates, candidates[0].cost, random), ordered);
}

function minimumRemainingOffRoles(
  roleIndex: number,
  remainingMask: number,
  context: SearchContext,
): number {
  if (roleIndex === ROLES.length) return 0;
  const cached = context.minimumOffRoleMemo[roleIndex][remainingMask];
  if (cached >= 0) return cached;
  let minimum = PLAYER_COUNT + 1;
  for (let first = 0; first < PLAYER_COUNT; first += 1) {
    if (!(remainingMask & (1 << first))) continue;
    if (!canPlayRole(first, roleIndex, context)) continue;
    for (let second = first + 1; second < PLAYER_COUNT; second += 1) {
      if (!(remainingMask & (1 << second))) continue;
      if (!canPlayRole(second, roleIndex, context)) continue;
      const nextMask = remainingMask & ~(1 << first) & ~(1 << second);
      const offRoles = offRole(context.preferences[first][roleIndex])
        + offRole(context.preferences[second][roleIndex])
        + minimumRemainingOffRoles(roleIndex + 1, nextMask, context);
      minimum = Math.min(minimum, offRoles);
    }
  }
  context.minimumOffRoleMemo[roleIndex][remainingMask] = minimum;
  return minimum;
}

function pairRoles(
  roleIndex: number,
  remainingMask: number,
  pairs: number[],
  offRoleCount: number,
  laneGapTotal: number,
  maxLaneGap: number,
  preferenceTotal: number,
  context: SearchContext,
) {
  if (roleIndex === ROLES.length) {
    orientTeams(pairs, offRoleCount, laneGapTotal, maxLaneGap, preferenceTotal, context);
    return;
  }
  for (let first = 0; first < PLAYER_COUNT; first += 1) {
    if (!(remainingMask & (1 << first))) continue;
    if (!canPlayRole(first, roleIndex, context)) continue;
    for (let second = first + 1; second < PLAYER_COUNT; second += 1) {
      if (!(remainingMask & (1 << second))) continue;
      if (!canPlayRole(second, roleIndex, context)) continue;
      const nextMask = remainingMask & ~(1 << first) & ~(1 << second);
      const nextOffRoleCount = offRoleCount
        + offRole(context.preferences[first][roleIndex])
        + offRole(context.preferences[second][roleIndex]);
      if (nextOffRoleCount + minimumRemainingOffRoles(roleIndex + 1, nextMask, context)
          > context.minimumOffRoles) continue;
      pairs[roleIndex * 2] = first;
      pairs[roleIndex * 2 + 1] = second;
      const laneGap = Math.abs(context.signals[first][roleIndex] - context.signals[second][roleIndex]);
      pairRoles(
        roleIndex + 1,
        nextMask,
        pairs,
        nextOffRoleCount,
        laneGapTotal + laneGap,
        Math.max(maxLaneGap, laneGap),
        preferenceTotal + context.preferences[first][roleIndex] + context.preferences[second][roleIndex],
        context,
      );
    }
  }
}

function orientTeams(
  pairs: number[],
  offRoleCount: number,
  laneGapTotal: number,
  maxLaneGap: number,
  preferenceTotal: number,
  context: SearchContext,
) {
  for (let orientation = 0; orientation < 1 << ROLES.length; orientation += 1) {
    let blueMask = 0;
    let blueTotal = 0;
    let redTotal = 0;
    const roleDeltas = new Array<number>(ROLES.length);
    for (let roleIndex = 0; roleIndex < ROLES.length; roleIndex += 1) {
      const swap = (orientation & (1 << roleIndex)) !== 0;
      const blue = pairs[roleIndex * 2 + (swap ? 1 : 0)];
      const red = pairs[roleIndex * 2 + (swap ? 0 : 1)];
      blueMask |= 1 << blue;
      blueTotal += context.signals[blue][roleIndex];
      redTotal += context.signals[red][roleIndex];
      roleDeltas[roleIndex] = context.signals[blue][roleIndex] - context.signals[red][roleIndex];
    }
    // Swapping every blue and red player produces the same team composition.
    if (!(blueMask & 1)) continue;
    if (!sameTeamConstraintsSatisfied(blueMask, context.sameTeamPairs)) continue;
    if (offRoleCount > context.minimumOffRoles) continue;
    if (offRoleCount < context.minimumOffRoles) {
      context.minimumOffRoles = offRoleCount;
      context.bestByTeamMask.clear();
    }
    const teamGap = Math.abs(blueTotal - redTotal) / 5;
    const repeat = repeatPenalty(blueMask, context.repeatWeights, context.recentWeightTotal);
    const cost = 0.35 * teamGap + 0.30 * (laneGapTotal / 5)
      + 0.15 * maxLaneGap + 0.15 * (preferenceTotal / PLAYER_COUNT) + 0.05 * repeat;
    const laneAdvantage = summarizeLaneAdvantage(roleDeltas);
    const advantageImbalance = Math.abs(laneAdvantage.blueCount - laneAdvantage.redCount);
    const existing = context.bestByTeamMask.get(blueMask);
    if (existing && compareLanePriority(existing.laneAdvantage, existing.cost, laneAdvantage, cost) <= 0) continue;
    const slots = new Array<number>(PLAYER_COUNT);
    for (let roleIndex = 0; roleIndex < ROLES.length; roleIndex += 1) {
      const swap = (orientation & (1 << roleIndex)) !== 0;
      slots[roleIndex * 2] = pairs[roleIndex * 2 + (swap ? 1 : 0)];
      slots[roleIndex * 2 + 1] = pairs[roleIndex * 2 + (swap ? 0 : 1)];
    }
    context.bestByTeamMask.set(blueMask, {
      signature: teamSignature(blueMask, context.players),
      slots,
      cost,
      teamGap,
      maxLaneGap,
      laneAdvantage,
      advantageImbalance,
    });
  }
}

export function summarizeLaneAdvantage(roleDeltas: number[]): LaneAdvantage {
  let blueCount = 0;
  let redCount = 0;
  let neutralCount = 0;
  const lanes = [roleDeltas[0], roleDeltas[1], roleDeltas[2], (roleDeltas[3] + roleDeltas[4]) / 2];
  for (const lane of lanes) {
    if (Math.abs(lane) <= NEUTRAL_LANE_GAP) neutralCount += 1;
    else if (lane > 0) blueCount += 1;
    else redCount += 1;
  }
  return {blueCount, redCount, neutralCount, balanced: blueCount === redCount};
}

export function compareLanePriority(
  left: LaneAdvantage,
  leftCost: number,
  right: LaneAdvantage,
  rightCost: number,
) {
  const leftImbalance = Math.abs(left.blueCount - left.redCount);
  const rightImbalance = Math.abs(right.blueCount - right.redCount);
  if (leftImbalance !== rightImbalance) return leftImbalance - rightImbalance;
  if (left.neutralCount !== right.neutralCount) return right.neutralCount - left.neutralCount;
  return leftCost - rightCost;
}

function buildRepeatWeights(players: PlayerProfile[], recent: TeamSession[]) {
  const result = Array.from({length: PLAYER_COUNT}, () => new Array<number>(PLAYER_COUNT).fill(0));
  const indexById = new Map(players.map((player, index) => [player.discordUserId, index]));
  recent.forEach((session, sessionIndex) => {
    const decay = Math.pow(0.85, sessionIndex);
    [session.composition.blue, session.composition.red].forEach((team) => {
      for (let left = 0; left < team.length; left += 1) {
        const leftIndex = indexById.get(team[left].discordUserId);
        if (leftIndex === undefined) continue;
        for (let right = left + 1; right < team.length; right += 1) {
          const rightIndex = indexById.get(team[right].discordUserId);
          if (rightIndex !== undefined) {
            const low = Math.min(leftIndex, rightIndex);
            const high = Math.max(leftIndex, rightIndex);
            result[low][high] += decay;
          }
        }
      }
    });
  });
  return result;
}

function repeatPenalty(blueMask: number, weights: number[][], recentWeightTotal: number) {
  if (!recentWeightTotal) return 0;
  let repeated = 0;
  for (let left = 0; left < PLAYER_COUNT; left += 1) {
    for (let right = left + 1; right < PLAYER_COUNT; right += 1) {
      const sameTeam = Boolean(blueMask & (1 << left)) === Boolean(blueMask & (1 << right));
      if (sameTeam) repeated += weights[left][right];
    }
  }
  return repeated / (20 * recentWeightTotal);
}

function teamSignature(blueMask: number, players: PlayerProfile[]) {
  const blue: string[] = [];
  const red: string[] = [];
  players.forEach((player, index) => (blueMask & (1 << index) ? blue : red).push(player.discordUserId));
  const first = blue.join("-");
  const second = red.join("-");
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

function toComposition(candidate: Candidate, players: PlayerProfile[]): TeamComposition {
  const blue: TeamAssignment[] = [];
  const red: TeamAssignment[] = [];
  for (let roleIndex = 0; roleIndex < ROLES.length; roleIndex += 1) {
    blue.push(assignment(players[candidate.slots[roleIndex * 2]], ROLES[roleIndex]));
    red.push(assignment(players[candidate.slots[roleIndex * 2 + 1]], ROLES[roleIndex]));
  }
  const balanceGrade = candidate.laneAdvantage.balanced
    && candidate.teamGap <= 0.03 && candidate.maxLaneGap <= 0.10
    ? "매우 균형"
    : candidate.laneAdvantage.balanced
      && candidate.teamGap <= 0.06 && candidate.maxLaneGap <= 0.18 ? "균형" : "보통";
  return {
    algorithmVersion: ALGORITHM_VERSION,
    signature: candidate.signature,
    blue,
    red,
    cost: candidate.cost,
    teamGap: candidate.teamGap,
    maxLaneGap: candidate.maxLaneGap,
    balanceGrade,
    laneAdvantage: candidate.laneAdvantage,
  };
}

function signal(
  player: PlayerProfile,
  role: Role,
  rating: InhousePlayerRating | undefined,
  prior: number,
) {
  const defaultTier = tierScore(player.soloRank, player.flexRank);
  const currentTier = tierScore(player.soloRank, player.flexRank, prior);
  const stored = player.schemaVersion >= 2
    ? player.roleStats?.[role]?.balanceSignal
    : undefined;
  const performance = stored === undefined
    ? currentTier
    : Math.max(0, Math.min(1, stored + currentTier - defaultTier));
  if (!rating?.matchCount) return performance;
  const roleRating = rating.roleRatings?.[role];
  const effectiveElo = OVERALL_RATING_WEIGHT * rating.elo
    + ROLE_RATING_WEIGHT * (roleRating?.elo ?? 1500);
  const inhouse = Math.max(0, Math.min(1, 0.5 + (effectiveElo - 1500) / 800));
  const evidence = OVERALL_RATING_WEIGHT * rating.matchCount
    + ROLE_RATING_WEIGHT * (roleRating?.matchCount ?? 0);
  const weight = Math.min(evidence / 10, 1) * MAX_INHOUSE_WEIGHT;
  return performance * (1 - weight) + inhouse * weight;
}

function groupPrior(players: PlayerProfile[]) {
  let observed = players
    .map((player) => observedRankScore(player.soloRank, UNRANKED))
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
  if (!observed.length) observed = players
    .map((player) => observedRankScore(player.soloRank, player.flexRank))
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
  if (!observed.length) return DEFAULT_TIER_PRIOR;
  const middle = Math.floor(observed.length / 2);
  return observed.length % 2
    ? observed[middle]
    : (observed[middle - 1] + observed[middle]) / 2;
}

const UNRANKED = {tier: "UNRANKED", division: "", leaguePoints: 0, wins: 0, losses: 0};

function preferencePenalty(player: PlayerProfile, role: Role) {
  return 1 - resolveRolePreferences(player)[role] / 100;
}

const offRole = (preference: number) => preference === 1 ? 1 : 0;

function assignment(player: PlayerProfile, role: Role): TeamAssignment {
  const stats = player.roleStats?.[role];
  const soloScore = rankScore(player.soloRank);
  const flexScore = rankScore(player.flexRank);
  const rankQueue = soloScore >= flexScore && soloScore >= 0 ? "SOLO" : flexScore >= 0 ? "FLEX" : null;
  const rank = rankQueue === "SOLO" ? player.soloRank : rankQueue === "FLEX" ? player.flexRank : null;
  return {
    discordUserId: player.discordUserId,
    displayName: player.displayName,
    role,
    rank: rankTierDisplay(rank),
    rankQueue,
    offRole: preferencePenalty(player, role) === 1,
    lowConfidence: !stats || stats.confidence < 0.6,
  };
}

function canPlayRole(playerIndex: number, roleIndex: number, context: SearchContext) {
  const locked = context.lockedRoleIndexes[playerIndex];
  return locked < 0 || locked === roleIndex;
}

function sameTeamConstraintsSatisfied(blueMask: number, pairs: Array<[number, number]>) {
  return pairs.every(([left, right]) =>
    Boolean(blueMask & (1 << left)) === Boolean(blueMask & (1 << right)));
}

const TIERS = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"];
const DIVISIONS = ["IV", "III", "II", "I"];
function rankScore(rank: PlayerProfile["soloRank"]) {
  const tier = TIERS.indexOf(rank?.tier ?? "");
  if (tier < 0) return -1;
  const division = Math.max(0, DIVISIONS.indexOf(rank.division));
  return tier * 4 + division;
}

function weightedChoice(candidates: Candidate[], best: number, random: () => number) {
  const weights = candidates.map((candidate) => Math.exp(-(candidate.cost - best) / 0.03));
  let draw = random() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let index = 0; index < candidates.length; index += 1) {
    draw -= weights[index];
    if (draw <= 0) return candidates[index];
  }
  return candidates[candidates.length - 1];
}

export function javaRandom(seed: number): () => number {
  const multiplier = BigInt("25214903917");
  const addend = BigInt(11);
  const mask = (BigInt(1) << BigInt(48)) - BigInt(1);
  let state = (BigInt(seed) ^ multiplier) & mask;
  const next = (bits: number) => {
    state = (state * multiplier + addend) & mask;
    return Number(state >> (BigInt(48) - BigInt(bits)));
  };
  return () => ((next(26) * 134_217_728) + next(27)) / 9_007_199_254_740_992;
}
