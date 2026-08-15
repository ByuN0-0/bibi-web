"use client";

import {useEffect, useMemo, useRef, useState} from "react";
import RankTierIcon from "@/app/lol-statics/components/RankTierIcon";
import TeamBalancingGuide from "@/app/lol-statics/components/TeamBalancingGuide";
import {copyText} from "@/lib/clipboard";
import {
  formatBalanceGap,
  formatLaneAdvantage,
  LOW_CONFIDENCE_DESCRIPTION,
  OFF_ROLE_DESCRIPTION,
  teamAssignmentWarning,
} from "@/lib/lol/team-balance-guide";
import type {PlayerParticipationMap} from "@/lib/lol/player-participation";
import {
  RECENT_ROSTER_STORAGE_KEY,
  resolveRecentRoster,
  toggleRosterPlayer,
} from "@/lib/lol/recent-roster";
import {formatTeamCompositionText} from "@/lib/lol/team-display";
import {ROLE_LABEL, ROLES, type PlayerProfile, type Role, type TeamAssignment, type TeamConstraints, type TeamDraft} from "@/lib/lol/types";
import {emptyTeamConstraints} from "@/lib/lol/team-constraints";

type TeamBuilderProps = {
  players: PlayerProfile[];
  playerParticipation?: PlayerParticipationMap;
  publicMode?: boolean;
};

