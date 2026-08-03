import {describe, expect, it} from "vitest";
import {makeStoredResult} from "@/lib/lol/match-result-test-fixtures";
import {swapMatchTeams} from "@/lib/lol/match-result-draft";

describe("match result team swap", () => {
  it("swaps both complete teams and the winner", () => {
    const original = makeStoredResult();
    original.reviewIssues = [{
      key: "participant:BLUE:TOP:level:",
      target: {scope: "PARTICIPANT", team: "BLUE", role: "TOP", field: "level"},
      reasons: ["LEVEL_UNRESOLVED"],
      status: "OPEN",
    }];
    const swapped = swapMatchTeams(original);
    expect(swapped.winner).toBe("RED");
    expect(swapped.teamStats.find((stats) => stats.team === "RED")?.kills).toBe(original.teamStats.find((stats) => stats.team === "BLUE")?.kills);
    expect(swapped.participants.slice(0, 5).every((participant) => participant.team === "BLUE")).toBe(true);
    expect(swapped.participants[0].observedName).toBe(original.participants[5].observedName);
    expect(swapped.reviewIssues?.[0]).toMatchObject({
      key: "participant:RED:TOP:level:",
      target: {scope: "PARTICIPANT", team: "RED", role: "TOP", field: "level"},
    });
    expect(swapMatchTeams(swapped)).toEqual(original);
  });
});
