"use client";

import LolIcon from "@/app/components/LolIcon";
import LolMatchScoreboard from "@/app/components/LolMatchScoreboard";
import {groupMatchResultsByDate, sortParticipantsByRole} from "@/lib/lol/match-history-view";
import type {MatchResultTeamStats, MatchTeam, PublicMatchResult} from "@/lib/lol/types";

export default function PublicMatchHistory({results, loading, error, hasMore, onLoadMore}: {
  results: PublicMatchResult[];
  loading: boolean;
  error: string;
  hasMore: boolean;
  onLoadMore: () => void;
}) {
  const dateGroups = groupMatchResultsByDate(results);

  return (
    <section aria-labelledby="history-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="eyebrow">LoL History</p><h2 id="history-title" className="mt-2 text-2xl font-bold tracking-[-0.03em] sm:text-3xl">내전 경기 기록</h2></div>
        <p className="text-sm text-[var(--muted)]">경기를 누르면 전체 점수판을 볼 수 있어요.</p>
      </div>
      {error && <div role="alert" className="mt-5 rounded-xl border border-[#f2b8aa] bg-[var(--error-soft)] px-4 py-4 text-sm text-[var(--error)]"><p>{error}</p><button type="button" onClick={onLoadMore} className="mt-3 font-bold underline">다시 시도</button></div>}
      <div className="mt-6 space-y-8">
        {dateGroups.map((group) => (
          <section key={group.playedOn} aria-labelledby={`history-date-${group.playedOn}`}>
            <div className="mb-3 flex items-center gap-3">
              <h3 id={`history-date-${group.playedOn}`} className="text-base font-bold tracking-[-0.02em]">{formatDate(group.playedOn)}</h3>
              <span className="rounded-full bg-[var(--surface-strong)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)]">{group.results.length}경기</span>
              <span className="h-px flex-1 bg-[var(--hairline-soft)]" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              {group.results.map((result) => <MatchHistoryCard key={result.matchResultId} result={result} />)}
            </div>
          </section>
        ))}
        {!loading && !error && !results.length && <div className="surface-card border-dashed py-20 text-center text-sm text-[var(--muted)]">아직 저장된 내전 경기가 없습니다.</div>}
      </div>
      {loading && <div className="mt-4 surface-card py-8 text-center text-sm text-[var(--muted)]" aria-live="polite">내전 기록을 불러오는 중…</div>}
      {hasMore && !loading && <div className="mt-5 text-center"><button type="button" onClick={onLoadMore} className="secondary-button min-w-40">기록 더보기</button></div>}
    </section>
  );
}

function MatchHistoryCard({result}: {result: PublicMatchResult}) {
  const blueStats = result.teamStats.find((entry) => entry.team === "BLUE")!;
  const redStats = result.teamStats.find((entry) => entry.team === "RED")!;
  const blueWinner = result.winner === "BLUE";

  return (
    <details className={`group overflow-hidden rounded-xl border border-[var(--hairline-soft)] border-l-4 bg-white ${blueWinner ? "border-l-[#4f83e3]" : "border-l-[#e94f6d]"}`}>
      <summary className="relative cursor-pointer list-none px-4 py-4 transition-colors hover:bg-[var(--surface-soft)] [&::-webkit-details-marker]:hidden">
        <div className="grid gap-4 md:grid-cols-[140px_minmax(0,1fr)] xl:grid-cols-[125px_minmax(280px,0.8fr)_minmax(360px,1fr)] xl:items-center">
          <MatchInfo winner={result.winner} durationSeconds={result.durationSeconds} />
          <TeamTotals blue={blueStats} red={redStats} />
          <RosterSummary result={result} />
        </div>
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-[var(--muted)] shadow-[0_0_0_1px_var(--hairline-soft)]">
          <span className="group-open:hidden">상세 보기</span><span className="hidden group-open:inline">접기</span>
          <span className="inline-block transition-transform group-open:rotate-180" aria-hidden="true">⌄</span>
        </span>
      </summary>
      <div className="border-t border-[var(--hairline-soft)] bg-[var(--surface-soft)] p-2 sm:p-3">
        <LolMatchScoreboard result={result} compact />
      </div>
    </details>
  );
}

