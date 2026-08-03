import {describe, expect, it} from "vitest";
import {buildMatchHistoryPlayerLookup, comparisonShare, formatCsPerMinute, formatKdaRatio, groupMatchResultsByDate, playerNameKey, sortParticipantsByRole} from "@/lib/lol/match-history-view";
import type {RankInfo} from "@/lib/lol/types";

const unranked = (): RankInfo => ({tier: "UNRANKED", division: null, leaguePoints: 0, wins: 0, losses: 0});

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

  it("formats player detail ratios and stable name lookup keys", () => {
    expect(formatKdaRatio(8, 2, 6)).toBe("7.00:1");
    expect(formatKdaRatio(3, 0, 9)).toBe("Perfect");
    expect(formatCsPerMinute(210, 1800)).toBe("7.0");
    expect(formatCsPerMinute(0, 0)).toBe("0.0");
    expect(playerNameKey("  내 연  ")).toBe("내 연");
  });

  it("matches alternate Riot accounts to the registered player name and account rank", () => {
    const primaryRank = {...unranked(), tier: "GOLD" as const, division: "II" as const};
    const alternateRank = {...unranked(), tier: "DIAMOND" as const, division: "IV" as const};
    const players = [{
      discordUserId: "player-1", displayName: "비연", riotGameName: "대표계정", riotTagLine: "KR1",
      soloRank: primaryRank, flexRank: unranked(),
    }];
    const lookup = buildMatchHistoryPlayerLookup(players, [{
      discordUserId: "player-1", riotGameName: "숨겨둔부계정", riotTagLine: "KR2",
      soloRank: alternateRank, flexRank: unranked(),
    }]);

    expect(lookup[playerNameKey("대표계정")]).toMatchObject({displayName: "비연", soloRank: primaryRank});
    expect(lookup[playerNameKey("숨겨둔부계정")]).toMatchObject({displayName: "비연", soloRank: alternateRank});
    expect(lookup[playerNameKey("숨겨둔부계정#KR2")]).toMatchObject({displayName: "비연", soloRank: alternateRank});
  });
});
