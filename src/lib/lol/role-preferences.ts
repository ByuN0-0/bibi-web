import {ROLES, type PlayerProfile, type Role, type RolePreferences} from "@/lib/lol/types";

export const EVEN_ROLE_PREFERENCES: RolePreferences = {
  TOP: 20,
  JUNGLE: 20,
  MIDDLE: 20,
  BOTTOM: 20,
  UTILITY: 20,
};

export function legacyRolePreferences(primaryRole: Role, secondaryRole: Role): RolePreferences {
  return Object.fromEntries(ROLES.map((role) => [
    role,
    role === primaryRole ? 80 : role === secondaryRole ? 20 : 0,
  ])) as RolePreferences;
}

export function parseRolePreferences(value: unknown): RolePreferences | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const entries: Array<[Role, number]> = [];
  for (const role of ROLES) {
    const preference = record[role];
    if (typeof preference !== "number" || !Number.isInteger(preference)
        || preference < 0 || preference > 100 || preference % 5 !== 0) return null;
    entries.push([role, preference]);
  }
  if (entries.reduce((sum, [, preference]) => sum + preference, 0) !== 100) return null;
  return Object.fromEntries(entries) as RolePreferences;
}

export function resolveRolePreferences(
  player: Pick<PlayerProfile, "primaryRole" | "secondaryRole" | "rolePreferences">,
): RolePreferences {
  return parseRolePreferences(player.rolePreferences)
    ?? legacyRolePreferences(player.primaryRole, player.secondaryRole);
}

export function preferredLegacyRoles(preferences: RolePreferences): [Role, Role] {
  const ordered = [...ROLES].sort((left, right) =>
    preferences[right] - preferences[left] || ROLES.indexOf(left) - ROLES.indexOf(right));
  return [ordered[0], ordered[1]];
}

export function normalizePlayerProfile(player: PlayerProfile): PlayerProfile {
  return {...player, rolePreferences: resolveRolePreferences(player)};
}

export function formatRolePreferences(preferences: RolePreferences, labels: Record<Role, string>) {
  return ROLES.filter((role) => preferences[role] > 0)
    .map((role) => `${labels[role]} ${preferences[role]}%`)
    .join(" · ");
}
