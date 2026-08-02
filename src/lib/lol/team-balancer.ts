import {
  ALGORITHM_VERSION,
  rankTierDisplay,
  type InhousePlayerRating,
  type PlayerProfile,
  type Role,
  type TeamAssignment,
  type TeamComposition,
  type TeamSession,
} from "@/lib/lol/types";

const ROLES: Role[] = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
const PLAYER_COUNT = 10;
const FULL_PLAYER_MASK = (1 << PLAYER_COUNT) - 1;

type Candidate = {
  signature: string;
  slots: number[];
  cost: number;
  teamGap: number;
  maxLaneGap: number;
};

type SearchContext = {
  players: PlayerProfile[];
  signals: number[][];
  preferences: number[][];
  repeatWeights: number[][];
  recentWeightTotal: number;
  minimumOffRoles: number;
  minimumOffRoleMemo: number[][];
  bestByTeamMask: Map<number, Candidate>;
};

export function balanceTeam(
  players: PlayerProfile[],
  recent: TeamSession[],
  excludedSignatures = new Set<string>(),
  random: () => number = Math.random,
  ratings = new Map<string, InhousePlayerRating>(),
): TeamComposition {
  if (players.length !== PLAYER_COUNT) throw new Error("정확히 10명의 선수가 필요합니다.");
  if (new Set(players.map((player) => player.discordUserId)).size !== PLAYER_COUNT) {
    throw new Error("중복된 선수가 포함되어 있습니다.");
  }
  const ordered = [...players].sort((left, right) =>
    left.discordUserId < right.discordUserId ? -1 : left.discordUserId > right.discordUserId ? 1 : 0,
  );
  const signals = ordered.map((player) => ROLES.map((role) => signal(player, role, ratings.get(player.discordUserId))));
  const preferences = ordered.map((player) => ROLES.map((role) => preferencePenalty(player, role)));
  const minimumOffRoleMemo = Array.from({length: ROLES.length + 1}, () =>
    new Array<number>(1 << PLAYER_COUNT).fill(-1));
  const context: SearchContext = {
    players: ordered,
    signals,
    preferences,
    repeatWeights: buildRepeatWeights(ordered, recent),
    recentWeightTotal: recent.reduce((sum, _session, index) => sum + Math.pow(0.85, index), 0),
    minimumOffRoles: 0,
    minimumOffRoleMemo,
    bestByTeamMask: new Map(),
  };
  context.minimumOffRoles = minimumRemainingOffRoles(0, FULL_PLAYER_MASK, context);
  pairRoles(0, FULL_PLAYER_MASK, new Array<number>(PLAYER_COUNT), 0, 0, 0, 0, context);

  let candidates = [...context.bestByTeamMask.values()].sort((left, right) =>
    left.cost - right.cost
      || (left.signature < right.signature ? -1 : left.signature > right.signature ? 1 : 0),
  );
  if (!candidates.length) throw new Error("팀 조합을 계산할 수 없습니다.");
  const veryBalanced = candidates.filter((candidate) => candidate.teamGap <= 0.03 && candidate.maxLaneGap <= 0.10);
  const balanced = candidates.filter((candidate) => candidate.teamGap <= 0.06 && candidate.maxLaneGap <= 0.18);
  candidates = (veryBalanced.length ? veryBalanced : balanced.length ? balanced : candidates)
    .filter((candidate) => !excludedSignatures.has(candidate.signature)).slice(0, 20);
  if (!candidates.length) throw new Error("현재 조건에서 새로운 팀 조합이 없습니다.");
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
    for (let second = first + 1; second < PLAYER_COUNT; second += 1) {
      if (!(remainingMask & (1 << second))) continue;
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
    orientTeams(pairs, laneGapTotal, maxLaneGap, preferenceTotal, context);
    return;
  }
  for (let first = 0; first < PLAYER_COUNT; first += 1) {
    if (!(remainingMask & (1 << first))) continue;
    for (let second = first + 1; second < PLAYER_COUNT; second += 1) {
      if (!(remainingMask & (1 << second))) continue;
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
  laneGapTotal: number,
  maxLaneGap: number,
  preferenceTotal: number,
  context: SearchContext,
) {
  for (let orientation = 0; orientation < 1 << ROLES.length; orientation += 1) {
    let blueMask = 0;
    let blueTotal = 0;
    let redTotal = 0;
    for (let roleIndex = 0; roleIndex < ROLES.length; roleIndex += 1) {
      const swap = (orientation & (1 << roleIndex)) !== 0;
      const blue = pairs[roleIndex * 2 + (swap ? 1 : 0)];
      const red = pairs[roleIndex * 2 + (swap ? 0 : 1)];
      blueMask |= 1 << blue;
      blueTotal += context.signals[blue][roleIndex];
      redTotal += context.signals[red][roleIndex];
    }
    // Swapping every blue and red player produces the same team composition.
    if (!(blueMask & 1)) continue;
    const teamGap = Math.abs(blueTotal - redTotal) / 5;
    const repeat = repeatPenalty(blueMask, context.repeatWeights, context.recentWeightTotal);
    const cost = 0.35 * teamGap + 0.30 * (laneGapTotal / 5)
      + 0.15 * maxLaneGap + 0.15 * (preferenceTotal / PLAYER_COUNT) + 0.05 * repeat;
    const existing = context.bestByTeamMask.get(blueMask);
    if (existing && existing.cost <= cost) continue;
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
    });
  }
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
  const balanceGrade = candidate.teamGap <= 0.03 && candidate.maxLaneGap <= 0.10
    ? "매우 균형"
    : candidate.teamGap <= 0.06 && candidate.maxLaneGap <= 0.18 ? "균형" : "보통";
  return {
    algorithmVersion: ALGORITHM_VERSION,
    signature: candidate.signature,
    blue,
    red,
    cost: candidate.cost,
    teamGap: candidate.teamGap,
    maxLaneGap: candidate.maxLaneGap,
    balanceGrade,
  };
}

function signal(player: PlayerProfile, role: Role, rating?: InhousePlayerRating) {
  const performance = player.roleStats?.[role]?.balanceSignal ?? 0.35;
  if (!rating?.matchCount) return performance;
  const inhouse = Math.max(0, Math.min(1, 0.5 + (rating.elo - 1500) / 800));
  const weight = Math.min(rating.matchCount / 10, 1) * 0.30;
  return performance * (1 - weight) + inhouse * weight;
}

function preferencePenalty(player: PlayerProfile, role: Role) {
  if (player.primaryRole === role) return 0;
  if (player.secondaryRole === role) return 0.25;
  return 1;
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
