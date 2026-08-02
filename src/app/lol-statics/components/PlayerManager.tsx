"use client";

import {FormEvent, useCallback, useEffect, useState} from "react";
import {rankDisplay, ROLE_LABEL, ROLES, type PlayerProfile, type Role} from "@/lib/lol/types";

const empty = {
  discordUserId: "",
  displayName: "",
  riotGameName: "",
  riotTagLine: "",
  primaryRole: "TOP" as Role,
  secondaryRole: "JUNGLE" as Role,
};

const statusLabel: Record<PlayerProfile["syncStatus"], string> = {
  REQUESTED: "갱신 대기",
  SYNCING: "갱신 중",
  READY: "갱신 완료",
  FAILED: "갱신 실패",
};

export default function PlayerManager({initialPlayers}: {initialPlayers: PlayerProfile[]}) {
  const [players, setPlayers] = useState(initialPlayers);
  const [form, setForm] = useState(empty);
  const [message, setMessage] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const response = await fetch("/api/lol-statics/players", {cache: "no-store"});
    if (response.ok) setPlayers((await response.json()).players);
  }, []);

  useEffect(() => {
    if (!players.some((player) => player.syncStatus === "REQUESTED" || player.syncStatus === "SYNCING")) {
      return;
    }
    const interval = window.setInterval(() => void reload(), 5_000);
    return () => window.clearInterval(interval);
  }, [players, reload]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPendingAction("save");
    setMessage("");
    try {
      const response = await fetch("/api/lol-statics/players", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(form),
      });
      const result = await response.json() as {
        error?: string;
        needsSync?: boolean;
        player?: PlayerProfile;
      };
      setMessage(response.ok ? "저장했습니다." : result.error ?? "선수 정보를 저장하지 못했습니다.");
      if (response.ok) {
        setForm(empty);
        await reload();
        if (result.needsSync && result.player) await sync(result.player.discordUserId);
      }
    } catch {
      setMessage("선수 정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPendingAction(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("선수와 해당 선수가 포함된 팀 반복 기록을 삭제할까요?")) return;
    setPendingAction(id);
    try {
      await fetch(`/api/lol-statics/players/${id}`, {method: "DELETE"});
      await reload();
    } finally {
      setPendingAction(null);
    }
  }

  async function sync(discordUserId: string) {
    setPendingAction(discordUserId);
    setMessage("");
    setPlayers((current) => current.map((player) => player.discordUserId === discordUserId
      ? {...player, syncStatus: "SYNCING", lastSyncStartedAt: Date.now()}
      : player));
    try {
      const response = await fetch("/api/lol-statics/players/sync", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({discordUserId}),
      });
      const result = await response.json() as {
        error?: string;
        retryAt?: number;
      };
      setMessage(response.ok
        ? "웹 서버에서 롤 계정과 최근 전적을 갱신했습니다."
        : result.retryAt
          ? `${result.error} ${formatDateTime(result.retryAt)} 이후 다시 시도해 주세요.`
          : result.error ?? "롤 계정을 갱신하지 못했습니다.");
      await reload();
    } catch {
      setMessage("롤 계정 갱신을 요청하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="space-y-4">
      {message && <p className="rounded-xl border border-[var(--hairline)] bg-white px-4 py-3 text-sm text-[var(--body)]">{message}</p>}
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <form onSubmit={submit} className="surface-card h-fit p-6 xl:sticky xl:top-8">
          <h2 className="font-bold">선수 등록·수정</h2>
          <div className="mt-5 space-y-3">
            <Field label="Discord 사용자 ID" value={form.discordUserId} disabled={players.some((player) => player.discordUserId === form.discordUserId)} onChange={(value) => setForm({...form, discordUserId: value})} />
            <Field label="표시 이름" value={form.displayName} onChange={(value) => setForm({...form, displayName: value})} />
            <div className="grid grid-cols-[1fr_92px] gap-2">
              <Field label="Riot 게임 이름" value={form.riotGameName} onChange={(value) => setForm({...form, riotGameName: value})} />
              <Field label="태그" value={form.riotTagLine} onChange={(value) => setForm({...form, riotTagLine: value})} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <RoleSelect label="주 포지션" value={form.primaryRole} onChange={(value) => setForm({...form, primaryRole: value})} />
              <RoleSelect label="부 포지션" value={form.secondaryRole} onChange={(value) => setForm({...form, secondaryRole: value})} />
            </div>
          </div>
          <div className="mt-5 flex gap-2">
            <button disabled={pendingAction !== null} className="primary-button flex-1">저장</button>
            <button type="button" onClick={() => setForm(empty)} className="secondary-button">초기화</button>
          </div>
        </form>

        <section className="surface-card p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div><h2 className="font-bold">등록 선수 {players.length}명</h2><p className="mt-1 text-xs text-[var(--muted)]">웹 서버 직접 갱신 · 선수별 15분에 한 번 가능</p></div>
          </div>
          <div className="mt-5 space-y-3">
            {players.map((player) => {
              const inProgress = player.syncStatus === "REQUESTED" || player.syncStatus === "SYNCING";
              return (
                <details key={player.discordUserId} className="group rounded-xl border border-[var(--hairline-soft)] bg-white p-4 open:border-[var(--hairline)]">
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold">{player.displayName} <span className="font-normal text-[var(--muted)]">· {player.riotGameName}#{player.riotTagLine}</span></p>
                        <p className="mt-1 text-xs text-[var(--muted)]">{ROLE_LABEL[player.primaryRole]} / {ROLE_LABEL[player.secondaryRole]} · 솔랭 {rankDisplay(player.soloRank)} · 자랭 {rankDisplay(player.flexRank)}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${player.syncStatus === "READY" ? "bg-[var(--success-soft)] text-[var(--success)]" : player.syncStatus === "FAILED" ? "bg-[var(--error-soft)] text-[var(--error)]" : "bg-[var(--warning-soft)] text-[var(--warning)]"}`}>{statusLabel[player.syncStatus]}</span>
                    </div>
                  </summary>
                  <div className="mt-4 border-t border-[var(--hairline-soft)] pt-4">
                    <p className="mb-3 text-xs text-[var(--muted)]">{syncDetail(player)}</p>
                    <p className="mb-3 text-sm font-bold text-[var(--primary)]">종합 실력지표 {overallScore(player)}점</p>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {ROLES.map((role) => {
                        const stats = player.roleStats?.[role];
                        return <div key={role} className="rounded-lg bg-[var(--surface-soft)] p-3 text-xs"><div className="flex justify-between"><p className="font-semibold text-[var(--body)]">{ROLE_LABEL[role]}</p><p className="font-bold">{Math.round((stats?.balanceSignal ?? 0.35) * 100)}점</p></div><p className="mt-2 text-[var(--muted)]">표본 {stats?.sampleCount ?? 0}경기 · 신뢰도 {Math.round((stats?.confidence ?? 0) * 100)}%</p><p className="mt-1 text-[var(--muted)]">15분 골드 {Math.round(stats?.goldDiff15 ?? 0)} · XP {Math.round(stats?.xpDiff15 ?? 0)} · CS {(stats?.csDiff15 ?? 0).toFixed(1)}</p><p className="mt-1 text-[var(--muted)]">피해효율 {(stats?.damagePerGoldDiff ?? 0).toFixed(2)} · 킬관여 {(stats?.killParticipationDiff ?? 0).toFixed(2)} · 시야 {(stats?.visionPerMinuteDiff ?? 0).toFixed(2)}</p><p className="mt-1 text-[var(--muted)]">CC {(stats?.crowdControlPerMinuteDiff ?? 0).toFixed(2)} · 오브젝트 {(stats?.objectiveParticipationDiff ?? 0).toFixed(2)}</p></div>;
                      })}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button onClick={() => setForm({discordUserId: player.discordUserId, displayName: player.displayName, riotGameName: player.riotGameName, riotTagLine: player.riotTagLine, primaryRole: player.primaryRole, secondaryRole: player.secondaryRole})} className="min-h-11 rounded-lg border border-[var(--hairline)] bg-white px-3 text-xs font-semibold">수정</button>
                      <button disabled={pendingAction !== null || inProgress} onClick={() => sync(player.discordUserId)} className="min-h-11 rounded-lg border border-[#f0afbf] bg-[var(--primary-soft)] px-3 text-xs font-semibold text-[var(--primary)] disabled:opacity-40">{inProgress ? statusLabel[player.syncStatus] : "롤 계정 갱신"}</button>
                      <button disabled={pendingAction !== null} onClick={() => remove(player.discordUserId)} className="min-h-11 rounded-lg border border-[#f2b8aa] bg-[var(--error-soft)] px-3 text-xs font-semibold text-[var(--error)] disabled:opacity-40">삭제</button>
                    </div>
                  </div>
                </details>
              );
            })}
            {!players.length && <p className="py-12 text-center text-sm text-[var(--muted)]">등록된 선수가 없습니다.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({label, value, onChange, disabled}: {label: string; value: string; onChange: (value: string) => void; disabled?: boolean}) {
  return <label className="block text-xs font-medium text-[var(--muted)]">{label}<input required disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} className="form-control text-sm" /></label>;
}

function RoleSelect({label, value, onChange}: {label: string; value: Role; onChange: (value: Role) => void}) {
  return <label className="block text-xs font-medium text-[var(--muted)]">{label}<select value={value} onChange={(event) => onChange(event.target.value as Role)} className="form-control text-sm">{ROLES.map((role) => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}</select></label>;
}

function overallScore(player: PlayerProfile) {
  const primary = player.roleStats?.[player.primaryRole]?.balanceSignal ?? 0.35;
  const secondary = player.roleStats?.[player.secondaryRole]?.balanceSignal ?? primary;
  return Math.round((primary * 0.7 + secondary * 0.3) * 100);
}

function syncDetail(player: PlayerProfile) {
  if (player.syncStatus === "REQUESTED") return "디스코드 봇의 기존 갱신 요청을 기다리고 있습니다. 웹에서는 중복 호출하지 않습니다.";
  if (player.syncStatus === "SYNCING") return "웹 서버 또는 디스코드 봇이 Riot에서 최근 전적을 가져오는 중입니다. 화면은 자동으로 업데이트됩니다.";
  if (player.syncStatus === "FAILED") return `마지막 갱신 실패${player.syncErrorCode ? ` · ${player.syncErrorCode}` : ""}`;
  return player.lastSyncedAt ? `마지막 갱신 ${formatDateTime(player.lastSyncedAt)}` : "아직 갱신된 기록이 없습니다.";
}

const formatDateTime = (time: number) => new Intl.DateTimeFormat("ko-KR", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
}).format(time);
