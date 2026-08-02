import TeamBuilder from "@/app/lol-statics/components/TeamBuilder";
import {latestSystemStatus, listPlayers} from "@/lib/lol/repository";

export default async function DashboardPage() {
  const [players, status] = await Promise.all([listPlayers(), latestSystemStatus()]);
  const readyCount = players.filter((player) => player.syncStatus === "READY").length;
  const lastSync = players.reduce((latest, player) => Math.max(latest, player.lastSyncedAt), 0);
  const heartbeatFresh = !!status && Date.now() - status.heartbeatAt < 3 * 60 * 1000;
  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-8">
        <p className="text-sm font-medium text-cyan-300">TEAM BALANCER</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">오늘의 내전 팀 편성</h1>
        <p className="mt-2 text-sm text-slate-400">선수 10명을 고르면 최근 전적과 포지션 선호, 최근 같은 팀 기록을 함께 반영합니다.</p>
      </div>
      <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatusCard label="등록 선수" value={`${players.length}명`} detail={`동기화 완료 ${readyCount}명`} />
        <StatusCard label="Java 봇" value={heartbeatFresh ? "정상" : "확인 필요"} detail={status ? formatTime(status.heartbeatAt) : "heartbeat 없음"} tone={heartbeatFresh ? "good" : "warn"} />
        <StatusCard label="마지막 선수 동기화" value={lastSync ? formatDate(lastSync) : "대기 중"} detail={lastSync ? formatTime(lastSync) : "완료 기록 없음"} />
        <StatusCard label="전체 동기화 실패" value={`${status?.failedSyncCount ?? 0}건`} detail={status?.lastFullSyncAt ? `전체 갱신 ${formatTime(status.lastFullSyncAt)}` : "전체 갱신 대기"} tone={status?.failedSyncCount ? "warn" : "good"} />
      </section>
      <TeamBuilder players={players} />
    </div>
  );
}

function StatusCard({label, value, detail, tone}: {label: string; value: string; detail: string; tone?: "good" | "warn"}) {
  const color = tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : "text-white";
  return <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><p className="text-xs text-slate-500">{label}</p><p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p><p className="mt-2 text-xs text-slate-500">{detail}</p></div>;
}

const formatDate = (time: number) => new Intl.DateTimeFormat("ko-KR", {month: "short", day: "numeric"}).format(time);
const formatTime = (time: number) => new Intl.DateTimeFormat("ko-KR", {hour: "2-digit", minute: "2-digit"}).format(time);
