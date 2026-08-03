import type {TeamAssignment} from "@/lib/lol/types";

export const BALANCE_FORMULA_ITEMS = [
  {weight: 0.35, label: "전체 팀 평균 실력 차이"},
  {weight: 0.30, label: "5개 라인의 맞상대 차이 평균"},
  {weight: 0.15, label: "가장 크게 벌어진 라인 차이"},
  {weight: 0.15, label: "포지션 선호 위반"},
  {weight: 0.05, label: "최근 같은 팀 반복"},
] as const;

export const BALANCE_GUIDE_STEPS = [
  "가능한 조합 중 오프롤 인원이 가장 적은 조합을 먼저 선별해요.",
  "선별된 조합마다 아래의 불균형 점수를 계산해요.",
  "점수가 낮은 상위 조합일수록 더 높은 확률로 선택하고, 다시 편성할 때는 이미 보여준 조합을 제외해요.",
] as const;

export const BALANCE_GRADE_RULES = [
  {grade: "매우 균형", rule: "전체 팀 차이 3점 이하 · 최대 라인 차이 10점 이하"},
  {grade: "균형", rule: "전체 팀 차이 6점 이하 · 최대 라인 차이 18점 이하"},
  {grade: "보통", rule: "위 조건을 만족하는 조합이 없을 때"},
] as const;

export const OFF_ROLE_DESCRIPTION = "주 포지션과 부 포지션이 아닌 라인에 배정됐어요.";
export const LOW_CONFIDENCE_DESCRIPTION = "해당 라인의 경기 표본 신뢰도가 60% 미만이에요.";

export function formatBalanceGap(value: number) {
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  return `${(safeValue * 100).toFixed(1)}점`;
}

export function teamAssignmentWarning(
  assignments: Pick<TeamAssignment, "offRole" | "lowConfidence">[],
) {
  const hasOffRole = assignments.some((assignment) => assignment.offRole);
  const hasLowConfidence = assignments.some((assignment) => assignment.lowConfidence);
  if (hasOffRole && hasLowConfidence) {
    return "주·부 포지션 밖 배정과 신뢰도 60% 미만인 라인이 포함되어 있습니다.";
  }
  if (hasOffRole) return "주·부 포지션 밖에 배정된 선수가 포함되어 있습니다.";
  if (hasLowConfidence) return "경기 표본 신뢰도가 60% 미만인 라인이 포함되어 있습니다.";
  return null;
}
