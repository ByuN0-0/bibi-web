"use client";

import {useMemo, useRef, useState} from "react";
import RankTierIcon from "@/app/lol-statics/components/RankTierIcon";
import {copyText} from "@/lib/clipboard";
import {formatTeamCompositionText} from "@/lib/lol/team-display";
import {ROLE_LABEL, type PlayerProfile, type TeamAssignment, type TeamDraft} from "@/lib/lol/types";

export default function TeamBuilder({players, publicMode = false}: {players: PlayerProfile[]; publicMode?: boolean}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState<TeamDraft | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [mobileListCollapsed, setMobileListCollapsed] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
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

  async function copyComposition() {
    if (!draft?.composition) return;
    setCopyStatus("idle");
    const copied = await copyText(formatTeamCompositionText(draft.composition));
    setCopyStatus(copied ? "copied" : "failed");
    if (copied) window.setTimeout(() => setCopyStatus("idle"), 2_000);
  }

  return (
    <section className="grid gap-3 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="surface-card p-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">참가 선수</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">동기화 완료 선수 중 정확히 10명</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-bold ${selected.length === 10 ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--surface-soft)] text-[var(--muted)]"}`} aria-live="polite">
            {selected.length} / 10
          </span>
        </div>
        <div className={`mt-3 flex flex-wrap items-center gap-2 ${publicMode ? "max-sm:hidden" : ""}`}>
          <button disabled={pending || selected.length !== 10 || draft?.status === "CONFIRMED"} onClick={() => act("generate")} className="primary-button min-h-10 px-4">팀 생성</button>
          <button disabled={pending || !draft || draft.status === "CONFIRMED"} onClick={() => act("reroll")} className="secondary-button min-h-10 px-4">다시 편성</button>
          {!publicMode && <button disabled={pending || !draft || draft.status === "CONFIRMED"} onClick={() => act("confirm")} className="secondary-button min-h-10 border-[#8bc9ad] px-4 text-[var(--success)]">확정</button>}
          {pending && <span className="self-center text-xs text-[var(--muted)]" aria-live="polite">계산 중…</span>}
        </div>
        {error && <p role="alert" className="mt-3 rounded-lg border border-[#f2b8aa] bg-[var(--error-soft)] px-3 py-2 text-sm text-[var(--error)]">{error}</p>}
        {mobileListCollapsed && draft?.composition && <div className="mt-3 flex items-center justify-between rounded-lg bg-[var(--surface-soft)] p-2.5 sm:hidden"><p className="text-sm font-semibold">10명 선택 완료</p><button type="button" onClick={() => setMobileListCollapsed(false)} className="text-xs font-bold text-[var(--primary)]">선수 변경</button></div>}
        <div className={`mt-3 gap-1.5 sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2 ${mobileListCollapsed && draft?.composition ? "hidden" : "grid"}`}>
          {players.map((player) => {
            const active = selectedSet.has(player.discordUserId);
            const ready = player.syncStatus === "READY";
            return (
              <button
                key={player.discordUserId}
                type="button"
                disabled={!ready}
                aria-pressed={active}
                aria-label={`${player.displayName}, ${player.riotGameName}#${player.riotTagLine}, ${ready ? active ? "선택됨" : "선택 가능" : syncStatusLabel(player.syncStatus)}`}
                title={ready ? undefined : syncStatusLabel(player.syncStatus)}
                onClick={() => toggle(player)}
                className={`min-h-[64px] rounded-lg border px-3 py-2.5 text-left ${active ? "border-[var(--primary)] bg-[var(--primary-soft)] shadow-[inset_0_0_0_1px_var(--primary)]" : "border-[var(--hairline-soft)] bg-white hover:border-[var(--hairline)] hover:shadow-sm"} disabled:cursor-not-allowed disabled:bg-[var(--surface-soft)] disabled:opacity-55`}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{player.displayName}</span>
                    <span className="mt-1 block truncate text-xs text-[var(--muted)]">{player.riotGameName}#{player.riotTagLine}</span>
                  </span>
                  {active && <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-white" aria-hidden="true">✓</span>}
                </span>
              </button>
            );
          })}
          {!players.length && <p className="col-span-full rounded-xl border border-dashed border-[var(--hairline)] bg-[var(--surface-soft)] p-8 text-center text-sm text-[var(--muted)]">등록된 선수가 없습니다.</p>}
        </div>
      </div>

      <div ref={resultRef} className="surface-card scroll-mt-24 p-4">
        {!draft?.composition ? (
          <div className="grid min-h-[220px] place-items-center text-center">
            <div>
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[var(--primary-soft)] text-xl text-[var(--primary)]" aria-hidden="true">⚔</span>
              <p className="mt-3 font-semibold">편성 결과가 여기에 표시됩니다.</p>
              <p className="mt-1 text-xs text-[var(--muted)]">선수 10명을 선택해 주세요.</p>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2"><p className="text-xs text-[var(--muted)]">균형 등급</p><p className="text-2xl font-bold text-[var(--success)]">{draft.composition.balanceGrade}</p>{draft.status === "CONFIRMED" && <span className="rounded-full bg-[var(--success-soft)] px-2 py-1 text-[10px] font-bold text-[var(--success)]">확정됨</span>}</div>
              <button type="button" onClick={() => void copyComposition()} className="min-h-10 rounded-lg border border-[var(--hairline)] bg-white px-3 text-xs font-bold hover:bg-[var(--surface-soft)]">{copyStatus === "copied" ? "복사 완료 ✓" : "텍스트 복사"}</button>
            </div>
            {copyStatus === "failed" && <p role="alert" className="mt-2 rounded-lg bg-[var(--error-soft)] px-3 py-2 text-xs text-[var(--error)]">복사하지 못했습니다. 브라우저 권한을 확인하고 다시 시도해 주세요.</p>}
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Team title="블루 팀" color="blue" assignments={draft.composition.blue} />
              <Team title="레드 팀" color="red" assignments={draft.composition.red} />
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

function Team({title, color, assignments}: {title: string; color: "blue" | "red"; assignments: TeamAssignment[]}) {
  const theme = color === "blue"
    ? "border-[#cfe2ff] bg-[#f5f9ff] text-[#2463a5]"
    : "border-[#ffd5dc] bg-[#fff7f8] text-[#b62e49]";
  return (
    <div className={`rounded-xl border p-3 ${theme}`}>
      <h3 className="text-sm font-bold">{title}</h3>
      <div className="mt-2 space-y-1.5">
        {assignments.map((player) => {
          return (
            <div key={player.role} className="flex h-16 items-center gap-2.5 rounded-lg border border-black/[0.05] bg-white px-2.5 py-2 text-[var(--ink)]">
              <RankTierIcon rank={player.rank} size={36} />
              <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="text-[11px] font-bold text-[var(--muted)]">{ROLE_LABEL[player.role]}</span><span className="truncate text-[10px] text-[var(--muted)]">{player.rankQueue === "SOLO" ? "솔랭" : player.rankQueue === "FLEX" ? "자랭" : "랭크"} · {player.rank}</span></div><div className="mt-0.5 flex min-w-0 items-center gap-1"><p className="min-w-0 flex-1 truncate text-sm font-semibold">{player.displayName}</p>{player.offRole && <span className="shrink-0 rounded bg-[var(--warning-soft)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--warning)]">오프롤</span>}{player.lowConfidence && <span className="shrink-0 rounded bg-[var(--warning-soft)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--warning)]">낮은 신뢰도</span>}</div></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function syncStatusLabel(status: PlayerProfile["syncStatus"]) {
  return {REQUESTED: "갱신 대기", SYNCING: "갱신 중", READY: "갱신 완료", FAILED: "갱신 실패"}[status];
}
