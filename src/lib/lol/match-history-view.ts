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

export function playerNameKey(name: string): string {
  return name.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

export function formatKdaRatio(kills: number, deaths: number, assists: number): string {
  if (deaths === 0) return "Perfect";
  return `${((kills + assists) / deaths).toFixed(2)}:1`;
}

export function formatCsPerMinute(cs: number, durationSeconds: number): string {
  if (durationSeconds <= 0) return "0.0";
  return (cs / (durationSeconds / 60)).toFixed(1);
}