function MatchInfo({winner, durationSeconds}: {winner: MatchTeam; durationSeconds: number}) {
  const blue = winner === "BLUE";
  return (
    <div className="pr-20 md:pr-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">내전</p>
      <p className={`mt-1 text-base font-extrabold ${blue ? "text-[#3269bd]" : "text-[#c43652]"}`}>{blue ? "블루 승리" : "레드 승리"}</p>
      <p className="mt-1 text-xs font-medium text-[var(--muted)]">{formatDuration(durationSeconds)}</p>
    </div>
  );
}

function TeamTotals({blue, red}: {blue: MatchResultTeamStats; red: MatchResultTeamStats}) {
  return (
    <div className="rounded-lg bg-[var(--surface-soft)] px-3 py-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3 text-center">
        <div><p className="text-[10px] font-bold uppercase tracking-wide text-[#3269bd]">Blue</p><p className="mt-0.5 text-2xl font-black tabular-nums">{blue.kills}</p></div>
        <p className="pb-1 text-xs font-bold text-[var(--muted-soft)]">VS</p>
        <div><p className="text-[10px] font-bold uppercase tracking-wide text-[#c43652]">Red</p><p className="mt-0.5 text-2xl font-black tabular-nums">{red.kills}</p></div>
      </div>
      <div className="mt-2 grid grid-cols-3 divide-x divide-[var(--hairline)] border-t border-[var(--hairline)] pt-2 text-center text-[10px] text-[var(--muted)]">
        <Metric label="골드" blue={formatGold(blue.goldTotal)} red={formatGold(red.goldTotal)} />
        <Metric label="포탑" blue={blue.objectives.turretsDestroyed} red={red.objectives.turretsDestroyed} />
        <Metric label="드래곤" blue={blue.objectives.dragonKills} red={red.objectives.dragonKills} />
      </div>
    </div>
  );
}

function Metric({label, blue, red}: {label: string; blue: string | number; red: string | number}) {
  return <p><span className="font-bold text-[#3269bd]">{blue}</span><span className="mx-1 text-[9px]">{label}</span><span className="font-bold text-[#c43652]">{red}</span></p>;
}

function RosterSummary({result}: {result: PublicMatchResult}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:col-span-2 xl:col-span-1">
      <RosterColumn result={result} team="BLUE" />
      <RosterColumn result={result} team="RED" />
    </div>
  );
}

function RosterColumn({result, team}: {result: PublicMatchResult; team: MatchTeam}) {
  const participants = sortParticipantsByRole(result.participants.filter((participant) => participant.team === team));
  const blue = team === "BLUE";
  return (
    <div className="min-w-0">
      <p className={`mb-1.5 text-[10px] font-bold uppercase tracking-wide ${blue ? "text-[#3269bd]" : "text-[#c43652]"}`}>{blue ? "Blue team" : "Red team"}</p>
      <div className="space-y-1">
        {participants.map((participant) => (
          <div key={`${participant.role}-${participant.observedName}`} className="flex min-w-0 items-center gap-2">
            <LolIcon asset={participant.champion} version={result.ddragonVersion} size={22} className="shrink-0 rounded" />
            <span className="min-w-0 truncate text-[11px] font-medium" title={participant.observedName}>{participant.observedName}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const formatDate = (value: string) => new Intl.DateTimeFormat("ko-KR", {dateStyle: "long", timeZone: "Asia/Seoul"}).format(new Date(`${value}T00:00:00+09:00`));
const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)}분 ${String(seconds % 60).padStart(2, "0")}초`;
const formatGold = (gold: number) => `${(gold / 1000).toFixed(1)}K`;
