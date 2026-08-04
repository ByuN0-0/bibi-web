import {ROLES, type Role, type TeamConstraints} from "@/lib/lol/types";

export const emptyTeamConstraints = (): TeamConstraints => ({roleLocks: [], sameTeamPairs: []});

export class TeamConstraintError extends Error {}

export function parseTeamConstraints(input: unknown, selectedDiscordUserIds: string[]): TeamConstraints {
  if (input === undefined || input === null) return emptyTeamConstraints();
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TeamConstraintError("팀 편성 조건이 올바르지 않습니다.");
  }
  const body = input as Record<string, unknown>;
  if (body.roleLocks !== undefined && !Array.isArray(body.roleLocks)) {
    throw new TeamConstraintError("라인 고정 조건이 올바르지 않습니다.");
  }
  if (body.sameTeamPairs !== undefined && !Array.isArray(body.sameTeamPairs)) {
    throw new TeamConstraintError("같은 팀 조건이 올바르지 않습니다.");
  }
  const selected = new Set(selectedDiscordUserIds);
  const rawLocks = Array.isArray(body.roleLocks) ? body.roleLocks : [];
  const rawPairs = Array.isArray(body.sameTeamPairs) ? body.sameTeamPairs : [];
  if (rawLocks.length > 10 || rawPairs.length > 45) {
    throw new TeamConstraintError("팀 편성 조건이 너무 많습니다.");
  }

  const lockedPlayers = new Set<string>();
  const roleCounts = new Map<Role, number>();
  const roleLocks = rawLocks.map((raw) => {
    const value = object(raw);
    if (typeof value.discordUserId !== "string" || typeof value.role !== "string") {
      throw new TeamConstraintError("라인 고정 조건이 올바르지 않습니다.");
    }
    const discordUserId = value.discordUserId;
    const role = value.role as Role;
    if (!selected.has(discordUserId)) throw new TeamConstraintError("선택되지 않은 선수의 라인을 고정할 수 없습니다.");
    if (!ROLES.includes(role)) throw new TeamConstraintError("고정할 라인이 올바르지 않습니다.");
    if (lockedPlayers.has(discordUserId)) throw new TeamConstraintError("한 선수의 라인을 두 번 고정할 수 없습니다.");
    lockedPlayers.add(discordUserId);
    roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
    if ((roleCounts.get(role) ?? 0) > 2) throw new TeamConstraintError("한 라인에는 최대 두 명만 고정할 수 있습니다.");
    return {discordUserId, role};
  });

  const parent = new Map(selectedDiscordUserIds.map((id) => [id, id]));
  const find = (id: string): string => {
    const current = parent.get(id)!;
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const union = (left: string, right: string) => parent.set(find(right), find(left));
  const pairKeys = new Set<string>();
  const sameTeamPairs = rawPairs.map((raw) => {
    const value = object(raw);
    if (typeof value.firstDiscordUserId !== "string" || typeof value.secondDiscordUserId !== "string") {
      throw new TeamConstraintError("같은 팀 조건이 올바르지 않습니다.");
    }
    const firstDiscordUserId = value.firstDiscordUserId;
    const secondDiscordUserId = value.secondDiscordUserId;
    if (!selected.has(firstDiscordUserId) || !selected.has(secondDiscordUserId)) {
      throw new TeamConstraintError("선택되지 않은 선수는 같은 팀으로 고정할 수 없습니다.");
    }
    if (firstDiscordUserId === secondDiscordUserId) throw new TeamConstraintError("같은 선수를 서로 묶을 수 없습니다.");
    const key = [firstDiscordUserId, secondDiscordUserId].sort().join(":");
    if (pairKeys.has(key)) throw new TeamConstraintError("같은 팀 조건이 중복되었습니다.");
    pairKeys.add(key);
    union(firstDiscordUserId, secondDiscordUserId);
    return {firstDiscordUserId, secondDiscordUserId};
  });

  const groups = new Map<string, string[]>();
  selectedDiscordUserIds.forEach((id) => groups.set(find(id), [...(groups.get(find(id)) ?? []), id]));
  for (const members of groups.values()) {
    if (members.length > 5) throw new TeamConstraintError("같은 팀으로 고정하는 선수는 최대 5명입니다.");
    const roles = members.map((id) => roleLocks.find((lock) => lock.discordUserId === id)?.role).filter(Boolean);
    if (new Set(roles).size !== roles.length) {
      throw new TeamConstraintError("같은 팀 선수 두 명을 같은 라인에 고정할 수 없습니다.");
    }
  }
  return {roleLocks, sameTeamPairs};
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TeamConstraintError("팀 편성 조건이 올바르지 않습니다.");
  }
  return value as Record<string, unknown>;
}
