import {describe, expect, it} from "vitest";
import {
  sortPlayersByParticipation,
  summarizePlayerParticipation,
} from "@/lib/lol/player-participation";
import {makePlayers, makeStoredResult} from "@/lib/lol/match-result-test-fixtures";

describe("player participation", () => {
  it("counts each linked player once per published match", () => {
    const published = makeStoredResult();
    published.participants[1] = {
      ...published.participants[1],
      discordUserId: published.participants[0].discordUserId,
    };
    published.participants[2] = {
      ...published.participants[2],
      discordUserId: null,
      guest: true,
    };
    const pending = makeStoredResult();
    pending.matchResultId = "pending";
    pending.playedOn = "2026-08-03";
    pending.reviewStatus = "PENDING_REVIEW";

    const summary = summarizePlayerParticipation([published, pending]);

    expect(summary["player-1"]).toEqual({matchCount: 1, lastPlayedOn: "2026-08-02"});
    expect(summary["player-2"]).toBeUndefined();
    expect(summary["player-3"]).toBeUndefined();
    expect(summary["player-4"]).toEqual({matchCount: 1, lastPlayedOn: "2026-08-02"});
  });

  it("uses the most recent date while accumulating lifetime matches", () => {
    const older = makeStoredResult();
    older.playedOn = "2026-07-20";
    const newer = makeStoredResult();
    newer.matchResultId = "result-2";
    newer.playedOn = "2026-08-01";

    expect(summarizePlayerParticipation([newer, older])["player-1"]).toEqual({
      matchCount: 2,
      lastPlayedOn: "2026-08-01",
    });
  });

  it("sorts ready players by count, latest date, then Korean display name", () => {
    const players = makePlayers(5);
    players[0].displayName = "나";
    players[1].displayName = "가";
    players[2].displayName = "다";
    players[3].displayName = "라";
    players[4].displayName = "마";
    players[4].syncStatus = "FAILED";

    const sorted = sortPlayersByParticipation(players, {
      "player-1": {matchCount: 3, lastPlayedOn: "2026-08-01"},
      "player-2": {matchCount: 3, lastPlayedOn: "2026-08-02"},
      "player-3": {matchCount: 1, lastPlayedOn: "2026-08-03"},
      "player-4": {matchCount: 1, lastPlayedOn: "2026-08-03"},
      "player-5": {matchCount: 99, lastPlayedOn: "2026-08-03"},
    });

    expect(sorted.map((player) => player.discordUserId)).toEqual([
      "player-2",
      "player-1",
      "player-3",
      "player-4",
      "player-5",
    ]);
  });
});
