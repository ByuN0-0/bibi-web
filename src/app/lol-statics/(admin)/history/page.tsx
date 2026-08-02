import Link from "next/link";
import {listAllSessions, listMatchResults} from "@/lib/lol/repository";
import {ROLE_LABEL} from "@/lib/lol/types";

export default async function HistoryPage() {
  const [sessions, results] = await Promise.all([listAllSessions(), listMatchResults()]);
  const resultBySession = new Map(results.map((result) => [result.sessionId, result]));
  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-8"><p className="eyebrow">History</p><h1 className="mt-3 text-3xl font-bold tracking-[-0.03em]">내전 팀·경기 기록</h1><p className="mt-3 text-sm leading-6 text-[var(--muted)]">확정 팀 연결 상태와 공개 점수판을 확인하고 오인식 값을 수정합니다.</p></div>
      <div className="space-y-5">
        {sessions.map((session) => {
          const result = resultBySession.get(session.sessionId);
          return (
            <article key={session.sessionId} className="surface-card p-5 sm:p-6">
              <div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs text-[var(--muted)]">팀 확정 · {formatDateTime(session.confirmedAt)}</p><h2 className="mt-1 text-lg font-bold">균형 등급 · <span className="text-[var(--success)]">{session.composition.balanceGrade}</span></h2></div><ResultBadge winner={result?.winner} /></div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">{(["blue", "red"] as const).map((team) => <div key={team} className={`rounded-xl border p-4 ${team === "blue" ? "border-[#cfe2ff] bg-[#f5f9ff]" : "border-[#ffd5dc] bg-[#fff7f8]"}`}><h3 className="text-sm font-bold">{team === "blue" ? "블루 팀" : "레드 팀"}</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{session.composition[team].map((player) => <div key={player.discordUserId} className="text-xs"><span className="text-[var(--muted)]">{ROLE_LABEL[player.role]}</span> <strong>{player.displayName}</strong></div>)}</div></div>)}</div>
              {result ? <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--hairline-soft)] pt-5"><div><p className="text-sm font-semibold">{result.playedOn} · {formatDuration(result.durationSeconds)} · 게스트 {result.participants.filter((participant) => participant.guest).length}명</p><p className="mt-1 text-xs text-[var(--muted)]">Data Dragon {result.ddragonVersion} · 리비전 {result.revision}</p></div><div className="flex flex-wrap gap-2"><Link href={`/lol-history/${encodeURIComponent(result.matchResultId)}`} className="secondary-button">공개 상세</Link><Link href={`/lol-statics/history/${encodeURIComponent(result.matchResultId)}/edit`} className="primary-button">결과 수정</Link></div></div> : <div className="mt-5 rounded-xl border border-dashed border-[var(--hairline)] bg-[var(--surface-soft)] px-4 py-5 text-center text-sm text-[var(--muted)]">아직 저장된 경기 결과가 없습니다.</div>}
            </article>
          );
        })}
        {!sessions.length && <div className="surface-card border-dashed py-20 text-center text-sm text-[var(--muted)]">아직 확정된 팀 기록이 없습니다.</div>}
      </div>
    </div>
  );
}

function ResultBadge({winner}: {winner?: "BLUE" | "RED"}) {
  if (!winner) return <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1 text-xs font-bold text-[var(--muted)]">결과 미등록</span>;
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${winner === "BLUE" ? "bg-[#eaf3ff] text-[#2463a5]" : "bg-[#fff0f2] text-[#b62e49]"}`}>{winner === "BLUE" ? "블루 승" : "레드 승"}</span>;
}

const formatDateTime = (time: number) => new Intl.DateTimeFormat("ko-KR", {dateStyle: "medium", timeStyle: "short"}).format(time);
const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)}분 ${seconds % 60}초`;
