import {listAllSessions} from "@/lib/lol/repository";
import {ROLE_LABEL} from "@/lib/lol/types";

export default async function HistoryPage() {
  const sessions = await listAllSessions();
  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-8">
        <p className="eyebrow">History</p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.03em]">확정 팀 기록</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">최근 같은 편 반복을 줄이는 계산에도 최근 5회 기록이 사용됩니다.</p>
      </div>
      <div className="space-y-4">
        {sessions.map((session) => (
          <article key={session.sessionId} className="surface-card p-5 sm:p-6">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <p className="text-xs text-[var(--muted)]">{new Intl.DateTimeFormat("ko-KR", {dateStyle: "medium", timeStyle: "short"}).format(session.confirmedAt)}</p>
                <h2 className="mt-1 text-lg font-bold">균형 등급 · <span className="text-[var(--success)]">{session.composition.balanceGrade}</span></h2>
              </div>
              <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1 text-xs text-[var(--muted)]">{session.composition.algorithmVersion}</span>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <HistoryTeam title="블루 팀" tone="blue" assignments={session.composition.blue} />
              <HistoryTeam title="레드 팀" tone="red" assignments={session.composition.red} />
            </div>
          </article>
        ))}
        {!sessions.length && <div className="surface-card border-dashed py-20 text-center text-sm text-[var(--muted)]">아직 확정된 팀 기록이 없습니다.</div>}
      </div>
    </div>
  );
}

function HistoryTeam({title, tone, assignments}: {title: string; tone: "blue" | "red"; assignments: Awaited<ReturnType<typeof listAllSessions>>[number]["composition"]["blue"]}) {
  const color = tone === "blue" ? "border-[#cfe2ff] bg-[#f5f9ff] text-[#2463a5]" : "border-[#ffd5dc] bg-[#fff7f8] text-[#b62e49]";
  return <div className={`rounded-xl border p-4 ${color}`}><h3 className="text-sm font-bold">{title}</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{assignments.map((player) => <div key={player.discordUserId} className="text-xs"><span className="opacity-70">{ROLE_LABEL[player.role]}</span> <span className="font-semibold text-[var(--ink)]">{player.displayName}</span></div>)}</div></div>;
}
