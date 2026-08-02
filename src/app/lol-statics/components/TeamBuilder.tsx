"use client";

import {useMemo, useState} from "react";
import {ROLE_LABEL, type PlayerProfile, type TeamAssignment, type TeamDraft} from "@/lib/lol/types";

export default function TeamBuilder({players}: {players: PlayerProfile[]}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState<TeamDraft | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  function toggle(player: PlayerProfile) {
    if (player.syncStatus !== "READY") return;
    setDraft(null);
    setSelected((current) => current.includes(player.discordUserId)
      ? current.filter((id) => id !== player.discordUserId)
      : current.length < 10 ? [...current, player.discordUserId] : current);
  }

  async function act(action: "generate" | "reroll" | "confirm") {
    setPending(true);
    setError("");
    const response = await fetch("/api/lol-statics/team", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        action,
        selectedDiscordUserIds: selected,
        draftId: draft?.draftId,
      }),
    });
    const result = await response.json();
    if (!response.ok) setError(result.error ?? "팀을 편성하지 못했습니다.");
    else setDraft(result.draft);
    setPending(false);
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
        <div className="flex items-end justify-between gap-4">
          <div><h2 className="text-lg font-bold">참가 선수</h2><p className="mt-1 text-xs text-slate-500">동기화 완료 선수 중 정확히 10명</p></div>
          <span className={`rounded-full px-3 py-1 text-sm font-bold ${selected.length === 10 ? "bg-emerald-400/15 text-emerald-300" : "bg-white/5 text-slate-400"}`}>{selected.length} / 10</span>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {players.map((player) => {
            const active = selectedSet.has(player.discordUserId);
            const ready = player.syncStatus === "READY";
            return (
              <button key={player.discordUserId} type="button" disabled={!ready} onClick={() => toggle(player)} className={`rounded-xl border p-3 text-left transition ${active ? "border-cyan-400/60 bg-cyan-400/10" : "border-white/[0.08] bg-black/10 hover:border-white/20"} disabled:cursor-not-allowed disabled:opacity-45`}>
                <span className="block truncate text-sm font-semibold">{player.displayName}</span>
                <span className="mt-1 block truncate text-xs text-slate-500">{player.riotGameName}#{player.riotTagLine}</span>
                <span className="mt-2 block text-[11px] text-slate-400">{ROLE_LABEL[player.primaryRole]} · {ready ? `종합 ${overallScore(player)}점` : player.syncStatus}</span>
              </button>
            );
          })}
          {!players.length && <p className="col-span-full rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">선수 관리에서 참가자를 먼저 등록하세요.</p>}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button disabled={pending || selected.length !== 10 || draft?.status === "CONFIRMED"} onClick={() => act("generate")} className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-40">팀 생성</button>
          <button disabled={pending || !draft || draft.status === "CONFIRMED"} onClick={() => act("reroll")} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold disabled:opacity-40">다시 섞기</button>
          <button disabled={pending || !draft || draft.status === "CONFIRMED"} onClick={() => act("confirm")} className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-sm font-semibold text-emerald-300 disabled:opacity-40">확정</button>
          {pending && <span className="self-center text-xs text-slate-500">계산 중…</span>}
        </div>
        {error && <p className="mt-4 rounded-xl bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</p>}
      </div>

      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent p-5 sm:p-6">
        {!draft?.composition ? (
          <div className="grid min-h-96 place-items-center text-center"><div><p className="text-5xl opacity-30">⚔</p><p className="mt-4 font-semibold text-slate-300">팀 편성 결과가 여기에 표시됩니다.</p><p className="mt-2 text-sm text-slate-500">점수 대신 균형 등급과 근거 경고만 제공합니다.</p></div></div>
        ) : (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs text-slate-500">균형 등급</p><p className="mt-1 text-2xl font-bold text-emerald-300">{draft.composition.balanceGrade}</p></div>{draft.status === "CONFIRMED" && <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-bold text-emerald-300">확정됨</span>}</div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Team title="블루 팀" color="blue" assignments={draft.composition.blue} profiles={players} />
              <Team title="레드 팀" color="red" assignments={draft.composition.red} profiles={players} />
            </div>
            {([...draft.composition.blue, ...draft.composition.red].some((player) => player.offRole || player.lowConfidence)) && (
              <div className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/[0.07] px-4 py-3 text-xs leading-5 text-amber-100">⚠ 오프롤 또는 표본이 적은 포지션이 포함되어 있습니다. 선수별 표시를 확인하세요.</div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function Team({title, color, assignments, profiles}: {title: string; color: "blue" | "red"; assignments: TeamAssignment[]; profiles: PlayerProfile[]}) {
  const byId = new Map(profiles.map((profile) => [profile.discordUserId, profile]));
  return <div className={`rounded-2xl border p-4 ${color === "blue" ? "border-blue-400/20 bg-blue-400/[0.06]" : "border-rose-400/20 bg-rose-400/[0.06]"}`}><h3 className={`font-bold ${color === "blue" ? "text-blue-300" : "text-rose-300"}`}>{title}</h3><div className="mt-3 space-y-2">{assignments.map((player) => {const score = Math.round((byId.get(player.discordUserId)?.roleStats?.[player.role]?.balanceSignal ?? 0.35) * 100); return <div key={player.role} className="rounded-xl bg-black/20 p-3"><div className="flex items-center justify-between gap-3"><span className="text-xs text-slate-500">{ROLE_LABEL[player.role]}</span><span className="text-[11px] text-slate-500">포지션 {score}점 · {player.rank}</span></div><p className="mt-1 truncate text-sm font-semibold">{player.displayName}</p>{(player.offRole || player.lowConfidence) && <p className="mt-1 text-[10px] text-amber-300">{player.offRole ? "오프롤" : ""}{player.offRole && player.lowConfidence ? " · " : ""}{player.lowConfidence ? "낮은 신뢰도" : ""}</p>}</div>;})}</div></div>;
}

function overallScore(player: PlayerProfile) {
  const primary = player.roleStats?.[player.primaryRole]?.balanceSignal ?? 0.35;
  const secondary = player.roleStats?.[player.secondaryRole]?.balanceSignal ?? primary;
  return Math.round((primary * 0.7 + secondary * 0.3) * 100);
}
