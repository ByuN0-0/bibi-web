import type {Metadata} from "next";
import Link from "next/link";
import React from "react";
import MathFormula from "@/app/components/MathFormula";
import {
  BALANCE_FORMULA_ITEMS,
  BALANCE_GRADE_RULES,
} from "@/lib/lol/team-balance-guide";

export const metadata: Metadata = {
  title: "LoL 내전 점수와 팀 편성 원리 | 비비",
  description: "비비가 랭크, 최근 포지션별 경기력, 내전 Elo와 선호 포지션을 조합해 균형 잡힌 LoL 내전 팀을 찾는 과정을 설명합니다.",
};

const rankBases = [
  ["Iron", "0"], ["Bronze", "400"], ["Silver", "800"], ["Gold", "1,200"],
  ["Platinum", "1,600"], ["Emerald", "2,000"], ["Diamond", "2,400"],
  ["Master", "2,800"], ["Grandmaster", "3,200"], ["Challenger", "3,600"],
] as const;

const performanceMetrics = [
  ["15분 라인전", "골드 · 경험치 · CS 차이"],
  ["전투 기여", "피해 효율 · 킬 관여율"],
  ["운영 기여", "시야 · CC · 드래곤/바론 관여"],
  ["안정성", "상대와 비교한 분당 데스 차이"],
] as const;

const roleWeights = [
  ["탑", "피해 효율 40%", "킬 관여 20% · 안정성 20% · 시야 20%"],
  ["정글", "킬 관여 30% · 오브젝트 30%", "시야 20% · 피해 효율 20%"],
  ["미드", "피해 효율 45% · 킬 관여 30%", "안정성 15% · 시야 10%"],
  ["원딜", "피해 효율 55% · 킬 관여 20%", "CS 15% · 안정성 10%"],
  ["서폿", "시야 35% · 킬 관여 30%", "CC 20% · 안정성 15%"],
] as const;

const gradeFormulae = [
  String.raw`G \le 0.03,\quad M \le 0.10`,
  String.raw`G \le 0.06,\quad M \le 0.18`,
  String.raw`\text{otherwise}`,
] as const;

