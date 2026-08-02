"use client";

import {FormEvent, useState} from "react";
import {rankDisplay, ROLE_LABEL, ROLES, type PlayerProfile, type Role} from "@/lib/lol/types";

const empty = {discordUserId: "", displayName: "", riotGameName: "", riotTagLine: "", primaryRole: "TOP" as Role, secondaryRole: "JUNGLE" as Role};

export default function PlayerManager({initialPlayers}: {initialPlayers: PlayerProfile[]}) {
  const [players, setPlayers] = useState(initialPlayers);
  const [form, setForm] = useState(empty);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function reload() {
    const response = await fetch("/api/lol-statics/players");
    if (response.ok) setPlayers((await response.json()).players);
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setPending(true); setMessage("");
    const response = await fetch("/api/lol-statics/players", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(form)});
    const result = await response.json();
    setMessage(response.ok ? "저장했습니다. Java 봇이 전적 동기화를 처리합니다." : result.error);
    if (response.ok) {setForm(empty); await reload();}
    setPending(false);
  }
  async function remove(id: string) {
    if (!confirm("선수와 해당 선수가 포함된 팀 반복 기록을 삭제할까요?")) return;
    await fetch(`/api/lol-statics/players/${id}`, {method: "DELETE"});
    await reload();
  }
  async function sync(ids?: string[]) {
    setPending(true);
    const response = await fetch("/api/lol-statics/players/sync", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(ids ? {discordUserIds: ids} : {all: true})});
    const result = await response.json();
    setMessage(response.ok ? `${result.requested}명의 갱신을 요청했습니다.` : result.error);
    await reload(); setPending(false);
  }
  return <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
    <form onSubmit={submit} className="h-fit rounded-2xl border border-white/10 bg-white/[0.035] p-6 xl:sticky xl:top-8">
      <h2 className="font-bold">선수 등록·수정</h2><div className="mt-5 space-y-3">
        <Field label="Discord 사용자 ID" value={form.discordUserId} disabled={players.some((player) => player.discordUserId === form.discordUserId)} onChange={(value) => setForm({...form, discordUserId: value})} />
        <Field label="표시 이름" value={form.displayName} onChange={(value) => setForm({...form, displayName: value})} />
        <div className="grid grid-cols-[1fr_92px] gap-2"><Field label="Riot 게임 이름" value={form.riotGameName} onChange={(value) => setForm({...form, riotGameName: value})} /><Field label="태그" value={form.riotTagLine} onChange={(value) => setForm({...form, riotTagLine: value})} /></div>
        <div className="grid grid-cols-2 gap-2"><RoleSelect label="주 포지션" value={form.primaryRole} onChange={(value) => setForm({...form, primaryRole: value})} /><RoleSelect label="부 포지션" value={form.secondaryRole} onChange={(value) => setForm({...form, secondaryRole: value})} /></div>
      </div>
      {message && <p className="mt-4 rounded-xl bg-white/5 p-3 text-xs text-slate-300">{message}</p>}
      <div className="mt-5 flex gap-2"><button disabled={pending} className="flex-1 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-50">저장</button><button type="button" onClick={() => setForm(empty)} className="rounded-xl border border-white/10 px-4 text-sm">초기화</button></div>
    </form>
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6"><div className="flex items-center justify-between"><div><h2 className="font-bold">등록 선수 {players.length}명</h2><p className="mt-1 text-xs text-slate-500">역할별 근거 통계는 펼쳐서 확인</p></div><button disabled={pending || !players.length} onClick={() => sync()} className="rounded-xl border border-white/10 px-3 py-2 text-xs disabled:opacity-40">전체 갱신</button></div>
      <div className="mt-5 space-y-3">{players.map((player) => <details key={player.discordUserId} className="group rounded-xl border border-white/[0.08] bg-black/10 p-4"><summary className="cursor-pointer list-none"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{player.displayName} <span className="font-normal text-slate-500">· {player.riotGameName}#{player.riotTagLine}</span></p><p className="mt-1 text-xs text-slate-500">{ROLE_LABEL[player.primaryRole]} / {ROLE_LABEL[player.secondaryRole]} · 솔랭 {rankDisplay(player.soloRank)} · 자랭 {rankDisplay(player.flexRank)}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${player.syncStatus === "READY" ? "bg-emerald-400/10 text-emerald-300" : player.syncStatus === "FAILED" ? "bg-rose-400/10 text-rose-300" : "bg-amber-400/10 text-amber-300"}`}>{player.syncStatus}</span></div></summary>
        <div className="mt-4 border-t border-white/[0.07] pt-4"><p className="mb-3 text-sm font-bold text-cyan-300">종합 실력지표 {overallScore(player)}점</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{ROLES.map((role) => {const stats = player.roleStats?.[role]; return <div key={role} className="rounded-lg bg-white/[0.03] p-3 text-xs"><div className="flex justify-between"><p className="font-semibold text-slate-300">{ROLE_LABEL[role]}</p><p className="font-bold text-slate-200">{Math.round((stats?.balanceSignal ?? 0.35) * 100)}점</p></div><p className="mt-2 text-slate-500">표본 {stats?.sampleCount ?? 0}경기 · 신뢰도 {Math.round((stats?.confidence ?? 0) * 100)}%</p><p className="mt-1 text-slate-500">15분 골드 {Math.round(stats?.goldDiff15 ?? 0)} · XP {Math.round(stats?.xpDiff15 ?? 0)} · CS {(stats?.csDiff15 ?? 0).toFixed(1)}</p><p className="mt-1 text-slate-500">피해효율 {(stats?.damagePerGoldDiff ?? 0).toFixed(2)} · 킬관여 {(stats?.killParticipationDiff ?? 0).toFixed(2)} · 시야 {(stats?.visionPerMinuteDiff ?? 0).toFixed(2)}</p><p className="mt-1 text-slate-500">CC {(stats?.crowdControlPerMinuteDiff ?? 0).toFixed(2)} · 오브젝트 {(stats?.objectiveParticipationDiff ?? 0).toFixed(2)}</p></div>;})}</div><div className="mt-4 flex gap-2"><button onClick={() => setForm({discordUserId: player.discordUserId, displayName: player.displayName, riotGameName: player.riotGameName, riotTagLine: player.riotTagLine, primaryRole: player.primaryRole, secondaryRole: player.secondaryRole})} className="rounded-lg border border-white/10 px-3 py-2 text-xs">수정</button><button onClick={() => sync([player.discordUserId])} className="rounded-lg border border-white/10 px-3 py-2 text-xs">전적 갱신</button><button onClick={() => remove(player.discordUserId)} className="rounded-lg border border-rose-400/20 px-3 py-2 text-xs text-rose-300">삭제</button></div></div>
      </details>)}{!players.length && <p className="py-12 text-center text-sm text-slate-500">등록된 선수가 없습니다.</p>}</div>
    </section>
  </div>;
}

function Field({label, value, onChange, disabled}: {label: string; value: string; onChange: (value: string) => void; disabled?: boolean}) {return <label className="block text-xs text-slate-400">{label}<input required disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/50 disabled:opacity-60" /></label>;}
function RoleSelect({label, value, onChange}: {label: string; value: Role; onChange: (value: Role) => void}) {return <label className="block text-xs text-slate-400">{label}<select value={value} onChange={(event) => onChange(event.target.value as Role)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#101725] px-3 py-2.5 text-sm text-white">{ROLES.map((role) => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}</select></label>;}

function overallScore(player: PlayerProfile) {
  const primary = player.roleStats?.[player.primaryRole]?.balanceSignal ?? 0.35;
  const secondary = player.roleStats?.[player.secondaryRole]?.balanceSignal ?? primary;
  return Math.round((primary * 0.7 + secondary * 0.3) * 100);
}
