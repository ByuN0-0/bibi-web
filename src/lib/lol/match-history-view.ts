import type {MatchResultParticipant, PublicMatchResult, PublicMatchResultParticipant, Role} from "@/lib/lol/types";
import {ROLES} from "@/lib/lol/types";

type HistoryResult = Pick<PublicMatchResult, "playedOn">;
type HistoryParticipant = Pick<MatchResultParticipant | PublicMatchResultParticipant, "role">;

export type MatchHistoryDateGroup<T extends HistoryResult> = {
  playedOn: string;
  results: T[];
};

const ROLE_ORDER = new Map<Role, number>(ROLES.map((role, index) => [role, index]));

export function groupMatchResultsByDate<T extends HistoryResult>(results: T[]): MatchHistoryDateGroup<T>[] {
  const grouped = new Map<string, T[]>();

  for (const result of results) {
    const dateResults = grouped.get(result.playedOn);
    if (dateResults) dateResults.push(result);
    else grouped.set(result.playedOn, [result]);
  }

  return Array.from(grouped, ([playedOn, dateResults]) => ({playedOn, results: dateResults}))
    .sort((left, right) => right.playedOn.localeCompare(left.playedOn));
}

export function sortParticipantsByRole<T extends HistoryParticipant>(participants: T[]): T[] {
  return [...participants].sort((left, right) =>
    (ROLE_ORDER.get(left.role) ?? ROLES.length) - (ROLE_ORDER.get(right.role) ?? ROLES.length));
}

export function comparisonShare(left: number, right: number): number {
  const total = left + right;
  if (total <= 0) return 50;
  return Math.max(0, Math.min(100, (left / total) * 100));
}
