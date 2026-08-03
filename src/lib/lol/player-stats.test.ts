import {describe, expect, it} from "vitest";
import {summarizePlayerStats} from "@/lib/lol/player-stats";
import {makePlayers, makeStoredResult} from "@/lib/lol/match-result-test-fixtures";
import type {MatchResult} from "@/lib/lol/types";

describe("player inhouse stats", () => {
  it("aggregates published registered-player stats and ignores pending, guests and removed players", () => {
    const players = makePlayers();
    const published = match({id: "published", date: "2026-08-02", winner: "BLUE"});
    Object.assign(published.participants[0], {
      kills: 4, deaths: 0, assists: 6, cs: 150, goldEarned: 12_000,
    });
    published.teamStats[0].kills = 10;
    published.participants[1] = {...published.participants[1], discordUserId: null, guest: true};
    const pending = match({id: "pending", date: "2026-08-03", winner: "RED"});
    pending.reviewStatus = "PENDING_REVIEW";

    const stats = summarizePlayerStats([pending, published], players.slice(0, 9));
    const player = stats["player-1"];

    expect(player.overall).toMatchObject({
      matchCount: 1,
      wins: 1,
      losses: 0,
      winRate: 1,
      averageKills: 4,
      averageDeaths: 0,
      averageAssists: 6,
      kda: null,
      csPerMinute: 5,
      goldPerMinute: 400,
      killParticipation: 1,
    });
    expect(stats["player-2"].overall.matchCount).toBe(0);
    expect(stats["player-10"]).toBeUndefined();
    expect(player.headToHead.some((entry) => entry.opponentDiscordUserId === "player-10")).toBe(false);
  });

  it("uses lifetime totals, per-match kill participation and the latest ten matches", () => {
    const players = makePlayers();
    const results = Array.from({length: 12}, (_, index) => {
      const day = String(index + 1).padStart(2, "0");
      const result = match({id: `result-${day}`, date: `2026-07-${day}`, winner: index % 2 ? "RED" : "BLUE", createdAt: index});
      Object.assign(result.participants[0], {kills: 2, deaths: 1, assists: 3, cs: 60, goldEarned: 6000});
      result.teamStats[0].kills = index === 0 ? 0 : 10;
      return result;
    });

    const player = summarizePlayerStats(results, players)["player-1"];

    expect(player.overall).toMatchObject({matchCount: 12, wins: 6, losses: 6, winRate: 0.5, kda: 5, csPerMinute: 2, goldPerMinute: 200});
    expect(player.overall.killParticipation).toBeCloseTo(5.5 / 12);
    expect(player.recent).toMatchObject({matchCount: 10, wins: 5, losses: 5});
    expect(player.recentMatches.map((entry) => entry.matchResultId)).toEqual([
      "result-12", "result-11", "result-10", "result-09", "result-08",
      "result-07", "result-06", "result-05", "result-04", "result-03",
    ]);
  });

  it("groups roles and returns the five most-played champions with stable tie breakers", () => {
    const players = makePlayers();
    const championNames = ["가렌", "나미", "다리우스", "라칸", "마오카이", "바드"];
    const results = championNames.map((name, index) => {
      const result = match({id: `champion-${index}`, date: `2026-07-0${index + 1}`, winner: "BLUE"});
      result.participants[0] = {
        ...result.participants[0],
        role: index < 4 ? "TOP" : "UTILITY",
        champion: {id: `Champion${index}`, name, iconPath: `img/champion/Champion${index}.png`},
      };
      return result;
    });
    const repeat = match({id: "champion-repeat", date: "2026-08-01", winner: "RED"});
    repeat.participants[0] = {...repeat.participants[0], champion: results[0].participants[0].champion};

    const player = summarizePlayerStats([...results, repeat], players)["player-1"];

    expect(player.byRole.TOP).toMatchObject({matchCount: 5, wins: 4, losses: 1, lastPlayedOn: "2026-08-01"});
    expect(player.byRole.UTILITY).toMatchObject({matchCount: 2, wins: 2});
    expect(player.champions).toHaveLength(5);
    expect(player.champions.map((entry) => entry.champion.name)).toEqual(["가렌", "바드", "마오카이", "라칸", "다리우스"]);
  });
});

describe("player head-to-head stats", () => {
  it("counts only opposing teams and produces symmetric records with both players' metrics", () => {
    const players = makePlayers();
    const blueWin = match({id: "blue-win", date: "2026-08-01", winner: "BLUE"});
    const redWin = match({id: "red-win", date: "2026-08-02", winner: "RED"});
    Object.assign(blueWin.participants[0], {kills: 4, deaths: 2, assists: 6, cs: 120, goldEarned: 9000});
    Object.assign(blueWin.participants[5], {kills: 1, deaths: 4, assists: 2, cs: 90, goldEarned: 7500});
    Object.assign(redWin.participants[0], {kills: 2, deaths: 3, assists: 1, cs: 105, goldEarned: 8100});
    Object.assign(redWin.participants[5], {kills: 5, deaths: 1, assists: 7, cs: 135, goldEarned: 9900});

    const stats = summarizePlayerStats([blueWin, redWin], players);
    const versusSix = stats["player-1"].headToHead.find((entry) => entry.opponentDiscordUserId === "player-6")!;
    const versusOne = stats["player-6"].headToHead.find((entry) => entry.opponentDiscordUserId === "player-1")!;

    expect(versusSix).toMatchObject({matchCount: 2, lastPlayedOn: "2026-08-02"});
    expect(versusSix.player).toMatchObject({wins: 1, losses: 1, averageKills: 3, averageDeaths: 2.5, averageAssists: 3.5, kda: 2.6, csPerMinute: 3.75, goldPerMinute: 285});
    expect(versusSix.opponent).toMatchObject({wins: 1, losses: 1, averageKills: 3, averageDeaths: 2.5, averageAssists: 4.5, kda: 3});
    expect(versusOne.player).toEqual(versusSix.opponent);
    expect(versusOne.opponent).toEqual(versusSix.player);
    expect(stats["player-1"].headToHead.some((entry) => entry.opponentDiscordUserId === "player-2")).toBe(false);
    expect(versusSix.recentMatches.map((entry) => entry.matchResultId)).toEqual(["red-win", "blue-win"]);
  });

  it("sorts opponents by matches, latest meeting and display name", () => {
    const players = makePlayers();
    players[5].displayName = "다 상대";
    players[6].displayName = "가 상대";
    const first = match({id: "first", date: "2026-08-01", winner: "BLUE"});
    const second = match({id: "second", date: "2026-08-02", winner: "BLUE"});
    second.participants[6] = {...second.participants[6], discordUserId: null, guest: true};

    const opponents = summarizePlayerStats([first, second], players)["player-1"].headToHead;

    expect(opponents[0]).toMatchObject({opponentDiscordUserId: "player-6", matchCount: 2});
    expect(opponents.slice(1).map((entry) => entry.opponentDisplayName)).toEqual([
      "선수 10", "선수 8", "선수 9", "가 상대",
    ]);
  });
});

function match({id, date, winner, createdAt = 0}: {
  id: string;
  date: string;
  winner: MatchResult["winner"];
  createdAt?: number;
}): MatchResult {
  const result = structuredClone(makeStoredResult());
  return {...result, matchResultId: id, playedOn: date, winner, createdAt, reviewStatus: "PUBLISHED"};
}
