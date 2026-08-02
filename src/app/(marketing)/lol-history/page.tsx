import Link from "next/link";
import LolIcon from "@/app/components/LolIcon";
import LolMatchScoreboard from "@/app/components/LolMatchScoreboard";
import {listMatchResults} from "@/lib/lol/repository";
import type {MatchResult, MatchTeam} from "@/lib/lol/types";

export const dynamic = "force-dynamic";

export default async function LolHistoryPage() {
  const results = await listMatchResults();
  return (
    <main className="min-h-[70vh] pt-[72px]">
      <div className="page-shell py-8 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">LoL History</p><h1 className="mt-2 text-3xl font-bold tracking-[-0.03em] sm:text-4xl">내전 경기 기록</h1></div><p className="text-sm text-[var(--muted)]">경기를 누르면 점수판이 바로 펼쳐집니다.</p></div>
        <div className="mt-5 space-y-2">
          {results.map((result) => (
            <details key={result.matchResultId} className="group surface-card overflow-hidden">
              <summary className="cursor-pointer list-none px-4 py-3 transition-colors hover:bg-[var(--surface-soft)] [&::-webkit-details-marker]:hidden">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${result.winner === "BLUE" ? "bg-[#eaf3ff] text-[#2463a5]" : "bg-[#fff0f2] text-[#b62e49]"}`}>{result.winner === "BLUE" ? "블루 승" : "레드 승"}</span><p className="text-sm font-semibold">{formatDate(result.playedOn)} <span className="ml-1 font-normal text-[var(--muted)]">{formatDuration(result.durationSeconds)}</span></p></div>
                  <span className="text-xs font-semibold text-[var(--primary)]"><span className="group-open:hidden">점수판 펼치기 ↓</span><span className="hidden group-open:inline">접기 ↑</span></span>
                </div>
                <div className="mt-3 grid gap-2 lg:grid-cols-2"><TeamSummary result={result} team="BLUE" /><TeamSummary result={result} team="RED" /></div>
              </summary>
              <div className="border-t border-[var(--hairline-soft)] bg-white px-3 py-3 sm:px-4">
                <LolMatchScoreboard result={result} compact />
                <div className="mt-3 text-right"><Link href={`/lol-history/${encodeURIComponent(result.matchResultId)}`} className="text-xs font-semibold text-[var(--primary)]">별도 상세 페이지 열기 →</Link></div>
              </div>
            </details>
          ))}
          {!results.length && <div className="surface-card border-dashed py-20 text-center text-sm text-[var(--muted)]">아직 저장된 내전 경기가 없습니다.</div>}
        </div>
      </div>
    </main>
  );
}

function TeamSummary({result, team}: {result: MatchResult; team: MatchTeam}) {
  const stats = result.teamStats.find((entry) => entry.team === team)!;
  const participants = result.participants.filter((participant) => participant.team === team);
  return (
    <div className={`flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2 ${team === "BLUE" ? "border-[#d5e4f8] bg-[#f7faff]" : "border-[#f2d6db] bg-[#fff8f9]"}`}>
      <div className="w-28 shrink-0"><p className="text-xs font-bold">{team === "BLUE" ? "블루" : "레드"} · {stats.kills}/{stats.deaths}/{stats.assists}</p><p className="mt-0.5 text-[10px] text-[var(--muted)]">{stats.goldTotal.toLocaleString()} G · 포탑 {stats.objectives.turretsDestroyed} · 용 {stats.objectives.dragonKills}</p></div>
      <div className="flex shrink-0 -space-x-1">{participants.map((participant, index) => <LolIcon key={index} asset={participant.champion} version={result.ddragonVersion} size={28} className="ring-2 ring-white" />)}</div>
      <p className="min-w-0 truncate text-[11px] text-[var(--muted)]">{participants.map((participant) => participant.observedName).join(" · ")}</p>
    </div>
  );
}

const formatDate = (value: string) => new Intl.DateTimeFormat("ko-KR", {dateStyle: "long", timeZone: "Asia/Seoul"}).format(new Date(`${value}T00:00:00+09:00`));
const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)}분 ${String(seconds % 60).padStart(2, "0")}초`;
