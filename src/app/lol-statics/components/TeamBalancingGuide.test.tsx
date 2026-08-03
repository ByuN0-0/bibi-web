import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";
import TeamBalancingGuide from "@/app/lol-statics/components/TeamBalancingGuide";

describe("TeamBalancingGuide", () => {
  it("renders the friendly comparison formula and badge definitions", () => {
    const markup = renderToStaticMarkup(<TeamBalancingGuide id="guide" />);

    expect(markup).toContain("팀은 이렇게 편성돼요");
    expect(markup).toContain("오프롤 인원이 가장 적은 조합");
    expect(markup).toContain("전체 팀 평균 실력 차이");
    expect(markup).toContain("최근 10번의 확정 편성");
    expect(markup).toContain("주 포지션 0, 부 포지션 0.25");
    expect(markup).toContain("낮은 신뢰도");
    expect(markup).toContain("대략 8판 미만");
    expect(markup).toContain("id=\"guide\"");
  });
});
