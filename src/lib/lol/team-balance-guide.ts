import type {LaneAdvantage, TeamAssignment} from "@/lib/lol/types";

export const BALANCE_FORMULA_ITEMS = [
  {weight: 0.35, label: "전체 팀 평균 실력 차이"},
  {weight: 0.30, label: "5개 라인의 맞상대 차이 평균"},
  {weight: 0.15, label: "가장 크게 벌어진 라인 차이"},
  {weight: 0.15, label: "포지션 선호 위반"},
  {weight: 0.05, label: "최근 같은 팀 반복"},
] as const;

export const BALANCE_GUIDE_STEPS = [
  "가능한 조합 중 선호도 0% 라인 배정이 가장 적은 조합을 먼저 선별해요.",
  "네 전장의 우세 수 차이를 최소화한 뒤 최고 선호 라인 배정이 많고 동률 전장이 많은 조합을 우선해요.",
  "남은 조합의 불균형 점수를 비교하고, 다시 편성할 때는 이미 보여준 팀을 제외해요.",
] as const;

export const BALANCE_GRADE_RULES = [
  {grade: "매우 균형", rule: "라인 우세 균형 · 전체 팀 차이 3점 이하 · 최대 라인 차이 10점 이하"},
  {grade: "균형", rule: "라인 우세 균형 · 전체 팀 차이 6점 이하 · 최대 라인 차이 18점 이하"},
  {grade: "보통", rule: "라인 우세가 불균형하거나 위 격차 조건을 만족하지 못할 때"},
] as const;

export const OFF_ROLE_DESCRIPTION = "선호도 0%로 설정한 라인에 배정됐어요.";
export const LOW_CONFIDENCE_DESCRIPTION = "해당 라인의 경기 표본 신뢰도가 60% 미만이에요.";

export function formatBalanceGap(value: number) {
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  return `${(safeValue * 100).toFixed(1)}점`;
}

export function formatLaneAdvantage(value: LaneAdvantage | undefined) {
  if (!value) return null;
  if (!value.balanced) return "2:2 불가";
  if (value.neutralCount > 0) return `동률 포함 균형 (${value.neutralCount})`;
  return "2:2";
}

export function teamAssignmentWarning(
  assignments: Pick<TeamAssignment, "offRole" | "lowConfidence">[],
) {
  const hasOffRole = assignments.some((assignment) => assignment.offRole);
  const hasLowConfidence = assignments.some((assignment) => assignment.lowConfidence);
  if (hasOffRole && hasLowConfidence) {
    return "선호도 0% 라인 배정과 신뢰도 60% 미만인 라인이 포함되어 있습니다.";
  }
  if (hasOffRole) return "선호도 0% 라인에 배정된 선수가 포함되어 있습니다.";
  if (hasLowConfidence) return "경기 표본 신뢰도가 60% 미만인 라인이 포함되어 있습니다.";
  return null;
}
