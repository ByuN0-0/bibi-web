import React from "react";
import Link from "next/link";
import {
  BALANCE_FORMULA_ITEMS,
  BALANCE_GRADE_RULES,
  BALANCE_GUIDE_STEPS,
  LOW_CONFIDENCE_DESCRIPTION,
  OFF_ROLE_DESCRIPTION,
} from "@/lib/lol/team-balance-guide";

export default function TeamBalancingGuide({id}: {id: string}) {
  return (
    <section id={id} className="mt-3 rounded-xl border border-[var(--hairline)] bg-[var(--surface-soft)] p-4 sm:p-5" aria-labelledby={`${id}-title`}>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--primary)]">How it works</p>
        <h3 id={`${id}-title`} className="mt-1 text-base font-bold">팀은 이렇게 편성돼요</h3>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">개인의 레이팅 계산법이 아니라, 완성된 조합끼리 비교하는 기준이에요.</p>
      </div>

      <ol className="mt-4 grid gap-2 text-sm leading-6 sm:grid-cols-3">
        {BALANCE_GUIDE_STEPS.map((step, index) => (
          <li key={step} className="flex gap-2 rounded-lg bg-white p-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--primary-soft)] text-xs font-bold text-[var(--primary)]">{index + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      <div className="mt-4 rounded-lg border border-[var(--hairline-soft)] bg-white p-4">
        <p className="text-sm font-bold">불균형 점수</p>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">아래 다섯 항목을 합산하며, 0에 가까울수록 균형적인 조합이에요.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {BALANCE_FORMULA_ITEMS.map((item, index) => (
            <div key={item.label} className="flex items-center gap-2 text-xs leading-5">
              <span className="min-w-10 rounded bg-[var(--primary-soft)] px-2 py-1 text-center font-bold text-[var(--primary)]">{Math.round(item.weight * 100)}%</span>
              <span><span className="mr-1 text-[var(--muted)]">{index === 0 ? "" : "+"}</span>{item.label}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-5 text-[var(--muted)]">포지션 선호 위반값은 1 - 선호도/100으로 계산해요. 80% 라인은 0.2, 20% 라인은 0.8이며, 0% 라인은 가능한 한 먼저 피합니다. 최근 같은 팀 반복은 최근 10번의 확정 편성을 사용하며 최신 기록일수록 더 크게 반영해요.</p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <GuideBlock title="균형 등급">
          <ul className="space-y-2">
            {BALANCE_GRADE_RULES.map((rule) => (
              <li key={rule.grade} className="flex gap-2"><strong className="min-w-14 text-[var(--success)]">{rule.grade}</strong><span>{rule.rule}</span></li>
            ))}
          </ul>
        </GuideBlock>
        <GuideBlock title="선수별 표시">
          <dl className="space-y-2">
            <div><dt className="inline font-bold text-[var(--warning)]">0% 선호</dt><dd className="inline"> — {OFF_ROLE_DESCRIPTION}</dd></div>
            <div><dt className="inline font-bold text-[var(--warning)]">낮은 신뢰도</dt><dd className="inline"> — {LOW_CONFIDENCE_DESCRIPTION} 최근 솔랭 기준 대략 8판 미만에서 주로 표시되며, 자랭·일반게임은 더 많은 표본이 필요할 수 있어요.</dd></div>
          </dl>
        </GuideBlock>
      </div>
      <div className="mt-4 flex flex-col gap-2 border-t border-[var(--hairline)] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-[var(--muted)]">개인 점수, 최근 폼, 내전 Elo가 합쳐지는 과정도 궁금한가요?</p>
        <Link href="/team-balance" className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[var(--primary)] bg-white px-4 text-xs font-bold text-[var(--primary)] hover:bg-[var(--primary-soft)]">
          전체 계산 원리 보기 →
        </Link>
      </div>
    </section>
  );
}

function GuideBlock({title, children}: {title: string; children: React.ReactNode}) {
  return <div className="rounded-lg bg-white p-4 text-xs leading-5"><h4 className="mb-2 text-sm font-bold">{title}</h4>{children}</div>;
}
