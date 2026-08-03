import type {Metadata} from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "비비 소개 | 친구들과 쓰는 Discord 봇",
  description: "메뉴 추천과 서버 도구, LoL 내전 팀 편성을 제공하는 Discord 봇 비비를 소개합니다.",
};

const features = [
  {
    icon: "crossed-swords",
    label: "LoL 내전",
    title: "감이 아닌 기록으로 나누는 팀",
    description: "최근 전적과 선호 포지션, 최근 같은 팀 기록을 함께 반영해 10명의 균형 잡힌 조합을 찾습니다.",
    accent: "bg-[#fff0f3] text-[var(--primary)]",
  },
  {
    icon: "bowl",
    label: "메뉴 추천",
    title: "오늘 뭐 먹지? 비비에게 물어보기",
    description: "아침·점심·저녁 추천부터 한식, 중식, 일식, 양식 메뉴까지 가볍게 골라 줍니다.",
    accent: "bg-[#fff7e8] text-[#9a6500]",
  },
  {
    icon: "sparkle",
    label: "서버 도구",
    title: "자주 필요한 일은 짧은 명령으로",
    description: "핑 확인, 무작위 팀 나누기, 로또 번호 추천과 채팅 정리를 슬래시 명령으로 처리합니다.",
    accent: "bg-[#eef8ff] text-[#176b9d]",
  },
] as const;

const commandGroups = [
  {
    title: "LoL 내전",
    description: "Riot 계정과 최근 전적을 바탕으로 내전 준비부터 확정까지",
    commands: [
      {name: "/롤계정 등록", detail: "Riot ID와 주·부 포지션 등록 또는 수정"},
      {name: "/롤계정 조회", detail: "내 계정과 동기화 상태 확인"},
      {name: "/롤계정 삭제", detail: "등록 계정과 관련 내전 기록 삭제"},
      {name: "/롤전적 조회", detail: "랭크와 포지션별 최근 전적 요약"},
      {name: "/롤전적 갱신", detail: "최근 전적 갱신 요청 · 15분 간격"},
      {name: "/내전 만들기", detail: "참가자 10명 선택 후 생성·재편성·확정"},
    ],
  },
  {
    title: "생활",
    description: "고민되는 메뉴와 소소한 선택을 빠르게 해결",
    commands: [
      {name: "/아메추 · /점메추 · /저메추", detail: "시간대와 계절을 반영한 음식 추천"},
      {name: "/한식 · /중식 · /일식 · /양식", detail: "카테고리별 메뉴 목록과 오늘의 추천"},
      {name: "/lotto", detail: "1부터 45까지 중 로또 번호 6개 추천"},
    ],
  },
  {
    title: "서버 도구",
    description: "친구들과 쓰기 좋은 작고 실용적인 명령",
    commands: [
      {name: "/ping", detail: "비비의 응답 속도 확인"},
      {name: "/team", detail: "짝수 인원을 두 팀으로 무작위 편성"},
      {name: "/clear", detail: "채팅 최대 20개 삭제 · 봇의 메시지 관리 권한 필요"},
    ],
  },
] as const;

