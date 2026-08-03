import type {MatchResult, MatchReviewIssue, MatchReviewTarget, MatchTeam} from "@/lib/lol/types";

export function matchReviewStatus(result: MatchResult) {
  return result.reviewStatus ?? "PUBLISHED";
}

export function matchReviewIssues(result: MatchResult) {
  return result.reviewIssues ?? [];
}

export function isPublishedMatch(result: MatchResult) {
  return matchReviewStatus(result) === "PUBLISHED";
}

export function reviewTargetKey(target: MatchReviewTarget): string {
  if (target.scope === "TEAM") return `team:${target.team}:ban:${target.slot}`;
  return `participant:${target.team}:${target.role}:${target.field}:${target.slot ?? ""}`;
}

export function reviewTargetValue(result: MatchResult, target: MatchReviewTarget): number | string | null | undefined {
  if (target.scope === "TEAM") {
    return result.teamStats.find((stats) => stats.team === target.team)?.bans[target.slot]?.id ?? null;
  }
  const participant = result.participants.find((entry) => entry.team === target.team && entry.role === target.role);
  if (!participant) return undefined;
  switch (target.field) {
    case "level": return participant.level;
    case "champion": return participant.champion.id;
    case "primaryPerk": return participant.primaryPerk.id;
    case "summonerSpell": return participant.summonerSpells[target.slot ?? -1]?.id;
    case "item": return participant.items[target.slot ?? -1]?.id ?? null;
    case "trinket": return participant.trinket?.id ?? null;
    case "questSlot": return participant.questSlot?.id ?? null;
  }
}

export function issueForTarget(issues: MatchReviewIssue[], target: MatchReviewTarget) {
  const key = reviewTargetKey(target);
  return issues.find((issue) => issue.key === key);
}

export function swapReviewTarget(target: MatchReviewTarget): MatchReviewTarget {
  const opposite = (team: MatchTeam): MatchTeam => team === "BLUE" ? "RED" : "BLUE";
  return {...target, team: opposite(target.team)};
}
