import type {MatchRecognitionReview, MatchResultDraft, MatchTeam} from "@/lib/lol/types";
import {ROLES} from "@/lib/lol/types";

export function swapMatchTeams<T extends MatchResultDraft>(draft: T): T {
  const opposite = (team: MatchTeam): MatchTeam => team === "BLUE" ? "RED" : "BLUE";
  return {
    ...draft,
    winner: opposite(draft.winner),
    teamStats: draft.teamStats.map((stats) => ({...stats, team: opposite(stats.team)}))
      .sort((left, right) => teamIndex(left.team) - teamIndex(right.team)),
    participants: draft.participants.map((participant) => ({...participant, team: opposite(participant.team)}))
      .sort((left, right) => teamIndex(left.team) - teamIndex(right.team) || ROLES.indexOf(left.role) - ROLES.indexOf(right.role)),
  };
}

export function swapRecognitionReviews(reviews: MatchRecognitionReview[]): MatchRecognitionReview[] {
  return reviews.map((review) => ({...review, field: review.field
    .replace(/^teamStats\[(0|1)]/, (_, index) => `teamStats[${index === "0" ? 1 : 0}]`)
    .replace(/^participants\[(\d+)]/, (_, rawIndex) => {
      const index = Number(rawIndex);
      return `participants[${index < 5 ? index + 5 : index - 5}]`;
    })}));
}

function teamIndex(team: MatchTeam) {
  return team === "BLUE" ? 0 : 1;
}
