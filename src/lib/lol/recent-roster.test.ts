import {describe, expect, it} from "vitest";
import {resolveRecentRoster, toggleRosterPlayer} from "@/lib/lol/recent-roster";
import {makePlayers} from "@/lib/lol/match-result-test-fixtures";

describe("recent roster", () => {
  it("restores exactly ten unique ready players in their saved order", () => {
    const playerIds = makePlayers().map((player) => player.discordUserId).reverse();
    expect(resolveRecentRoster(playerIds, makePlayers())).toEqual({status: "valid", playerIds});
  });

  it("rejects missing, duplicate, and unavailable players", () => {
    const players = makePlayers();
    const ids = players.map((player) => player.discordUserId);
    expect(resolveRecentRoster(ids.slice(0, 9), players)).toEqual({status: "invalid"});
    expect(resolveRecentRoster([...ids.slice(0, 9), ids[0]], players)).toEqual({status: "invalid"});
    players[9].syncStatus = "SYNCING";
    expect(resolveRecentRoster(ids, players)).toEqual({status: "invalid"});
    expect(resolveRecentRoster([...ids.slice(0, 9), "deleted-player"], makePlayers())).toEqual({status: "invalid"});
  });

  it("adds and removes players while enforcing the ten-player limit", () => {
    expect(toggleRosterPlayer([], "player-1")).toEqual(["player-1"]);
    expect(toggleRosterPlayer(["player-1", "player-2"], "player-1")).toEqual(["player-2"]);
    const full = makePlayers().map((player) => player.discordUserId);
    expect(toggleRosterPlayer(full, "player-11")).toBe(full);
  });
});
