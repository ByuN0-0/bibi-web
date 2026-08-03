import type {MatchResult, MatchTeam} from "@/lib/lol/types";
import {ROLES} from "@/lib/lol/types";
import {reviewTargetKey, swapReviewTarget} from "@/lib/lol/match-review";

export function swapMatchTeams<T extends MatchResult>(draft: T): T {
  const opposite = (team: MatchTeam): MatchTeam => team === "BLUE" ? "RED" : "BLUE";
  return {
    ...draft,
    winner: opposite(draft.winner),
    teamStats: draft.teamStats.map((stats) => ({...stats, team: opposite(stats.team)}))
      .sort((left, right) => teamIndex(left.team) - teamIndex(right.team)),
    participants: draft.participants.map((participant) => ({...participant, team: opposite(participant.team)}))
      .sort((left, right) => teamIndex(left.team) - teamIndex(right.team) || ROLES.indexOf(left.role) - ROLES.indexOf(right.role)),
    reviewIssues: draft.reviewIssues?.map((issue) => {
      const target = swapReviewTarget(issue.target);
      return {...issue, target, key: reviewTargetKey(target)};
    }),
  };
}

function teamIndex(team: MatchTeam) {
  return team === "BLUE" ? 0 : 1;
}
