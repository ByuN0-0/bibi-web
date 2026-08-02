"use client";

import {useMemo, useRef, useState} from "react";
import {rankTierDisplay, ROLE_LABEL, type PlayerProfile, type TeamAssignment, type TeamDraft} from "@/lib/lol/types";

export default function TeamBuilder({players, publicMode = false}: {players: PlayerProfile[]; publicMode?: boolean}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState<TeamDraft | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [mobileListCollapsed, setMobileListCollapsed] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
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
    try {
      const response = await fetch(publicMode ? "/api/lol-member/team" : "/api/lol-statics/team", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(publicMode ? {
          selectedDiscordUserIds: selected,
          excludedSignatures: action === "reroll" ? draft?.excludedSignatures ?? [] : [],
        } : {
          action,
          selectedDiscordUserIds: selected,
          draftId: draft?.draftId,
        }),
      });
      const result = await response.json();
      if (!response.ok) setError(result.error ?? "팀을 편성하지 못했습니다.");
      else if (publicMode) {
        const now = Date.now();
        setDraft({
          schemaVersion: 1,
          draftId: "public",
          hostDiscordUserId: "public-web",
          selectedDiscordUserIds: selected,
          excludedSignatures: [
            ...(action === "reroll" ? draft?.excludedSignatures ?? [] : []),
            result.composition.signature,
          ],
          composition: result.composition,
          status: "DRAFT",
          expiresAt: now,
          updatedAt: now,
        });
      } else setDraft(result.draft);
      if (action !== "confirm") {
        setMobileListCollapsed(true);
        window.requestAnimationFrame(() => resultRef.current?.scrollIntoView({behavior: "smooth", block: "start"}));
      }
    } catch {
      setError("팀 편성 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="surface-card p-5 sm:p-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">참가 선수</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">동기화 완료 선수 중 정확히 10명</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-bold ${selected.length === 10 ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--surface-soft)] text-[var(--muted)]"}`} aria-live="polite">
            {selected.length} / 10
          </span>
        </div>
        {mobileListCollapsed && draft?.composition && <div className="mt-5 flex items-center justify-between rounded-xl bg-[var(--surface-soft)] p-3 sm:hidden"><p className="text-sm font-semibold">10명 선택 완료</p><button type="button" onClick={() => setMobileListCollapsed(false)} className="text-xs font-bold text-[var(--primary)]">선수 변경</button></div>}
        <div className={`mt-5 gap-2 sm:grid sm:grid-cols-2 ${mobileListCollapsed && draft?.composition ? "hidden" : "grid"}`}>
          {players.map((player) => {
            const active = selectedSet.has(player.discordUserId);
            const ready = player.syncStatus === "READY";
            return (
              <button
                key={player.discordUserId}
                type="button"
                disabled={!ready}
                aria-pressed={active}
                onClick={() => toggle(player)}
                className={`min-h-[96px] rounded-xl border p-3 text-left ${active ? "border-[var(--primary)] bg-[var(--primary-soft)] shadow-[inset_0_0_0_1px_var(--primary)]" : "border-[var(--hairline-soft)] bg-white hover:border-[var(--hairline)] hover:shadow-sm"} disabled:cursor-not-allowed disabled:bg-[var(--surface-soft)] disabled:opacity-55`}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{player.displayName}</span>
                    <span className="mt-1 block truncate text-xs text-[var(--muted)]">{player.riotGameName}#{player.riotTagLine}</span>
                  </span>
                  {active && <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-white" aria-hidden="true">✓</span>}
                </span>
                <span className="mt-2 block text-[11px] text-[var(--muted)]">{ROLE_LABEL[player.primaryRole]} · {ready ? publicMode ? bestRankLabel(player) : `종합 ${overallScore(player)}점` : syncStatusLabel(player.syncStatus)}</span>
              </button>
            );
          })}
          {!players.length && <p className="col-span-full rounded-xl border border-dashed border-[var(--hairline)] bg-[var(--surface-soft)] p-8 text-center text-sm text-[var(--muted)]">등록된 선수가 없습니다.</p>}
        </div>
        <div className={`mt-5 flex flex-wrap gap-2 ${publicMode ? "max-sm:hidden" : ""}`}>
          <button disabled={pending || selected.length !== 10 || draft?.status === "CONFIRMED"} onClick={() => act("generate")} className="primary-button">팀 생성</button>
          <button disabled={pending || !draft || draft.status === "CONFIRMED"} onClick={() => act("reroll")} className="secondary-button">다시 편성</button>
          {!publicMode && <button disabled={pending || !draft || draft.status === "CONFIRMED"} onClick={() => act("confirm")} className="secondary-button border-[#8bc9ad] text-[var(--success)]">확정</button>}
          {pending && <span className="self-center text-xs text-[var(--muted)]" aria-live="polite">계산 중…</span>}
        </div>
        {error && <p role="alert" className="mt-4 rounded-xl border border-[#f2b8aa] bg-[var(--error-soft)] px-4 py-3 text-sm text-[var(--error)]">{error}</p>}
      </div>

      <div ref={resultRef} className="surface-card scroll-mt-24 p-5 sm:p-6">
        {!draft?.composition ? (
          <div className="grid min-h-96 place-items-center text-center">
            <div>
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[var(--primary-soft)] text-2xl text-[var(--primary)]" aria-hidden="true">⚔</span>
              <p className="mt-5 font-semibold">팀 편성 결과가 여기에 표시됩니다.</p>
              <p className="mt-2 text-sm text-[var(--muted)]">선수 10명을 선택하고 팀 생성을 눌러 주세요.</p>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-xs text-[var(--muted)]">균형 등급</p><p className="mt-1 text-3xl font-bold text-[var(--success)]">{draft.composition.balanceGrade}</p></div>
              {draft.status === "CONFIRMED" && <span className="rounded-full bg-[var(--success-soft)] px-3 py-1 text-xs font-bold text-[var(--success)]">확정됨</span>}
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Team title="블루 팀" color="blue" assignments={draft.composition.blue} profiles={players} publicMode={publicMode} />
              <Team title="레드 팀" color="red" assignments={draft.composition.red} profiles={players} publicMode={publicMode} />
            </div>
            {([...draft.composition.blue, ...draft.composition.red].some((player) => player.offRole || player.lowConfidence)) && (
              <div className="mt-4 rounded-xl border border-[#f2d28b] bg-[var(--warning-soft)] px-4 py-3 text-xs leading-5 text-[var(--warning)]">오프롤 또는 표본이 적은 포지션이 포함되어 있습니다. 선수별 표시를 확인하세요.</div>
            )}
          </div>
        )}
      </div>
      {publicMode && <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--hairline)] bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur sm:hidden"><div className="mx-auto flex max-w-md items-center gap-3"><div className="min-w-20"><p className="text-[10px] text-[var(--muted)]">선택 선수</p><p className="text-sm font-bold">{selected.length} / 10명</p></div><button disabled={pending || selected.length !== 10} onClick={() => act(draft ? "reroll" : "generate")} className="primary-button flex-1">{pending ? "계산 중…" : draft ? "다시 편성" : selected.length === 10 ? "팀 생성" : `${10 - selected.length}명 더 선택`}</button></div></div>}
    </section>
  );
}

