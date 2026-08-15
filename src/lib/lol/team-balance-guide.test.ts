import {describe, expect, it} from "vitest";
import {
  BALANCE_FORMULA_ITEMS,
  BALANCE_GRADE_RULES,
  BALANCE_GUIDE_STEPS,
  formatBalanceGap,
  formatLaneAdvantage,
  LOW_CONFIDENCE_DESCRIPTION,
  OFF_ROLE_DESCRIPTION,
  teamAssignmentWarning,
} from "@/lib/lol/team-balance-guide";

describe("team balance guide", () => {
  it("formats normalized gaps on the internal 0-100 scale", () => {
    expect(formatBalanceGap(0.034)).toBe("3.4점");
    expect(formatBalanceGap(0)).toBe("0.0점");
    expect(formatBalanceGap(1)).toBe("100.0점");
    expect(formatBalanceGap(-1)).toBe("0.0점");
    expect(formatBalanceGap(2)).toBe("100.0점");
    expect(formatBalanceGap(Number.NaN)).toBe("0.0점");
    expect(formatBalanceGap(Number.POSITIVE_INFINITY)).toBe("0.0점");
  });

  it("documents the exact comparison weights and grade boundaries", () => {
    expect(BALANCE_FORMULA_ITEMS.reduce((sum, item) => sum + item.weight, 0)).toBeCloseTo(1);
    expect(BALANCE_FORMULA_ITEMS.map((item) => item.weight)).toEqual([0.35, 0.30, 0.15, 0.15, 0.05]);
    expect(BALANCE_GRADE_RULES).toEqual([
      {grade: "매우 균형", rule: "라인 우세 균형 · 전체 팀 차이 3점 이하 · 최대 라인 차이 10점 이하"},
      {grade: "균형", rule: "라인 우세 균형 · 전체 팀 차이 6점 이하 · 최대 라인 차이 18점 이하"},
      {grade: "보통", rule: "라인 우세가 불균형하거나 위 격차 조건을 만족하지 못할 때"},
    ]);
    expect(OFF_ROLE_DESCRIPTION).toContain("선호도 0%");
    expect(LOW_CONFIDENCE_DESCRIPTION).toContain("60% 미만");
    expect(BALANCE_GUIDE_STEPS[1]).toContain("동률 전장이 많은 조합");
  });

  it("formats only the aggregate lane advantage status", () => {
    expect(formatLaneAdvantage(undefined)).toBeNull();
    expect(formatLaneAdvantage({blueCount: 2, redCount: 2, neutralCount: 0, balanced: true})).toBe("2:2");
    expect(formatLaneAdvantage({blueCount: 1, redCount: 1, neutralCount: 2, balanced: true})).toBe("동률 포함 균형 (2)");
    expect(formatLaneAdvantage({blueCount: 3, redCount: 1, neutralCount: 0, balanced: false})).toBe("2:2 불가");
  });

  it("returns a warning that matches the badges in the composition", () => {
    expect(teamAssignmentWarning([{offRole: false, lowConfidence: false}])).toBeNull();
    expect(teamAssignmentWarning([{offRole: true, lowConfidence: false}])).toContain("선호도 0%");
    expect(teamAssignmentWarning([{offRole: false, lowConfidence: true}])).toContain("신뢰도가 60% 미만");
    expect(teamAssignmentWarning([{offRole: true, lowConfidence: true}])).toContain("선호도 0% 라인 배정과 신뢰도 60% 미만");
  });
});
