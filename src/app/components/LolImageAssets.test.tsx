import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";
import {LolObjectiveIcon, LolPositionIcon} from "@/app/components/LolGameUiIcon";
import LolIcon from "@/app/components/LolIcon";
import RankTierIcon from "@/app/lol-statics/components/RankTierIcon";

describe("LoL image assets", () => {
  it("serves Data Dragon icons without the Next.js image optimizer", () => {
    const markup = renderToStaticMarkup(
      <LolIcon
        asset={{id: "Ahri", name: "아리", iconPath: "img/champion/Ahri.png"}}
        version="16.15.1"
        size={32}
      />,
    );

    expect(markup).toContain("https://ddragon.leagueoflegends.com/cdn/16.15.1/img/champion/Ahri.png");
    expect(markup).not.toContain("/_next/image");
  });

  it("serves objective and position icons from local static paths", () => {
    const markup = renderToStaticMarkup(
      <>
        <LolObjectiveIcon kind="gold" />
        <LolObjectiveIcon kind="turret" />
        <LolObjectiveIcon kind="dragon" />
        <LolPositionIcon role="TOP" />
        <LolPositionIcon role="JUNGLE" />
        <LolPositionIcon role="MIDDLE" />
        <LolPositionIcon role="BOTTOM" />
        <LolPositionIcon role="UTILITY" />
      </>,
    );

    for (const filename of [
      "gold.png",
      "turret.png",
      "dragon.png",
      "position-top.png",
      "position-jungle.png",
      "position-middle.png",
      "position-bottom.png",
      "position-utility.png",
    ]) {
      expect(markup).toContain(`/images/lol/ui/${filename}`);
    }
    expect(markup).not.toContain("raw.communitydragon.org");
    expect(markup).not.toContain("/_next/image");
  });

  it("serves local rank icons without the Next.js image optimizer", () => {
    const markup = renderToStaticMarkup(<RankTierIcon rank="GOLD IV" />);

    expect(markup).toContain("/images/ranks/gold.webp");
    expect(markup).not.toContain("/_next/image");
  });
});