export default function Home() {
  return (
    <main className="pt-[72px]">
      <section className="overflow-hidden border-b border-[var(--hairline-soft)]">
        <div className="page-shell grid min-h-[650px] items-center gap-12 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-20">
          <div className="max-w-2xl">
            <p className="eyebrow">Discord bot for friends</p>
            <h1 className="mt-5 text-[clamp(40px,6vw,68px)] font-bold leading-[1.08] tracking-[-0.045em] text-[var(--ink)]">
              친구들과 더 가볍게,<br />
              게임은 <span className="text-[var(--primary)]">더 공정하게.</span>
            </h1>
            <p className="mt-7 max-w-xl text-base leading-7 text-[var(--body)] sm:text-lg sm:leading-8">
              비비는 메뉴 추천 같은 일상의 작은 고민부터 최근 전적을 반영한 LoL 내전 팀 편성까지 함께하는 Discord 봇입니다.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/" className="primary-button px-6">
                롤 내전 팀 편성
                <ArrowIcon />
              </Link>
              <Link href="#commands" className="secondary-button px-6">
                명령어 둘러보기
              </Link>
            </div>
            <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-sm text-[var(--muted)]">
              <TrustItem>로그인 없이 공개 편성</TrustItem>
              <TrustItem>최근 전적 반영</TrustItem>
              <TrustItem>모바일 지원</TrustItem>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[500px] lg:mr-0">
            <div className="absolute -left-8 -top-8 h-32 w-32 rounded-full bg-[var(--primary-soft)]" />
            <div className="absolute -bottom-10 -right-10 h-44 w-44 rounded-full bg-[#e8f7ff]" />
            <div className="relative overflow-hidden rounded-[32px] border border-[var(--hairline-soft)] bg-[#dff4ff] p-6 shadow-[var(--shadow-float)] sm:p-9">
              <Image
                src="/images/bibi-logo.png"
                alt="하늘색 배경에서 웃고 있는 비비 캐릭터"
                width={658}
                height={616}
                priority
                sizes="(max-width: 1024px) 90vw, 500px"
                className="h-auto w-full rounded-[24px]"
              />
              <div className="absolute bottom-10 left-10 rounded-full bg-white px-4 py-2 text-sm font-semibold shadow-[var(--shadow-float)] sm:bottom-14 sm:left-14">
                오늘도 준비 완료 <span aria-hidden="true">✦</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="page-shell py-16 sm:py-20">
        <div className="max-w-2xl">
          <p className="eyebrow">What BIBI does</p>
          <h2 className="section-title mt-3">친구들이 자주 하는 고민을 한곳에서</h2>
          <p className="mt-4 text-base leading-7 text-[var(--muted)]">과장된 기능 소개 대신 지금 v1에서 실제로 사용할 수 있는 것만 담았습니다.</p>
        </div>
        <div className="mt-9 grid gap-4 md:grid-cols-3">
          {features.map((feature) => (
            <article key={feature.label} className="surface-card p-6 sm:p-7">
              <div className={`grid h-12 w-12 place-items-center rounded-full ${feature.accent}`}>
                <FeatureIcon name={feature.icon} />
              </div>
              <p className="mt-6 text-sm font-semibold text-[var(--primary)]">{feature.label}</p>
              <h3 className="mt-2 text-xl font-semibold leading-7 tracking-[-0.02em]">{feature.title}</h3>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-[var(--surface-soft)] py-16 sm:py-20">
        <div className="page-shell grid items-center gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <p className="eyebrow">Balanced teams</p>
            <h2 className="section-title mt-3">10명을 고르면 비비가 균형을 찾습니다</h2>
            <p className="mt-4 max-w-lg text-base leading-7 text-[var(--muted)]">
              단순 티어 합산이 아니라 최근 경기의 포지션별 지표와 선호 포지션, 최근 같은 팀 조합을 함께 살펴봅니다.
            </p>
            <Link href="/" className="primary-button mt-7 px-6">웹에서 바로 편성하기 <ArrowIcon /></Link>
          </div>
          <ol className="grid gap-3 sm:grid-cols-3">
            <Step number="1" title="선수 선택">동기화가 완료된 선수 중 정확히 10명을 선택합니다.</Step>
            <Step number="2" title="팀 생성">블루와 레드 팀의 포지션까지 함께 계산합니다.</Step>
            <Step number="3" title="다시 편성">원하면 방금 조합을 제외하고 새 조합을 찾습니다.</Step>
          </ol>
        </div>
      </section>

      <section id="commands" className="page-shell py-16 sm:py-20">
        <div className="max-w-2xl">
          <p className="eyebrow">Slash commands</p>
          <h2 className="section-title mt-3">지금 비비에게 말할 수 있는 것</h2>
          <p className="mt-4 text-base leading-7 text-[var(--muted)]">Discord 입력창에 슬래시 명령을 입력해 바로 시작할 수 있습니다.</p>
        </div>
        <div className="mt-9 grid gap-5 lg:grid-cols-3">
          {commandGroups.map((group) => (
            <article key={group.title} className="surface-card overflow-hidden">
              <header className="border-b border-[var(--hairline-soft)] bg-[var(--surface-soft)] p-6">
                <h3 className="text-lg font-semibold">{group.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{group.description}</p>
              </header>
              <dl className="divide-y divide-[var(--hairline-soft)] px-6">
                {group.commands.map((command) => (
                  <div key={command.name} className="py-4">
                    <dt><code className="rounded-md bg-[var(--primary-soft)] px-2 py-1 font-mono text-xs font-semibold text-[var(--primary)]">{command.name}</code></dt>
                    <dd className="mt-2 text-sm leading-6 text-[var(--muted)]">{command.detail}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function TrustItem({children}: {children: React.ReactNode}) {
  return <span className="inline-flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]"><CheckIcon /></span>{children}</span>;
}

function Step({number, title, children}: {number: string; title: string; children: React.ReactNode}) {
  return <li className="surface-card p-5"><span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--primary)] text-sm font-bold text-white">{number}</span><h3 className="mt-5 font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-[var(--muted)]">{children}</p></li>;
}

function FeatureIcon({name}: {name: typeof features[number]["icon"]}) {
  if (name === "crossed-swords") return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m5 4 15 15M14 4h6v6M10 14l-6 6M4 14l6 6M15 9l5-5" /></svg>;
  if (name === "bowl") return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round"><path d="M4 11h16a8 8 0 0 1-16 0ZM8 20h8M8 7c0-1 1-1.5 1-2.5S8 3 8 2M13 7c0-1 1-1.5 1-2.5S13 3 13 2" /></svg>;
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3 1.3 4.2L17.5 9l-4.2 1.8L12 15l-1.3-4.2L6.5 9l4.2-1.8L12 3ZM19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15ZM5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14Z" /></svg>;
}

function ArrowIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8"><path d="M4 10h12M11 5l5 5-5 5" /></svg>;
}

function CheckIcon() {
  return <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3 w-3 fill-none stroke-current" strokeWidth="2"><path d="m3 8 3 3 7-7" /></svg>;
}
