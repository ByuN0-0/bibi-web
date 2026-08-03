import {describe, expect, it} from "vitest";
import {comparisonShare, groupMatchResultsByDate, sortParticipantsByRole} from "@/lib/lol/match-history-view";

describe("match history view helpers", () => {
  it("groups matches by date in reverse chronological order while preserving each date's input order", () => {
    const results = [
      {matchResultId: "old-1", playedOn: "2026-07-30"},
      {matchResultId: "new-1", playedOn: "2026-08-01"},
      {matchResultId: "old-2", playedOn: "2026-07-30"},
      {matchResultId: "new-2", playedOn: "2026-08-01"},
    ];

    expect(groupMatchResultsByDate(results)).toEqual([
      {playedOn: "2026-08-01", results: [results[1], results[3]]},
      {playedOn: "2026-07-30", results: [results[0], results[2]]},
    ]);
  });

  it("orders participants from top through support regardless of input order", () => {
    const participants = [
      {role: "UTILITY" as const, name: "support"},
      {role: "MIDDLE" as const, name: "middle"},
      {role: "TOP" as const, name: "top"},
      {role: "BOTTOM" as const, name: "bottom"},
      {role: "JUNGLE" as const, name: "jungle"},
    ];

    expect(sortParticipantsByRole(participants).map((participant) => participant.name))
      .toEqual(["top", "jungle", "middle", "bottom", "support"]);
  });

  it("returns a balanced comparison when both values are zero", () => {
    expect(comparisonShare(0, 0)).toBe(50);
    expect(comparisonShare(30, 10)).toBe(75);
  });
});
