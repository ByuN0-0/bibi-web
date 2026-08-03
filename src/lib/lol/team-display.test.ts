import {describe, expect, it} from "vitest";
import {formatTeamCompositionText, rankTierFromText, rankTierIconPath, RANK_TIERS} from "@/lib/lol/team-display";
import type {Role, TeamAssignment} from "@/lib/lol/types";

describe("team result display", () => {
  it("maps every ranked tier and falls back for unranked values", () => {
    for (const tier of RANK_TIERS) {
      expect(rankTierFromText(`${tier} I`)).toBe(tier);
      expect(rankTierIconPath(`${tier} I`)).toBe(`/images/ranks/${tier.toLowerCase()}.webp`);
    }
    expect(rankTierFromText("배치 전")).toBe("UNRANKED");
    expect(rankTierIconPath("배치 전")).toBe("/images/ranks/unranked.svg");
  });

  it("copies each team on one concise line in fixed role order", () => {
    const blue = [assignment("UTILITY", "블루서폿"), assignment("TOP", "블루탑"), assignment("BOTTOM", "블루원딜"), assignment("MIDDLE", "블루미드"), assignment("JUNGLE", "블루정글")];
    const red = [assignment("MIDDLE", "레드미드"), assignment("JUNGLE", "레드정글"), assignment("TOP", "레드탑"), assignment("UTILITY", "레드서폿"), assignment("BOTTOM", "레드원딜")];
    expect(formatTeamCompositionText({blue, red})).toBe([
      "탑/정/미/원/서",
      "B 블루탑/블루정글/블루미드/블루원딜/블루서폿",
      "R 레드탑/레드정글/레드미드/레드원딜/레드서폿",
    ].join("\n"));
  });
});

function assignment(role: Role, displayName: string): TeamAssignment {
  return {discordUserId: `${role}-${displayName}`, displayName, role, rank: "GOLD I", rankQueue: "SOLO", offRole: false, lowConfidence: false};
}
