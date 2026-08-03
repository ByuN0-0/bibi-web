import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";
import PublicPlayerStats, {buildPlayerSearchText} from "@/app/lol-statics/components/PublicPlayerStats";
import {summarizePlayerStats} from "@/lib/lol/player-stats";
import {makePlayers} from "@/lib/lol/match-result-test-fixtures";

describe("PublicPlayerStats", () => {
  it("renders a public player picker and its initial empty state", () => {
    const players = makePlayers(2);
    const markup = renderToStaticMarkup(
      <PublicPlayerStats players={players} accounts={[]} stats={summarizePlayerStats([], players)} />,
    );

    expect(markup).toContain("개인 스탯");
    expect(markup).toContain("선수 이름 또는 Riot ID");
    expect(markup).toContain("선수 1");
    expect(markup).toContain("RiotPlayer1#KR1");
    expect(markup).toContain("기록을 확인할 선수를 선택해 주세요.");
  });

  it("builds normalized search text from display, primary and alternate Riot IDs", () => {
    const [player] = makePlayers(1);
    player.displayName = "  비 비  ";
    const searchText = buildPlayerSearchText(player, [{
      discordUserId: player.discordUserId,
      riotGameName: "숨은 부계정",
      riotTagLine: "KR2",
      soloRank: player.soloRank,
      flexRank: player.flexRank,
    }]);

    expect(searchText).toContain("비 비");
    expect(searchText).toContain("riotplayer1#kr1");
    expect(searchText).toContain("숨은 부계정#kr2");
  });
});