export default function TeamBalancePage() {
  return (
    <main className="pt-[72px]">
      <section className="relative overflow-hidden border-b border-[var(--hairline-soft)] bg-[linear-gradient(145deg,#fff_0%,#fff7f9_52%,#f4faff_100%)]">
        <div className="pointer-events-none absolute -right-24 top-10 h-72 w-72 rounded-full border-[48px] border-white/70" />
        <div className="page-shell relative grid gap-10 py-16 sm:py-20 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:py-24">
          <div className="max-w-3xl">
            <p className="eyebrow">Team balancing · v3</p>
            <h1 className="mt-4 text-[clamp(38px,6vw,64px)] font-bold leading-[1.08] tracking-[-0.045em]">
              감으로 섞지 않고,<br />
              <span className="text-[var(--primary)]">차이를 계산합니다.</span>
            </h1>
            <p className="mt-6 max-w-2xl break-keep text-base leading-7 text-[var(--body)] sm:text-lg sm:leading-8">
              비비는 선수마다 포지션별 실력 신호를 만든 뒤, 가능한 포지션 배치와 5:5 조합을 비교합니다. 랭크 하나만 더하는 것이 아니라 최근 폼, 표본 신뢰도, 내전 Elo와 선호 포지션까지 함께 봅니다.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/" className="primary-button px-6">팀 편성해 보기</Link>
              <a href="#individual-score" className="secondary-button px-6">계산식부터 읽기</a>
            </div>
          </div>

          <div className="rounded-[28px] border border-white bg-white/90 p-5 shadow-[var(--shadow-float)] sm:p-7">
            <div className="flex items-center justify-between border-b border-[var(--hairline-soft)] pb-4">
              <div><p className="text-xs font-bold text-[var(--primary)]">POSITION SIGNAL</p><p className="mt-1 font-bold">한 선수의 미드 점수 예시</p></div>
              <span className="rounded-full bg-[var(--success-soft)] px-3 py-1 text-xs font-bold text-[var(--success)]">신뢰도 72%</span>
            </div>
            <div className="mt-5 flex items-end justify-between gap-4">
              <div><p className="text-sm text-[var(--muted)]">편성용 실력 신호</p><p className="mt-1 text-5xl font-bold tracking-[-0.05em]">58.4<span className="ml-1 text-lg text-[var(--muted)]">/ 100</span></p></div>
              <div className="text-right text-xs leading-5 text-[var(--muted)]"><p>랭크 기반 <strong className="text-[var(--ink)]">55.8</strong></p><p>최근 폼 보정 <strong className="text-[var(--success)]">+2.6</strong></p></div>
            </div>
            <div className="mt-5 h-3 overflow-hidden rounded-full bg-[var(--surface-strong)]"><div className="h-full w-[58.4%] rounded-full bg-[linear-gradient(90deg,var(--primary),#f07592)]" /></div>
            <p className="mt-4 rounded-xl bg-[var(--warning-soft)] px-4 py-3 text-xs leading-5 text-[var(--warning)]">이 점수는 승률이나 백분위가 아니라, 같은 내전의 두 팀을 비교하기 위한 내부 척도예요.</p>
          </div>
        </div>
      </section>

      <div className="border-b border-[var(--hairline-soft)] bg-white">
        <nav className="page-shell flex gap-2 overflow-x-auto py-3 text-sm font-semibold" aria-label="페이지 목차">
          <Anchor href="#individual-score">1. 개인 점수</Anchor>
          <Anchor href="#recent-form">2. 최근 폼</Anchor>
          <Anchor href="#inhouse-elo">3. 내전 Elo</Anchor>
          <Anchor href="#team-search">4. 팀 탐색</Anchor>
          <Anchor href="#interpretation">5. 해석법</Anchor>
        </nav>
      </div>

      <aside className="page-shell pt-10" aria-labelledby="notation-title">
        <div className="rounded-2xl border border-[var(--hairline-soft)] bg-[var(--surface-soft)] p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div><p id="notation-title" className="text-sm font-bold">기호 먼저 보기</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">아래 식에서 같은 기호는 항상 같은 뜻으로 사용합니다.</p></div>
            <dl className="grid flex-1 grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:max-w-3xl lg:grid-cols-6">
              <Notation symbol={<>i</>} meaning="선수" />
              <Notation symbol={<>r</>} meaning="포지션" />
              <Notation symbol={<>j</>} meaning="경기" />
              <Notation symbol={<>B, R</>} meaning="블루·레드" />
              <Notation symbol={<>∑</>} meaning="전체 합" />
              <Notation symbol={<>clip</>} meaning="범위 제한" />
            </dl>
          </div>
        </div>
      </aside>

      <section className="page-shell py-16 sm:py-20" id="individual-score">
        <SectionIntro eyebrow="01 · Individual score" title="랭크를 그대로 믿지 않고, 표본만큼 믿습니다">
          솔랭과 자랭을 0~1 값으로 바꾸고 경기 수가 적을수록 기준점으로 당깁니다. 수학적으로는 사전 표본을 더한 축소 추정에 가깝습니다.
        </SectionIntro>

        <div className="mt-9 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <article className="surface-card overflow-hidden">
            <div className="border-b border-[var(--hairline-soft)] bg-[var(--surface-soft)] p-5 sm:p-6">
              <p className="text-sm font-bold">① 티어를 연속값으로 변환</p>
              <Formula className="mt-4 text-base" latex={String.raw`R=\operatorname{clip}\!\left(\frac{b_t+d+\ell}{4000},\,0,\,1\right)`} />
              <p className="mt-3 text-xs leading-5 text-[var(--muted)]"><span className="font-mono">b<sub>t</sub></span>는 티어 기준값, <span className="font-mono">d</span>는 디비전값, <span className="font-mono">ℓ</span>은 LP입니다.</p>
              <p className="mt-3 text-xs leading-5 text-[var(--muted)]">디비전은 IV 0 · III 100 · II 200 · I 300을 더합니다.</p>
            </div>
            <div className="grid grid-cols-2 gap-x-5 gap-y-2 p-5 text-xs sm:grid-cols-3 sm:p-6">
              {rankBases.map(([tier, value]) => <div key={tier} className="flex justify-between gap-3 border-b border-[var(--hairline-soft)] py-2"><span className="text-[var(--muted)]">{tier}</span><strong>{value}</strong></div>)}
            </div>
          </article>

          <article className="surface-card p-5 sm:p-7">
            <p className="text-sm font-bold">② 판수가 적으면 기준점으로 축소</p>
            <Formula className="mt-4 text-[15px] sm:text-lg" latex={String.raw`T_i=\frac{10(0.35)+n_sR_s+n_fR_f}{10+n_s+n_f}`} />
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <MiniStat label="가상 사전 표본" value="10판" detail="기준점 35점" />
              <MiniStat label="솔랭 증거" value="최대 40판" detail="판당 가중치 1.0" />
              <MiniStat label="자랭 증거" value="최대 12판" detail="실제 판수 × 0.3" />
            </div>
            <div className="mt-5 rounded-xl border border-[var(--hairline-soft)] bg-[var(--surface-soft)] p-4 text-sm leading-6">
              <strong>예시</strong><span className="text-[var(--muted)]"> · 다이아 I 솔랭 20판과 브론즈 I 자랭 20판이라면 자랭은 6판만큼 반영되어, 랭크 기반 점수는 약 </span><strong className="text-[var(--primary)]">50.1점</strong><span className="text-[var(--muted)]">이 됩니다.</span>
            </div>
          </article>
        </div>
      </section>

      <section className="bg-[var(--surface-soft)] py-16 sm:py-20" id="recent-form">
        <div className="page-shell">
          <SectionIntro eyebrow="02 · Recent form" title="최근 경기에서는 맞라인보다 무엇을 더 했는지 봅니다">
            같은 포지션 상대와의 차이를 사용해 게임 길이와 팀 전체 화력의 영향을 줄입니다. 오래된 경기와 일반게임은 자동으로 덜 반영됩니다.
          </SectionIntro>

          <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {performanceMetrics.map(([title, detail], index) => (
              <article key={title} className="surface-card p-5"><span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--primary-soft)] text-xs font-bold text-[var(--primary)]">{index + 1}</span><h3 className="mt-4 font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-[var(--muted)]">{detail}</p></article>
            ))}
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <article className="surface-card p-5 sm:p-7">
              <h3 className="font-bold">시간·게임 모드 가중치</h3>
              <Formula className="mt-4 text-base" latex={String.raw`w_j=2^{-a_j/14}\,q_j`} />
              <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs">
                <WeightChip title="솔로랭크" value="1.00" />
                <WeightChip title="자유랭크" value="0.35" />
                <WeightChip title="일반게임" value="0.15" />
              </div>
              <p className="mt-4 text-xs leading-5 text-[var(--muted)]"><span className="font-mono">a<sub>j</sub></span>는 경과일, <span className="font-mono">q<sub>j</sub></span>는 큐 가중치입니다. 오늘 경기는 1, 14일 전은 0.5, 28일 전은 0.25가 됩니다.</p>
              <Formula className="mt-3" latex={String.raw`\bar{x}=\frac{\sum_j w_jx_j}{\sum_j w_j}`} />
            </article>

            <article className="surface-card p-5 sm:p-7">
              <h3 className="font-bold">표본 신뢰도</h3>
              <Formula className="mt-4 text-base" latex={String.raw`W=\sum_jw_j,\qquad C_{i,r}=\frac{W}{W+5}`} />
              <div className="mt-5 space-y-3 text-xs">
                <ConfidenceRow label="최근 솔랭 2판" width="28.6%" value="28.6%" />
                <ConfidenceRow label="최근 솔랭 8판" width="61.5%" value="61.5%" />
              </div>
              <p className="mt-4 text-xs leading-5 text-[var(--muted)]">60% 미만이면 결과에서 ‘낮은 신뢰도’로 표시합니다.</p>
            </article>
          </div>

          <article className="mt-5 overflow-hidden rounded-2xl border border-[var(--hairline-soft)] bg-white">
            <div className="border-b border-[var(--hairline-soft)] p-5 sm:p-6"><h3 className="font-bold">포지션마다 중요하게 보는 후반 지표가 달라요</h3><p className="mt-2 text-sm leading-6 text-[var(--muted)]">모든 차이는 <InlineMath latex={String.raw`N(x;a)=\tanh(x/a)\in(-1,1)`} />로 압축해 한 지표가 지나치게 지배하지 않게 합니다.</p></div>
            <div className="divide-y divide-[var(--hairline-soft)]">
              {roleWeights.map(([role, lead, rest]) => <div key={role} className="grid gap-1 px-5 py-4 text-sm sm:grid-cols-[80px_1fr_1fr] sm:gap-5 sm:px-6"><strong className="text-[var(--primary)]">{role}</strong><span>{lead}</span><span className="text-[var(--muted)]">{rest}</span></div>)}
            </div>
          </article>

          <div className="mt-5 rounded-2xl bg-[var(--ink)] p-6 text-white sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#ff9db3]">Role performance signal</p>
            <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
              <Formula dark className="text-[15px] sm:text-xl" latex={String.raw`P_{i,r}=\operatorname{clip}\!\left(T_i+0.30C_{i,r}(F_{i,r}-0.5),\,0,\,1\right)`} />
              <p className="max-w-md text-sm leading-6 text-[#c9c9c9]">표본이 없으면 랭크 점수 그대로입니다. 표본이 충분해도 최근 폼 보정은 최대 ±15점으로 제한됩니다.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="page-shell py-16 sm:py-20" id="inhouse-elo">
        <SectionIntro eyebrow="03 · In-house Elo" title="내전 결과가 쌓이면 우리끼리의 실력이 반영됩니다">
          공개 확정된 정상적인 5:5 경기만 사용합니다. 개인 KDA가 아니라 팀 승패를 반영하고, 전체 Elo보다 해당 포지션 Elo를 더 중요하게 봅니다.
        </SectionIntro>

        <div className="mt-9 grid gap-5 lg:grid-cols-3">
          <ExplainerCard number="1" title="유효 Elo" formula={String.raw`E^{\ast}_{i,r}=0.3E_i+0.7E_{i,r}`} detail="전체와 포지션 Elo는 모두 1,500에서 시작합니다." />
          <ExplainerCard number="2" title="블루 팀 승리 기대값" formula={String.raw`p_B=\frac{1}{1+10^{(\bar E_R-\bar E_B)/400}}`} detail="Ē는 팀원 5명의 유효 Elo 평균입니다. 예상 밖의 승리일수록 Elo가 더 크게 움직입니다." />
          <ExplainerCard number="3" title="경기 후 변화" formula={String.raw`\Delta=32(y_B-p_B)`} detail="y는 실제 승패를 나타내는 0 또는 1입니다. 동률 팀끼리 경기하면 승자 +16, 패자 −16입니다." />
        </div>

        <div className="mt-5 grid gap-5 rounded-2xl border border-[var(--hairline-soft)] bg-[var(--surface-soft)] p-5 sm:p-7 lg:grid-cols-[1fr_1.15fr] lg:items-center">
          <div><p className="text-sm font-bold">내전 Elo의 최종 반영 비율</p><p className="mt-2 text-sm leading-6 text-[var(--muted)]">유효 내전 표본 10판까지 비중이 커지고, 이후에는 최대 30%로 고정됩니다.</p></div>
          <Formula className="text-sm sm:text-base" latex={String.raw`\begin{aligned}H_{i,r}&=\operatorname{clip}\!\left(0.5+\frac{E^{\ast}_{i,r}-1500}{800},0,1\right)\\[2pt]S_{i,r}&=(1-\alpha_{i,r})P_{i,r}+\alpha_{i,r}H_{i,r},\qquad 0\le\alpha_{i,r}\le0.30\end{aligned}`} />
        </div>
      </section>

      <section className="bg-[var(--ink)] py-16 text-white sm:py-20" id="team-search">
        <div className="page-shell">
          <SectionIntro dark eyebrow="04 · Team search" title="10명의 가능한 배치를 비교해 가장 낮은 불균형을 찾습니다">
            한 명씩 번갈아 넣는 방식이 아닙니다. 각 팀에 탑·정글·미드·원딜·서폿 한 명씩을 배치한 뒤, 허용되는 조합을 전수 탐색합니다.
          </SectionIntro>

          <div className="mt-9 grid gap-4 md:grid-cols-3">
            <DarkStep number="1" title="강한 비선호 최소화">먼저 선호도 0% 라인에 배정되는 선수 수의 최솟값을 구합니다.</DarkStep>
            <DarkStep number="2" title="전력 차이 계산">전체 팀과 맞라인의 포지션별 실력 신호 차이를 계산합니다.</DarkStep>
            <DarkStep number="3" title="상위 후보 추출">낮은 비용의 후보 20개 안에서 더 좋은 조합에 높은 확률을 줍니다.</DarkStep>
          </div>

          <div className="mt-5 rounded-2xl border border-white/15 bg-white/[0.06] p-5 sm:p-8">
            <div className="grid gap-7 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
              <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#ff9db3]">Objective function</p><h3 className="mt-2 text-2xl font-bold">불균형 비용 J</h3><p className="mt-3 text-sm leading-6 text-[#bdbdbd]">값이 0에 가까울수록 좋은 조합입니다. 선호도 0% 라인 배정을 먼저 최소화한 후보끼리 이 비용을 비교합니다.</p><Formula dark className="mt-4" latex={String.raw`J=0.35G+0.30L+0.15M+0.15P+0.05R`} /></div>
              <div className="grid gap-2 sm:grid-cols-2">
                {BALANCE_FORMULA_ITEMS.map((item) => <div key={item.label} className="flex items-center gap-3 rounded-xl bg-white/[0.07] px-4 py-3"><span className="min-w-12 rounded-lg bg-[#ffecf1] px-2 py-1 text-center text-xs font-bold text-[var(--primary)]">{Math.round(item.weight * 100)}%</span><span className="text-sm">{item.label}</span></div>)}
              </div>
            </div>
            <div className="mt-6 grid gap-2 border-t border-white/10 pt-6 text-xs sm:grid-cols-2 lg:grid-cols-5">
              <MathDefinition symbol="G" latex={String.raw`\frac{|\sum_r S_{B,r}-\sum_r S_{R,r}|}{5}`} />
              <MathDefinition symbol="L" latex={String.raw`\frac{\sum_r|S_{B,r}-S_{R,r}|}{5}`} />
              <MathDefinition symbol="M" latex={String.raw`\max_r|S_{B,r}-S_{R,r}|`} />
              <MathDefinition symbol="P" latex={String.raw`\frac{1}{10}\sum_i(1-p_{i,r_i}/100)`} />
              <MathDefinition symbol="R" label="같은 팀 반복도" />
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {BALANCE_GRADE_RULES.map((rule, index) => <article key={rule.grade} className="rounded-2xl border border-white/15 bg-white/[0.04] p-5"><div className={`h-1.5 w-12 rounded-full ${index === 0 ? "bg-[#63d6a5]" : index === 1 ? "bg-[#ffd475]" : "bg-[#a8a8a8]"}`} /><h3 className="mt-5 text-lg font-bold">{rule.grade}</h3><div className="mt-3 overflow-x-auto text-sm text-white"><MathFormula latex={gradeFormulae[index]} /></div><p className="mt-2 text-sm leading-6 text-[#bdbdbd]">{rule.rule}</p></article>)}
          </div>

          <p className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] px-5 py-4 text-sm leading-6 text-[#c9c9c9]">
            다시 편성할 때는 이미 보여 준 5:5 분할을 제외합니다. 최적 후보만 고정하지 않고 <InlineMath dark latex={String.raw`\Pr(k)\propto e^{-(J_k-J_{\min})/0.03}`} />으로 선택하므로, 균형을 유지하면서도 결과가 다양해집니다.
          </p>
        </div>
      </section>

      <section className="page-shell py-16 sm:py-20" id="interpretation">
        <SectionIntro eyebrow="05 · Interpretation" title="숫자는 이렇게 읽으면 정확합니다">
          설명 가능한 규칙 기반 모델이지만, 실제 승률을 예측하도록 학습된 확률 모델은 아닙니다.
        </SectionIntro>
        <div className="mt-9 grid gap-5 lg:grid-cols-2">
          <article className="rounded-2xl border border-[#bfe3d3] bg-[var(--success-soft)] p-5 sm:p-7"><h3 className="font-bold text-[var(--success)]">잘하는 것</h3><ul className="mt-4 space-y-3 text-sm leading-6"><ListItem>표본이 적을 때 극단적인 평가 억제</ListItem><ListItem>포지션별 경기력과 맞라인 격차 구분</ListItem><ListItem>한 라인만 크게 무너지는 조합 방지</ListItem><ListItem>내전 결과와 최근 같은 팀 기록 반영</ListItem></ul></article>
          <article className="rounded-2xl border border-[#f2d28b] bg-[var(--warning-soft)] p-5 sm:p-7"><h3 className="font-bold text-[var(--warning)]">의미하지 않는 것</h3><ul className="mt-4 space-y-3 text-sm leading-6"><ListItem>개인 점수는 승률이나 상위 백분위가 아님</ListItem><ListItem>챔피언 상성·조합·듀오 시너지까지 예측하지 않음</ListItem><ListItem>내전 Elo는 팀원 모두에게 같은 승패 변화량 적용</ListItem><ListItem>가중치는 학습값이 아니라 운영을 위한 설계값</ListItem></ul></article>
        </div>

        <div className="mt-10 rounded-[24px] bg-[var(--primary-soft)] p-6 text-center sm:p-10">
          <p className="text-sm font-bold text-[var(--primary)]">이제 원리는 알았으니</p>
          <h2 className="mt-2 text-2xl font-bold tracking-[-0.03em] sm:text-3xl">10명을 골라 실제 조합을 확인해 보세요</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">결과에는 전체 팀 차이와 최대 라인 차이가 함께 표시되어, 왜 ‘매우 균형’인지 바로 확인할 수 있습니다.</p>
          <Link href="/" className="primary-button mt-6 px-7">팀 편성 시작하기</Link>
        </div>
      </section>
    </main>
  );
}

