import Link from "next/link";
import LolIcon from "@/app/components/LolIcon";
import {listMatchResults} from "@/lib/lol/repository";

export const dynamic = "force-dynamic";

export default async function LolHistoryPage() {
  const results = await listMatchResults();
  return (
    <main className="min-h-[70vh] pt-[72px]">
      <div className="page-shell py-12 sm:py-16">
        <p className="eyebrow">LoL History</p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.03em] sm:text-4xl">내전 경기 기록</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">경기 종료 점수판에서 확인한 팀 결과와 최종 아이템을 기록합니다.</p>
        <div className="mt-8 space-y-4">
          {results.map((result) => (
            <Link key={result.matchResultId} href={`/lol-history/${encodeURIComponent(result.matchResultId)}`} className="surface-card block p-5 hover:border-[var(--hairline)] hover:shadow-[var(--shadow-float)] sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><p className="text-xs text-[var(--muted)]">{formatDate(result.playedOn)} · {formatDuration(result.durationSeconds)}</p><h2 className={`mt-2 text-lg font-bold ${result.winner === "BLUE" ? "text-[#2463a5]" : "text-[#b62e49]"}`}>{result.winner === "BLUE" ? "블루 팀 승리" : "레드 팀 승리"}</h2></div>
                <span className="text-xs font-semibold text-[var(--primary)]">상세 점수판 →</span>
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {(["BLUE", "RED"] as const).map((team) => {
                  const stats = result.teamStats.find((entry) => entry.team === team)!;
                  return <div key={team} className={`rounded-xl border p-4 ${team === "BLUE" ? "border-[#d5e4f8] bg-[#f7faff]" : "border-[#f2d6db] bg-[#fff8f9]"}`}><div className="flex justify-between gap-3 text-xs"><strong>{team === "BLUE" ? "블루" : "레드"}</strong><span>{stats.kills}/{stats.deaths}/{stats.assists} · {stats.goldTotal.toLocaleString()} G</span></div><div className="mt-3 flex gap-1">{result.participants.filter((participant) => participant.team === team).map((participant, index) => <LolIcon key={index} asset={participant.champion} version={result.ddragonVersion} size={32} />)}</div></div>;
                })}
              </div>
            </Link>
          ))}
          {!results.length && <div className="surface-card border-dashed py-20 text-center text-sm text-[var(--muted)]">아직 저장된 내전 경기가 없습니다.</div>}
        </div>
      </div>
    </main>
  );
}

const formatDate = (value: string) => new Intl.DateTimeFormat("ko-KR", {dateStyle: "long", timeZone: "Asia/Seoul"}).format(new Date(`${value}T00:00:00+09:00`));
const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)}분 ${String(seconds % 60).padStart(2, "0")}초`;
