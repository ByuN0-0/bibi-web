import {describe, expect, it} from "vitest";
import {makeStoredResult} from "@/lib/lol/match-result-test-fixtures";
import {swapMatchTeams, swapRecognitionReviews} from "@/lib/lol/match-result-draft";

describe("match result team swap", () => {
  it("swaps both complete teams and the winner", () => {
    const original = makeStoredResult();
    const swapped = swapMatchTeams(original);
    expect(swapped.winner).toBe("RED");
    expect(swapped.teamStats.find((stats) => stats.team === "RED")?.kills).toBe(original.teamStats.find((stats) => stats.team === "BLUE")?.kills);
    expect(swapped.participants.slice(0, 5).every((participant) => participant.team === "BLUE")).toBe(true);
    expect(swapped.participants[0].observedName).toBe(original.participants[5].observedName);
    expect(swapMatchTeams(swapped)).toEqual(original);
  });

  it("moves recognition fields with their team", () => {
    const reviews = swapRecognitionReviews([
      {id: "ban", field: "teamStats[0].bans[2]", kind: "ban", selected: {id: "A", name: "A", iconPath: "img/champion/A.png"}, score: 1, runnerUpGap: 2},
      {id: "player", field: "participants[8].items[3]", kind: "item", selected: {id: "1", name: "I", iconPath: "img/item/1.png"}, score: 1, runnerUpGap: 2},
    ]);
    expect(reviews.map((review) => review.field)).toEqual(["teamStats[1].bans[2]", "participants[3].items[3]"]);
  });
});