function Anchor({href, children}: {href: string; children: React.ReactNode}) {
  return <a href={href} className="shrink-0 rounded-full px-4 py-2 text-[var(--muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]">{children}</a>;
}

function Notation({symbol, meaning}: {symbol: React.ReactNode; meaning: string}) {
  return <div className="rounded-lg bg-white px-3 py-2"><dt className="font-mono text-sm font-bold text-[var(--primary)]">{symbol}</dt><dd className="mt-0.5 text-[var(--muted)]">{meaning}</dd></div>;
}

function SectionIntro({eyebrow, title, children, dark = false}: {eyebrow: string; title: string; children: React.ReactNode; dark?: boolean}) {
  return <div className="max-w-3xl"><p className={`text-xs font-bold uppercase tracking-[0.12em] ${dark ? "text-[#ff9db3]" : "text-[var(--primary)]"}`}>{eyebrow}</p><h2 className="mt-3 text-3xl font-bold leading-tight tracking-[-0.035em] sm:text-4xl">{title}</h2><p className={`mt-4 break-keep text-base leading-7 ${dark ? "text-[#bdbdbd]" : "text-[var(--muted)]"}`}>{children}</p></div>;
}

function Formula({latex, className = "", dark = false}: {latex: string; className?: string; dark?: boolean}) {
  return <div className={`overflow-x-auto rounded-xl border px-4 py-4 text-center text-sm leading-7 ${dark ? "border-white/15 bg-white/[0.06] text-white" : "border-[#f0ccd5] bg-[var(--primary-soft)] text-[var(--ink)]"} ${className}`}><MathFormula latex={latex} display /></div>;
}

