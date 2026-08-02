import {describe, expect, it} from "vitest";
import {calculateInhouseRatings, inhouseBalanceSignal} from "@/lib/lol/inhouse-rating";
import {makeStoredResult} from "@/lib/lol/match-result-test-fixtures";

describe("inhouse Elo", () => {
  it("applies a valid 5v5 result immediately and deterministically", () => {
    const result = makeStoredResult();
    const snapshot = calculateInhouseRatings([result], 123);
    expect(snapshot.sourceMatchCount).toBe(1);
    expect(snapshot.ratings).toHaveLength(10);
    expect(snapshot.ratings.find((rating) => rating.discordUserId === "player-1")).toMatchObject({elo: 1516, matchCount: 1});
    expect(snapshot.ratings.find((rating) => rating.discordUserId === "player-6")).toMatchObject({elo: 1484, matchCount: 1});
    expect(calculateInhouseRatings([result], 123)).toEqual(snapshot);
  });

  it("keeps guest or partially mapped results as record-only", () => {
    const result = makeStoredResult();
    result.participants[0] = {...result.participants[0], discordUserId: null, guest: true};
    expect(calculateInhouseRatings([result]).sourceMatchCount).toBe(0);
  });

  it("normalizes Elo into the balancing range", () => {
    expect(inhouseBalanceSignal(1500)).toBe(.5);
    expect(inhouseBalanceSignal(1100)).toBe(0);
    expect(inhouseBalanceSignal(1900)).toBe(1);
  });
});
