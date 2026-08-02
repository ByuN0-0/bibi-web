import {
  ALGORITHM_VERSION,
  rankDisplay,
  type PlayerProfile,
  type Role,
  type TeamAssignment,
  type TeamComposition,
  type TeamSession,
} from "@/lib/lol/types";

const SLOT_ROLES: Role[] = [
  "TOP", "TOP", "JUNGLE", "JUNGLE", "MIDDLE", "MIDDLE",
  "BOTTOM", "BOTTOM", "UTILITY", "UTILITY",
];

type Candidate = TeamComposition & {offRoleCount: number};

export function balanceTeam(
  players: PlayerProfile[],
  recent: TeamSession[],
  excludedSignatures = new Set<string>(),
  random: () => number = Math.random,
): TeamComposition {
  if (players.length !== 10) throw new Error("정확히 10명의 선수가 필요합니다.");
  if (new Set(players.map((player) => player.discordUserId)).size !== 10) {
    throw new Error("중복된 선수가 포함되어 있습니다.");
  }
  const ordered = [...players].sort((left, right) =>
    left.discordUserId < right.discordUserId ? -1 : left.discordUserId > right.discordUserId ? 1 : 0,
  );
  const bestBySignature = new Map<string, Candidate>();
  const slots = new Array<PlayerProfile>(10);
  const used = new Array<boolean>(10).fill(false);

  const permute = (depth: number) => {
    if (depth === 10) {
      if (!isCanonical(slots)) return;
      const candidate = evaluate(slots, recent);
      const existing = bestBySignature.get(candidate.signature);
      if (!existing || candidate.offRoleCount < existing.offRoleCount
          || candidate.offRoleCount === existing.offRoleCount && candidate.cost < existing.cost) {
        bestBySignature.set(candidate.signature, candidate);
      }
      return;
    }
    for (let index = 0; index < ordered.length; index += 1) {
      if (used[index]) continue;
      used[index] = true;
      slots[depth] = ordered[index];
      permute(depth + 1);
      used[index] = false;
    }
  };
  permute(0);

  const candidates = [...bestBySignature.values()].sort((left, right) =>
    left.offRoleCount - right.offRoleCount || left.cost - right.cost
      || (left.signature < right.signature ? -1 : left.signature > right.signature ? 1 : 0),
  );
  if (!candidates.length) throw new Error("팀 조합을 계산할 수 없습니다.");
  const minimumOffRoles = candidates[0].offRoleCount;
  const preferredCandidates = candidates.filter((candidate) => candidate.offRoleCount === minimumOffRoles);
  const best = preferredCandidates[0].cost;
  const eligible = preferredCandidates
    .filter((candidate) => candidate.cost <= best + 0.05)
    .filter((candidate) => !excludedSignatures.has(candidate.signature))
    .slice(0, 20);
  if (!eligible.length) throw new Error("현재 조건에서 새로운 팀 조합이 없습니다.");
  const {offRoleCount: _offRoleCount, ...composition} = weightedChoice(eligible, best, random);
  void _offRoleCount;
  return composition;
}

function isCanonical(slots: PlayerProfile[]) {
  const smallest = slots.reduce(
    (value, player) => player.discordUserId < value ? player.discordUserId : value,
    slots[0].discordUserId,
  );
  for (let index = 0; index < slots.length; index += 2) {
    if (slots[index].discordUserId === smallest) return true;
  }
  return false;
}

function evaluate(slots: PlayerProfile[], recent: TeamSession[]): Candidate {
  let blueTotal = 0;
  let redTotal = 0;
  let laneGapTotal = 0;
  let maxLaneGap = 0;
  let preference = 0;
  let offRoleCount = 0;
  const blue: TeamAssignment[] = [];
  const red: TeamAssignment[] = [];
  for (let index = 0; index < slots.length; index += 2) {
    const role = SLOT_ROLES[index];
    const bluePlayer = slots[index];
    const redPlayer = slots[index + 1];
    const blueSignal = signal(bluePlayer, role);
    const redSignal = signal(redPlayer, role);
    blueTotal += blueSignal;
    redTotal += redSignal;
    const laneGap = Math.abs(blueSignal - redSignal);
    laneGapTotal += laneGap;
    maxLaneGap = Math.max(maxLaneGap, laneGap);
    const bluePreference = preferencePenalty(bluePlayer, role);
    const redPreference = preferencePenalty(redPlayer, role);
    preference += bluePreference + redPreference;
    if (bluePreference === 1) offRoleCount += 1;
    if (redPreference === 1) offRoleCount += 1;
    blue.push(assignment(bluePlayer, role));
    red.push(assignment(redPlayer, role));
  }
  const teamGap = Math.abs(blueTotal - redTotal) / 5;
  const averageLaneGap = laneGapTotal / 5;
  const preferenceCost = preference / 10;
  const signature = teamSignature(blue, red);
  const repeat = repeatPenalty(blue, red, recent);
  const cost = 0.35 * teamGap + 0.30 * averageLaneGap
    + 0.15 * maxLaneGap + 0.15 * preferenceCost + 0.05 * repeat;
  const balanceGrade = teamGap <= 0.03 && maxLaneGap <= 0.10
    ? "매우 균형"
    : teamGap <= 0.06 && maxLaneGap <= 0.18 ? "균형" : "보통";
  return {
    algorithmVersion: ALGORITHM_VERSION,
    signature,
    blue,
    red,
    cost,
    teamGap,
    maxLaneGap,
    balanceGrade,
    offRoleCount,
  };
}

function signal(player: PlayerProfile, role: Role) {
  return player.roleStats?.[role]?.balanceSignal ?? 0.35;
}

function preferencePenalty(player: PlayerProfile, role: Role) {
  if (player.primaryRole === role) return 0;
  if (player.secondaryRole === role) return 0.25;
  return 1;
}

function assignment(player: PlayerProfile, role: Role): TeamAssignment {
  const stats = player.roleStats?.[role];
  const rank = player.soloRank?.tier !== "UNRANKED" ? player.soloRank : player.flexRank;
  return {
    discordUserId: player.discordUserId,
    displayName: player.displayName,
    role,
    rank: rankDisplay(rank),
    offRole: preferencePenalty(player, role) === 1,
    lowConfidence: !stats || stats.confidence < 0.6,
  };
}

function repeatPenalty(blue: TeamAssignment[], red: TeamAssignment[], recent: TeamSession[]) {
  if (!recent.length) return 0;
  const current = teammatePairs(blue, red);
  let repeated = 0;
  recent.forEach((session) => {
    const previous = teammatePairs(session.composition.blue, session.composition.red);
    current.forEach((pair) => {
      if (previous.has(pair)) repeated += 1;
    });
  });
  return repeated / (20 * recent.length);
}

function teammatePairs(blue: TeamAssignment[], red: TeamAssignment[]) {
  const result = new Set<string>();
  [blue, red].forEach((team) => {
    for (let left = 0; left < team.length; left += 1) {
      for (let right = left + 1; right < team.length; right += 1) {
        const one = team[left].discordUserId;
        const two = team[right].discordUserId;
        result.add(one < two ? `${one}:${two}` : `${two}:${one}`);
      }
    }
  });
  return result;
}

function teamSignature(blue: TeamAssignment[], red: TeamAssignment[]) {
  const first = blue.map((player) => player.discordUserId).sort().join("-");
  const second = red.map((player) => player.discordUserId).sort().join("-");
  return first < second ? `${first}|${second}` : `${second}|${first}`;
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