function InlineMath({latex, dark = false}: {latex: string; dark?: boolean}) {
  return <MathFormula latex={latex} className={`mx-1 whitespace-nowrap ${dark ? "text-white" : "text-[var(--ink)]"}`} />;
}

function MiniStat({label, value, detail}: {label: string; value: string; detail: string}) {
  return <div className="rounded-xl bg-[var(--surface-soft)] p-4"><p className="text-xs text-[var(--muted)]">{label}</p><p className="mt-1 text-lg font-bold">{value}</p><p className="mt-1 text-xs text-[var(--muted)]">{detail}</p></div>;
}

function WeightChip({title, value}: {title: string; value: string}) {
  return <div className="rounded-xl bg-[var(--surface-soft)] p-3"><p className="text-[var(--muted)]">{title}</p><p className="mt-1 text-base font-bold">× {value}</p></div>;
}

function ConfidenceRow({label, value, width}: {label: string; value: string; width: string}) {
  return <div><div className="mb-1.5 flex justify-between"><span>{label}</span><strong>{value}</strong></div><div className="h-2 overflow-hidden rounded-full bg-[var(--surface-strong)]"><div className="h-full rounded-full bg-[var(--primary)]" style={{width}} /></div></div>;
}

function ExplainerCard({number, title, formula, detail}: {number: string; title: string; formula: string; detail: string}) {
  return <article className="surface-card p-5 sm:p-6"><span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--primary)] text-xs font-bold text-white">{number}</span><h3 className="mt-5 font-bold">{title}</h3><Formula latex={formula} className="mt-3 min-h-[86px]" /><p className="mt-3 text-xs leading-5 text-[var(--muted)]">{detail}</p></article>;
}

function DarkStep({number, title, children}: {number: string; title: string; children: React.ReactNode}) {
  return <article className="rounded-2xl border border-white/15 bg-white/[0.06] p-5"><span className="text-xs font-bold text-[#ff9db3]">STEP {number}</span><h3 className="mt-3 text-lg font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-[#bdbdbd]">{children}</p></article>;
}

function MathDefinition({symbol, latex, label}: {symbol: string; latex?: string; label?: string}) {
  return <div className="rounded-lg bg-white/[0.05] p-3"><p className="font-mono text-base font-bold text-[#ff9db3]">{symbol}</p><div className="mt-1 overflow-x-auto whitespace-nowrap text-xs text-[#c9c9c9]">{latex ? <MathFormula latex={latex} /> : label}</div></div>;
}

function ListItem({children}: {children: React.ReactNode}) {
  return <li className="flex gap-3"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-current" /><span>{children}</span></li>;
}
