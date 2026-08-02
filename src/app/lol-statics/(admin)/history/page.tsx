import Link from "next/link";
import {listMatchResults} from "@/lib/lol/repository";

export default async function HistoryPage() {
  const results = await listMatchResults();
  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-8"><p className="eyebrow">History</p><h1 className="mt-3 text-3xl font-bold tracking-[-0.03em]">내전 경기 기록</h1><p className="mt-3 text-sm leading-6 text-[var(--muted)]">저장된 점수판을 확인하고 선수 연결이나 오인식 값을 수정합니다.</p></div>
      <div className="space-y-5">
        {results.map((result) => (
          <article key={result.matchResultId} className="surface-card p-5 sm:p-6">
            <div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs text-[var(--muted)]">{result.playedOn} · {formatDuration(result.durationSeconds)}</p><h2 className="mt-1 text-lg font-bold">게스트 {result.participants.filter((participant) => participant.guest).length}명</h2></div><ResultBadge winner={result.winner} /></div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">{(["BLUE", "RED"] as const).map((team) => <div key={team} className={`rounded-xl border p-4 ${team === "BLUE" ? "border-[#cfe2ff] bg-[#f5f9ff]" : "border-[#ffd5dc] bg-[#fff7f8]"}`}><h3 className="text-sm font-bold">{team === "BLUE" ? "블루 팀" : "레드 팀"}</h3><p className="mt-3 text-xs leading-6">{result.participants.filter((participant) => participant.team === team).map((participant) => participant.observedName).join(" · ")}</p></div>)}</div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--hairline-soft)] pt-5"><p className="text-xs text-[var(--muted)]">Data Dragon {result.ddragonVersion} · 리비전 {result.revision}</p><div className="flex flex-wrap gap-2"><Link href={`/lol-history/${encodeURIComponent(result.matchResultId)}`} className="secondary-button">공개 상세</Link><Link href={`/lol-statics/history/${encodeURIComponent(result.matchResultId)}/edit`} className="primary-button">결과 수정</Link></div></div>
          </article>
        ))}
        {!results.length && <div className="surface-card border-dashed py-20 text-center text-sm text-[var(--muted)]">아직 저장된 내전 경기가 없습니다.</div>}
      </div>
    </div>
  );
}

function ResultBadge({winner}: {winner: "BLUE" | "RED"}) {
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${winner === "BLUE" ? "bg-[#eaf3ff] text-[#2463a5]" : "bg-[#fff0f2] text-[#b62e49]"}`}>{winner === "BLUE" ? "블루 승" : "레드 승"}</span>;
}

const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)}분 ${seconds % 60}초`;