function Team({title, color, assignments, profiles, publicMode}: {title: string; color: "blue" | "red"; assignments: TeamAssignment[]; profiles: PlayerProfile[]; publicMode: boolean}) {
  const byId = new Map(profiles.map((profile) => [profile.discordUserId, profile]));
  const theme = color === "blue"
    ? "border-[#cfe2ff] bg-[#f5f9ff] text-[#2463a5]"
    : "border-[#ffd5dc] bg-[#fff7f8] text-[#b62e49]";
  return (
    <div className={`rounded-2xl border p-4 ${theme}`}>
      <h3 className="font-bold">{title}</h3>
      <div className="mt-3 space-y-2">
        {assignments.map((player) => {
          const score = Math.round((byId.get(player.discordUserId)?.roleStats?.[player.role]?.balanceSignal ?? 0.35) * 100);
          return (
            <div key={player.role} className="rounded-xl border border-black/[0.05] bg-white p-3 text-[var(--ink)]">
              <div className="flex items-center justify-between gap-3"><span className="text-xs text-[var(--muted)]">{ROLE_LABEL[player.role]}</span><span className="text-[11px] text-[var(--muted)]">{publicMode ? `${player.rankQueue === "SOLO" ? "솔랭" : player.rankQueue === "FLEX" ? "자랭" : "랭크"} · ${player.rank}` : `포지션 ${score}점 · ${player.rank}`}</span></div>
              <p className="mt-1 truncate text-sm font-semibold">{player.displayName}</p>
              {(player.offRole || player.lowConfidence) && <p className="mt-1 text-[10px] text-[var(--warning)]">{player.offRole ? "오프롤" : ""}{player.offRole && player.lowConfidence ? " · " : ""}{player.lowConfidence ? "낮은 신뢰도" : ""}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function bestRankLabel(player: PlayerProfile) {
  const tiers = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"];
  const divisions = ["IV", "III", "II", "I"];
  const score = (rank: PlayerProfile["soloRank"]) => tiers.indexOf(rank?.tier ?? "") * 4 + Math.max(0, divisions.indexOf(rank?.division ?? ""));
  const solo = score(player.soloRank);
  const flex = score(player.flexRank);
  if (solo < 0 && flex < 0) return "랭크 · 배치 전";
  return solo >= flex ? `솔랭 · ${rankTierDisplay(player.soloRank)}` : `자랭 · ${rankTierDisplay(player.flexRank)}`;
}

function overallScore(player: PlayerProfile) {
  const primary = player.roleStats?.[player.primaryRole]?.balanceSignal ?? 0.35;
  const secondary = player.roleStats?.[player.secondaryRole]?.balanceSignal ?? primary;
  return Math.round((primary * 0.7 + secondary * 0.3) * 100);
}

function syncStatusLabel(status: PlayerProfile["syncStatus"]) {
  return {REQUESTED: "갱신 대기", SYNCING: "갱신 중", READY: "갱신 완료", FAILED: "갱신 실패"}[status];
}
