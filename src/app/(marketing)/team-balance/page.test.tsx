import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";
import TeamBalancePage from "@/app/(marketing)/team-balance/page";

describe("TeamBalancePage", () => {
  it("explains the individual score, Elo, and team objective", () => {
    const markup = renderToStaticMarkup(<TeamBalancePage />);

    expect(markup).toContain("감으로 섞지 않고");
    expect(markup).toContain("랭크를 그대로 믿지 않고");
    expect(markup).toContain("표본 신뢰도");
    expect(markup).toContain("내전 Elo");
    expect(markup).toContain("불균형 비용 J");
    expect(markup).toContain("∑");
    expect(markup).toContain("α");
    expect(markup).toContain("\\Pr(k)\\propto");
    expect(markup).toContain("katex-display");
    expect(markup).toContain("katex-mathml");
    expect(markup).toContain("전체 팀 평균 실력 차이");
    expect(markup).toContain("팀 편성 시작하기");
  });
});
