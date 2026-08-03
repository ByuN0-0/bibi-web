import {ROLES, type Role, type TeamAssignment, type TeamComposition} from "@/lib/lol/types";

export const RANK_TIERS = [
  "IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER",
] as const;

export type RankTier = (typeof RANK_TIERS)[number] | "UNRANKED";

export function rankTierFromText(rank: string): RankTier {
  const tier = rank.trim().split(/\s+/)[0]?.toUpperCase();
  return RANK_TIERS.includes(tier as (typeof RANK_TIERS)[number]) ? tier as RankTier : "UNRANKED";
}

export function rankTierIconPath(rank: string): string {
  const tier = rankTierFromText(rank);
  return tier === "UNRANKED" ? "/images/ranks/unranked.svg" : `/images/ranks/${tier.toLowerCase()}.webp`;
}

export function formatTeamCompositionText(composition: Pick<TeamComposition, "blue" | "red">): string {
  return ["탑/정/미/원/서", formatTeam("B", composition.blue), formatTeam("R", composition.red)].join("\n");
}

function formatTeam(title: string, assignments: TeamAssignment[]) {
  const byRole = new Map<Role, TeamAssignment>(assignments.map((assignment) => [assignment.role, assignment]));
  const players = ROLES.map((role) => byRole.get(role)?.displayName ?? "-").join("/");
  return `${title} ${players}`;
}