export default function TeamBuilder({
  players,
  playerParticipation = {},
  publicMode = false,
}: TeamBuilderProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [recentRoster, setRecentRoster] = useState<string[] | null>(null);
  const [rosterNotice, setRosterNotice] = useState("");
  const [draft, setDraft] = useState<TeamDraft | null>(null);
  const [constraints, setConstraints] = useState<TeamConstraints>(() => emptyTeamConstraints());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [mobileListCollapsed, setMobileListCollapsed] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const resultRef = useRef<HTMLDivElement>(null);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const playersById = useMemo(
    () => new Map(players.map((player) => [player.discordUserId, player])),
    [players],
  );
  const selectedPlayers = useMemo(
    () => selected.map((id) => playersById.get(id)).filter((player): player is PlayerProfile => Boolean(player)),
    [playersById, selected],
  );
  const assignmentWarning = draft?.composition
    ? teamAssignmentWarning([...draft.composition.blue, ...draft.composition.red])
    : null;
  const laneAdvantageLabel = formatLaneAdvantage(draft?.composition?.laneAdvantage);

  useEffect(() => {
    if (!publicMode) return;
    const stored = window.localStorage.getItem(RECENT_ROSTER_STORAGE_KEY);
    if (!stored) return;
    try {
      const resolved = resolveRecentRoster(JSON.parse(stored), players);
      if (resolved.status === "valid") setRecentRoster(resolved.playerIds);
      else if (resolved.status === "invalid") {
        setRosterNotice("최근 편성 명단에 현재 선택할 수 없는 선수가 있어 불러올 수 없습니다.");
      }
    } catch {
      setRosterNotice("저장된 최근 편성 명단을 확인할 수 없습니다.");
    }
  }, [players, publicMode]);

  function updateSelection(discordUserId: string) {
    const player = playersById.get(discordUserId);
    if (!player || player.syncStatus !== "READY") return;
    const next = toggleRosterPlayer(selected, discordUserId);
    if (next === selected) return;
    setSelected(next);
    setDraft(null);
    setConstraints(emptyTeamConstraints());
    setGuideOpen(false);
    setError("");
    setRosterNotice("");
  }

  function clearSelection() {
    setSelected([]);
    setDraft(null);
    setConstraints(emptyTeamConstraints());
    setGuideOpen(false);
    setError("");
    setRosterNotice("");
    setMobileListCollapsed(false);
  }

  function restoreRoster() {
    if (!recentRoster) return;
    setSelected([...recentRoster]);
    setDraft(null);
    setConstraints(emptyTeamConstraints());
    setGuideOpen(false);
    setError("");
    setRosterNotice("최근 편성 10명을 불러왔습니다.");
    setMobileListCollapsed(false);
  }

  function storeRecentRoster() {
    if (!publicMode || selected.length !== 10) return;
    try {
      window.localStorage.setItem(RECENT_ROSTER_STORAGE_KEY, JSON.stringify(selected));
      setRecentRoster([...selected]);
      setRosterNotice("");
    } catch {
      // Team generation should still succeed when browser storage is unavailable.
    }
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
          constraints,
        } : {
          action,
          selectedDiscordUserIds: selected,
          draftId: draft?.draftId,
          constraints,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "팀을 편성하지 못했습니다.");
        return;
      }
      if (publicMode) {
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
          constraints,
          composition: result.composition,
          status: "DRAFT",
          expiresAt: now,
          updatedAt: now,
        });
        storeRecentRoster();
      } else {
        setDraft(result.draft);
      }
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
    <section className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="surface-card p-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">참가 선수</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">자주 참가한 선수부터 표시 · 정확히 10명</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-bold ${selected.length === 10 ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--surface-soft)] text-[var(--muted)]"}`} aria-live="polite">
            {selected.length} / 10
          </span>
        </div>

        {publicMode ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" disabled={pending || !recentRoster} onClick={restoreRoster} className="secondary-button min-h-10 px-3 text-xs">
              {recentRoster ? "최근 편성 10명 불러오기" : "최근 편성 없음"}
            </button>
            <button type="button" disabled={pending || selected.length === 0} onClick={clearSelection} className="secondary-button min-h-10 px-3 text-xs">선택 초기화</button>
            {pending && <span className="text-xs text-[var(--muted)]" aria-live="polite">계산 중…</span>}
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button disabled={pending || selected.length !== 10 || draft?.status === "CONFIRMED"} onClick={() => act("generate")} className="primary-button min-h-10 px-4">팀 생성</button>
            <button disabled={pending || !draft || draft.status === "CONFIRMED"} onClick={() => act("reroll")} className="secondary-button min-h-10 px-4">다시 편성</button>
            <button disabled={pending || !draft || draft.status === "CONFIRMED"} onClick={() => act("confirm")} className="secondary-button min-h-10 border-[#8bc9ad] px-4 text-[var(--success)]">확정</button>
            {pending && <span className="text-xs text-[var(--muted)]" aria-live="polite">계산 중…</span>}
          </div>
        )}

        {rosterNotice && <p className={`mt-3 rounded-lg px-3 py-2 text-xs ${recentRoster ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--warning-soft)] text-[var(--warning)]"}`} role="status">{rosterNotice}</p>}
        {error && <p role="alert" className="mt-3 rounded-lg border border-[#f2b8aa] bg-[var(--error-soft)] px-3 py-2 text-sm text-[var(--error)]">{error}</p>}

        {selectedPlayers.length === 10 && <div className={mobileListCollapsed && draft?.composition ? "max-sm:hidden" : ""}><ConstraintPanel players={selectedPlayers} value={constraints} disabled={pending || draft?.status === "CONFIRMED"} onChange={(next) => {setConstraints(next); setDraft(null); setGuideOpen(false); setError(""); setMobileListCollapsed(false);}} /></div>}

        {publicMode && selectedPlayers.length > 0 && !mobileListCollapsed && (
          <div className="-mx-1 mt-3 overflow-x-auto px-1 pb-1 sm:hidden" aria-label="선택된 참가자">
            <div className="flex w-max gap-1.5">
              {selectedPlayers.map((player) => (
                <button key={player.discordUserId} type="button" onClick={() => updateSelection(player.discordUserId)} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[var(--primary-soft)] px-3 text-xs font-semibold text-[var(--primary)]" aria-label={`${player.displayName} 선택 해제`}>
                  {player.displayName}<span aria-hidden="true">×</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {mobileListCollapsed && draft?.composition && <div className="mt-3 flex items-center justify-between rounded-lg bg-[var(--surface-soft)] p-2.5 sm:hidden"><p className="text-sm font-semibold">10명 선택 완료</p><button type="button" onClick={() => setMobileListCollapsed(false)} className="text-xs font-bold text-[var(--primary)]">선수 변경</button></div>}
        <div className={`mt-3 gap-1.5 sm:grid sm:grid-cols-2 ${mobileListCollapsed && draft?.composition ? "hidden" : "grid"}`}>
          {players.map((player) => {
            const active = selectedSet.has(player.discordUserId);
            const ready = player.syncStatus === "READY";
            const matchCount = playerParticipation[player.discordUserId]?.matchCount ?? 0;
            return (
              <button
                key={player.discordUserId}
                type="button"
                disabled={!ready}
                aria-pressed={active}
                aria-label={`${player.displayName}, ${player.riotGameName}#${player.riotTagLine}, ${publicMode ? matchCount ? `내전 ${matchCount}판, ` : "첫 참가, " : ""}${ready ? active ? "선택됨" : "선택 가능" : syncStatusLabel(player.syncStatus)}`}
                title={ready ? undefined : syncStatusLabel(player.syncStatus)}
                onClick={() => updateSelection(player.discordUserId)}
                className={`min-h-[68px] rounded-lg border px-3 py-2.5 text-left ${active ? "border-[var(--primary)] bg-[var(--primary-soft)] shadow-[inset_0_0_0_1px_var(--primary)]" : "border-[var(--hairline-soft)] bg-white hover:border-[var(--hairline)] hover:shadow-sm"} disabled:cursor-not-allowed disabled:bg-[var(--surface-soft)] disabled:opacity-55`}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{player.displayName}</span>
                    <span className="mt-1 flex min-w-0 items-center justify-between gap-2 text-xs text-[var(--muted)]">
                      <span className="truncate">{player.riotGameName}#{player.riotTagLine}</span>
                      {publicMode && <span className="shrink-0 font-semibold">{matchCount ? `내전 ${matchCount}판` : "첫 참가"}</span>}
                    </span>
                  </span>
                  {active && <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-white" aria-hidden="true">✓</span>}
                </span>
              </button>
            );
          })}
          {!players.length && <p className="col-span-full rounded-xl border border-dashed border-[var(--hairline)] bg-[var(--surface-soft)] p-8 text-center text-sm text-[var(--muted)]">등록된 선수가 없습니다.</p>}
        </div>
      </div>

      <div ref={resultRef} className={`surface-card scroll-mt-24 p-4 ${!draft?.composition ? "max-sm:hidden" : ""}`}>
        {!draft?.composition ? (
          publicMode ? (
            <SelectionRoster
              players={selectedPlayers}
              pending={pending}
              onRemove={updateSelection}
              onGenerate={() => void act("generate")}
            />
          ) : (
            <div className="grid min-h-[220px] place-items-center text-center">
              <div>
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[var(--primary-soft)] text-xl text-[var(--primary)]" aria-hidden="true">⚔</span>
                <p className="mt-3 font-semibold">편성 결과가 여기에 표시됩니다.</p>
                <p className="mt-1 text-xs text-[var(--muted)]">선수 10명을 선택해 주세요.</p>
              </div>
            </div>
          )
        ) : (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2"><p className="text-xs text-[var(--muted)]">균형 등급</p><p className="text-2xl font-bold text-[var(--success)]">{draft.composition.balanceGrade}</p>{draft.status === "CONFIRMED" && <span className="rounded-full bg-[var(--success-soft)] px-2 py-1 text-[10px] font-bold text-[var(--success)]">확정됨</span>}<button type="button" aria-expanded={guideOpen} aria-controls="team-balancing-guide" onClick={() => setGuideOpen((open) => !open)} className="min-h-9 rounded-lg border border-[var(--hairline)] bg-white px-3 text-xs font-bold text-[var(--primary)] hover:bg-[var(--primary-soft)]">{guideOpen ? "편성 기준 닫기" : "편성 기준 보기"}</button></div>
              <div className="flex flex-wrap gap-2">
                {publicMode && <button type="button" disabled={pending} onClick={() => void act("reroll")} className="min-h-10 rounded-lg border border-[var(--hairline)] bg-white px-3 text-xs font-bold hover:bg-[var(--surface-soft)]">{pending ? "계산 중…" : "다시 편성"}</button>}
                <button type="button" onClick={() => void copyComposition()} className="min-h-10 rounded-lg border border-[var(--hairline)] bg-white px-3 text-xs font-bold hover:bg-[var(--surface-soft)]">{copyStatus === "copied" ? "복사 완료 ✓" : "텍스트 복사"}</button>
              </div>
            </div>
            {copyStatus === "failed" && <p role="alert" className="mt-2 rounded-lg bg-[var(--error-soft)] px-3 py-2 text-xs text-[var(--error)]">복사하지 못했습니다. 브라우저 권한을 확인하고 다시 시도해 주세요.</p>}
            <div className="mt-3 rounded-xl border border-[var(--hairline-soft)] bg-white p-3">
              <div className="flex flex-wrap gap-2">
                <BalanceMetric label="전체 팀 차이" value={formatBalanceGap(draft.composition.teamGap)} />
                <BalanceMetric label="최대 라인 차이" value={formatBalanceGap(draft.composition.maxLaneGap)} />
                {laneAdvantageLabel && <BalanceMetric label="라인 우세 분배" value={laneAdvantageLabel} />}
              </div>
              <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">승률이 아니라 팀 편성에 사용하는 내부 0~100 실력 점수의 차이예요. 낮을수록 두 팀이 비슷해요.</p>
            </div>
            {guideOpen && <TeamBalancingGuide id="team-balancing-guide" />}
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Team title="블루 팀" color="blue" assignments={draft.composition.blue} />
              <Team title="레드 팀" color="red" assignments={draft.composition.red} />
            </div>
            {assignmentWarning && (
              <div className="mt-4 rounded-xl border border-[#f2d28b] bg-[var(--warning-soft)] px-4 py-3 text-xs leading-5 text-[var(--warning)]">{assignmentWarning} 선수별 표시와 ‘편성 기준 보기’에서 기준을 확인할 수 있어요.</div>
            )}
          </div>
        )}
      </div>

      {publicMode && <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--hairline)] bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur sm:hidden"><div className="mx-auto flex max-w-md items-center gap-3"><div className="min-w-20"><p className="text-[10px] text-[var(--muted)]">선택 선수</p><p className="text-sm font-bold">{selected.length} / 10명</p></div><button disabled={pending || selected.length !== 10} onClick={() => void act(draft ? "reroll" : "generate")} className="primary-button flex-1">{pending ? "계산 중…" : draft ? "다시 편성" : selected.length === 10 ? "팀 생성" : `${10 - selected.length}명 더 선택`}</button></div></div>}
    </section>
  );
}

function SelectionRoster({
  players,
  pending,
  onRemove,
  onGenerate,
}: {
  players: PlayerProfile[];
  pending: boolean;
  onRemove: (discordUserId: string) => void;
  onGenerate: () => void;
}) {
  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">선택 명단</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">이름을 누르면 명단에서 제외됩니다.</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${players.length === 10 ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--surface-soft)] text-[var(--muted)]"}`} aria-live="polite">{players.length} / 10</span>
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2" aria-label="선택한 참가자 10명">
        {Array.from({length: 10}, (_, index) => {
          const player = players[index];
          return player ? (
            <li key={player.discordUserId}>
              <button type="button" onClick={() => onRemove(player.discordUserId)} className="flex min-h-12 w-full items-center gap-3 rounded-lg border border-[var(--primary)] bg-[var(--primary-soft)] px-3 text-left hover:bg-white" aria-label={`${index + 1}번 ${player.displayName} 선택 해제`}>
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-[11px] font-bold text-white">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{player.displayName}</span>
                <span className="text-[var(--primary)]" aria-hidden="true">×</span>
              </button>
            </li>
          ) : (
            <li key={`empty-${index}`} className="flex min-h-12 items-center gap-3 rounded-lg border border-dashed border-[var(--hairline)] bg-[var(--surface-soft)] px-3 text-[var(--muted-soft)]">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[var(--hairline)] bg-white text-[11px] font-bold">{index + 1}</span>
              <span className="text-xs">선수를 선택해 주세요</span>
            </li>
          );
        })}
      </ol>
      <button type="button" disabled={pending || players.length !== 10} onClick={onGenerate} className="primary-button mt-4 w-full">
        {pending ? "균형 계산 중…" : players.length === 10 ? "이 10명으로 팀 생성" : `${10 - players.length}명 더 선택해 주세요`}
      </button>
    </div>
  );
}

function ConstraintPanel({players, value, disabled, onChange}: {players: PlayerProfile[]; value: TeamConstraints; disabled: boolean; onChange: (value: TeamConstraints) => void}) {
  const [first, setFirst] = useState(players[0]?.discordUserId ?? "");
  const [second, setSecond] = useState(players[1]?.discordUserId ?? "");
  const lockedRole = (id: string) => value.roleLocks.find((lock) => lock.discordUserId === id)?.role ?? "";
  const changeLock = (discordUserId: string, role: "" | Role) => onChange({
    ...value,
    roleLocks: role
      ? [...value.roleLocks.filter((lock) => lock.discordUserId !== discordUserId), {discordUserId, role}]
      : value.roleLocks.filter((lock) => lock.discordUserId !== discordUserId),
  });
  const addPair = () => {
    if (!first || !second || first === second) return;
    const exists = value.sameTeamPairs.some((pair) =>
      (pair.firstDiscordUserId === first && pair.secondDiscordUserId === second)
      || (pair.firstDiscordUserId === second && pair.secondDiscordUserId === first));
    if (exists) return;
    onChange({...value, sameTeamPairs: [...value.sameTeamPairs, {firstDiscordUserId: first, secondDiscordUserId: second}]});
  };
  const name = (id: string) => players.find((player) => player.discordUserId === id)?.displayName ?? id;
  return <details className="mt-3 rounded-xl border border-[var(--hairline-soft)] bg-[var(--surface-soft)] p-3"><summary className="cursor-pointer text-sm font-bold">편성 조건 <span className="ml-1 text-xs font-medium text-[var(--muted)]">라인 고정 {value.roleLocks.length} · 같은 팀 {value.sameTeamPairs.length}</span></summary><div className="mt-4"><h3 className="text-xs font-bold">선수 라인 고정</h3><div className="mt-2 grid gap-2 sm:grid-cols-2">{players.map((player) => <label key={player.discordUserId} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-xs"><span className="truncate font-semibold">{player.displayName}</span><select disabled={disabled} value={lockedRole(player.discordUserId)} onChange={(event) => changeLock(player.discordUserId, event.target.value as "" | Role)} className="min-h-9 rounded-lg border border-[var(--hairline)] bg-white px-2"><option value="">자동</option>{ROLES.map((role) => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}</select></label>)}</div><h3 className="mt-4 text-xs font-bold">같은 팀 고정</h3><div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2"><select disabled={disabled} value={first} onChange={(event) => setFirst(event.target.value)} className="min-w-0 rounded-lg border border-[var(--hairline)] bg-white px-2 text-xs">{players.map((player) => <option key={player.discordUserId} value={player.discordUserId}>{player.displayName}</option>)}</select><select disabled={disabled} value={second} onChange={(event) => setSecond(event.target.value)} className="min-w-0 rounded-lg border border-[var(--hairline)] bg-white px-2 text-xs">{players.map((player) => <option key={player.discordUserId} value={player.discordUserId}>{player.displayName}</option>)}</select><button type="button" disabled={disabled || first === second} onClick={addPair} className="secondary-button min-h-10 px-3 text-xs">추가</button></div><div className="mt-2 flex flex-wrap gap-2">{value.sameTeamPairs.map((pair, index) => <span key={`${pair.firstDiscordUserId}-${pair.secondDiscordUserId}`} className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold">{name(pair.firstDiscordUserId)} + {name(pair.secondDiscordUserId)}<button type="button" disabled={disabled} onClick={() => onChange({...value, sameTeamPairs: value.sameTeamPairs.filter((_, pairIndex) => pairIndex !== index)})} aria-label={`${name(pair.firstDiscordUserId)}와 ${name(pair.secondDiscordUserId)} 같은 팀 고정 삭제`} className="text-[var(--error)]">×</button></span>)}</div></div></details>;
}

function Team({title, color, assignments}: {title: string; color: "blue" | "red"; assignments: TeamAssignment[]}) {
  const theme = color === "blue"
    ? "border-[#cfe2ff] bg-[#f5f9ff] text-[#2463a5]"
    : "border-[#ffd5dc] bg-[#fff7f8] text-[#b62e49]";
  return (
    <div className={`rounded-xl border p-3 ${theme}`}>
      <h3 className="text-sm font-bold">{title}</h3>
      <div className="mt-2 space-y-1.5">
        {assignments.map((player) => (
          <div key={player.role} className="flex h-16 items-center gap-2.5 rounded-lg border border-black/[0.05] bg-white px-2.5 py-2 text-[var(--ink)]">
            <RankTierIcon rank={player.rank} size={36} />
            <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="text-[11px] font-bold text-[var(--muted)]">{ROLE_LABEL[player.role]}</span><span className="truncate text-[10px] text-[var(--muted)]">{player.rankQueue === "SOLO" ? "솔랭" : player.rankQueue === "FLEX" ? "자랭" : "랭크"} · {player.rank}</span></div><div className="mt-0.5 flex min-w-0 items-center gap-1"><p className="min-w-0 flex-1 truncate text-sm font-semibold">{player.displayName}</p>{player.offRole && <span title={OFF_ROLE_DESCRIPTION} className="shrink-0 rounded bg-[var(--warning-soft)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--warning)]">0% 선호</span>}{player.lowConfidence && <span title={LOW_CONFIDENCE_DESCRIPTION} className="shrink-0 rounded bg-[var(--warning-soft)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--warning)]">낮은 신뢰도</span>}</div></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BalanceMetric({label, value}: {label: string; value: string}) {
  return <div className="flex min-w-[140px] flex-1 items-center justify-between gap-3 rounded-lg bg-[var(--surface-soft)] px-3 py-2"><span className="text-xs text-[var(--muted)]">{label}</span><strong className="text-sm">{value}</strong></div>;
}

function syncStatusLabel(status: PlayerProfile["syncStatus"]) {
  return {REQUESTED: "갱신 대기", SYNCING: "갱신 중", READY: "갱신 완료", FAILED: "갱신 실패"}[status];
}
