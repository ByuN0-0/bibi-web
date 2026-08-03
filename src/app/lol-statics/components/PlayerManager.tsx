"use client";

import {FormEvent, useCallback, useEffect, useMemo, useRef, useState} from "react";
import {rankDisplay, ROLE_LABEL, ROLES, type PlayerProfile, type RiotAccountProfile, type Role} from "@/lib/lol/types";

const empty = {discordUserId: "", displayName: "", riotGameName: "", riotTagLine: "", primaryRole: "TOP" as Role, secondaryRole: "JUNGLE" as Role};
const statusLabel: Record<PlayerProfile["syncStatus"], string> = {REQUESTED: "갱신 대기", SYNCING: "갱신 중", READY: "갱신 완료", FAILED: "갱신 실패"};
type EditorTab = "profile" | "accounts" | "stats";

export default function PlayerManager({initialPlayers}: {initialPlayers: PlayerProfile[]}) {
  const [players, setPlayers] = useState(initialPlayers);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | PlayerProfile["syncStatus"]>("ALL");
  const [form, setForm] = useState(empty);
  const [original, setOriginal] = useState(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorTab, setEditorTab] = useState<EditorTab>("profile");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [formError, setFormError] = useState("");
  const [accounts, setAccounts] = useState<RiotAccountProfile[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [alt, setAlt] = useState({riotGameName: "", riotTagLine: ""});
  const [deleteTarget, setDeleteTarget] = useState<PlayerProfile | null>(null);
  const editorRef = useRef<HTMLDialogElement>(null);
  const editingPlayer = players.find((player) => player.discordUserId === editingId) ?? null;
  const dirty = JSON.stringify(form) !== JSON.stringify(original);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    return players.filter((player) => (statusFilter === "ALL" || player.syncStatus === statusFilter)
      && (!normalized || `${player.displayName} ${player.riotGameName}#${player.riotTagLine}`.toLocaleLowerCase("ko-KR").includes(normalized)));
  }, [players, query, statusFilter]);

  const reload = useCallback(async () => {
    const response = await fetch("/api/lol-statics/players", {cache: "no-store"});
    if (response.ok) setPlayers((await response.json()).players);
  }, []);

  useEffect(() => {
    if (!players.some((player) => player.syncStatus === "REQUESTED" || player.syncStatus === "SYNCING")) return;
    const interval = window.setInterval(() => void reload(), 5_000);
    return () => window.clearInterval(interval);
  }, [players, reload]);

  function showEditor(player?: PlayerProfile) {
    const next = player ? toForm(player) : empty;
    setForm(next);
    setOriginal(next);
    setEditingId(player?.discordUserId ?? null);
    setEditorTab("profile");
    setFormError("");
    setAccounts([]);
    setAlt({riotGameName: "", riotTagLine: ""});
    window.requestAnimationFrame(() => editorRef.current?.showModal());
  }

  function closeEditor(force = false) {
    if (!force && dirty && !window.confirm("저장하지 않은 변경사항을 닫을까요?")) return;
    editorRef.current?.close();
  }

  async function selectEditorTab(tab: EditorTab) {
    setEditorTab(tab);
    if (tab === "accounts" && editingId && !accounts.length) await loadAccounts(editingId);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPendingAction("save");
    setFormError("");
    try {
      const response = await fetch("/api/lol-statics/players", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(form)});
      const result = await response.json() as {error?: string; needsSync?: boolean; player?: PlayerProfile};
      if (!response.ok) { setFormError(result.error ?? "선수 정보를 저장하지 못했습니다."); return; }
      await reload();
      closeEditor(true);
      setToast(editingId ? "선수 정보를 수정했습니다." : "선수를 등록했습니다.");
      if (result.needsSync && result.player) await sync(result.player.discordUserId, false);
    } catch {
      setFormError("선수 정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPendingAction(null);
    }
  }

  async function sync(discordUserId: string, announce = true) {
    setPendingAction(`sync-${discordUserId}`);
    setPlayers((current) => current.map((player) => player.discordUserId === discordUserId ? {...player, syncStatus: "SYNCING", lastSyncStartedAt: Date.now()} : player));
    try {
      const response = await fetch("/api/lol-statics/players/sync", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({discordUserId})});
      const result = await response.json() as {error?: string; retryAt?: number};
      setToast(response.ok ? "웹 서버에서 전적 갱신을 완료했습니다." : result.retryAt ? `${result.error} ${formatDateTime(result.retryAt)} 이후 다시 시도해 주세요.` : result.error ?? "전적 갱신을 완료하지 못했습니다.");
      await reload();
    } catch {
      if (announce) setToast("전적 갱신을 완료하지 못했습니다.");
      await reload();
    } finally {
      setPendingAction(null);
    }
  }

  async function remove() {
    if (!deleteTarget) return;
    setPendingAction(`delete-${deleteTarget.discordUserId}`);
    try {
      const response = await fetch(`/api/lol-statics/players/${deleteTarget.discordUserId}`, {method: "DELETE"});
      if (!response.ok) throw new Error();
      setToast(`${deleteTarget.displayName} 선수를 삭제했습니다.`);
      setDeleteTarget(null);
      await reload();
    } catch {
      setToast("선수를 삭제하지 못했습니다.");
    } finally {
      setPendingAction(null);
    }
  }

  async function loadAccounts(discordUserId: string) {
    setAccountsLoading(true);
    try {
      const response = await fetch(`/api/lol-statics/players/${discordUserId}/accounts`, {cache: "no-store"});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setAccounts(result.accounts);
      return result.accounts as RiotAccountProfile[];
    } catch {
      setToast("Riot 계정 목록을 불러오지 못했습니다.");
    } finally {
      setAccountsLoading(false);
    }
    return [];
  }

  async function addAlt() {
    if (!editingId) return;
    setPendingAction("account-add");
    try {
      const response = await fetch(`/api/lol-statics/players/${editingId}/accounts`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(alt)});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "부계정을 등록하지 못했습니다.");
      setAccounts(result.accounts);
      setAlt({riotGameName: "", riotTagLine: ""});
      setToast("부계정을 등록하고 전적 갱신을 요청했습니다.");
      await reload();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "부계정을 등록하지 못했습니다.");
    } finally {
      setPendingAction(null);
    }
  }

  async function accountAction(accountId: string, method: "PATCH" | "DELETE") {
    if (!editingId) return;
    setPendingAction(accountId);
    try {
      const response = await fetch(`/api/lol-statics/players/${editingId}/accounts/${accountId}`, {method});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "계정을 변경하지 못했습니다.");
      setToast(method === "PATCH" ? "대표 계정을 변경했습니다." : "계정을 삭제하고 재집계를 요청했습니다.");
      const [nextAccounts] = await Promise.all([loadAccounts(editingId), reload()]);
      const primary = nextAccounts.find((account) => account.isPrimary);
      if (primary) {
        setForm((current) => ({...current, riotGameName: primary.riotGameName, riotTagLine: primary.riotTagLine}));
        setOriginal((current) => ({...current, riotGameName: primary.riotGameName, riotTagLine: primary.riotTagLine}));
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : "계정을 변경하지 못했습니다.");
    } finally {
      setPendingAction(null);
    }
  }

  const identityChanged = !!editingPlayer && (editingPlayer.riotGameName !== form.riotGameName || editingPlayer.riotTagLine !== form.riotTagLine);

  return (
    <div>
      {toast && <div role="status" className="fixed right-4 top-4 z-[70] max-w-sm rounded-xl border border-[var(--hairline)] bg-white px-4 py-3 text-sm shadow-[var(--shadow-float)]"><div className="flex items-start gap-4"><p className="flex-1">{toast}</p><button type="button" onClick={() => setToast("")} aria-label="알림 닫기">×</button></div></div>}
      <section className="surface-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div><h2 className="font-bold">등록 선수 {players.length}명</h2><p className="mt-1 text-xs text-[var(--muted)]">선수를 선택하면 계정과 상세 전적을 관리할 수 있습니다.</p></div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름 또는 Riot ID 검색" aria-label="선수 검색" className="form-control m-0 sm:w-64" />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} aria-label="갱신 상태 필터" className="form-control m-0 sm:w-36"><option value="ALL">전체 상태</option>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <button type="button" onClick={() => showEditor()} className="primary-button whitespace-nowrap">선수 추가</button>
          </div>
        </div>
        <div className="mt-5 overflow-hidden rounded-xl border border-[var(--hairline-soft)]">
          {filtered.map((player) => <PlayerRow key={player.discordUserId} player={player} pending={pendingAction !== null} onEdit={() => showEditor(player)} onSync={() => void sync(player.discordUserId)} onDelete={() => setDeleteTarget(player)} />)}
          {!filtered.length && <p className="bg-white py-16 text-center text-sm text-[var(--muted)]">조건에 맞는 선수가 없습니다.</p>}
        </div>
      </section>

      <dialog ref={editorRef} onCancel={(event) => {event.preventDefault(); closeEditor();}} className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-xl border-0 bg-white p-0 shadow-2xl backdrop:bg-black/35">
        <form onSubmit={submit} className="flex h-full flex-col">
          <header className="flex items-center justify-between border-b border-[var(--hairline-soft)] px-5 py-4 sm:px-6"><div><p className="eyebrow text-[10px]">Player editor</p><h2 className="mt-1 text-xl font-bold">{editingPlayer ? `${editingPlayer.displayName} 수정` : "선수 추가"}</h2></div><button type="button" onClick={() => closeEditor()} className="grid h-11 w-11 place-items-center rounded-full border border-[var(--hairline)] text-xl" aria-label="편집 닫기">×</button></header>
          <div className="border-b border-[var(--hairline-soft)] px-5 pt-3 sm:px-6"><div className="flex gap-1" role="tablist" aria-label="선수 편집 메뉴"><EditorTab active={editorTab === "profile"} onClick={() => void selectEditorTab("profile")}>기본 정보</EditorTab>{editingPlayer && <><EditorTab active={editorTab === "accounts"} onClick={() => void selectEditorTab("accounts")}>Riot 계정</EditorTab><EditorTab active={editorTab === "stats"} onClick={() => void selectEditorTab("stats")}>전적 요약</EditorTab></>}</div></div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
            {editorTab === "profile" && <div className="space-y-4"><Field label="Discord 사용자 ID" value={form.discordUserId} disabled={!!editingPlayer} onChange={(value) => setForm({...form, discordUserId: value})} /><Field label="표시 이름" value={form.displayName} onChange={(value) => setForm({...form, displayName: value})} /><div className="grid grid-cols-[minmax(0,1fr)_92px] gap-2"><Field label="Riot 게임 이름" value={form.riotGameName} onChange={(value) => setForm({...form, riotGameName: value})} /><Field label="태그" value={form.riotTagLine} onChange={(value) => setForm({...form, riotTagLine: value})} /></div><div className="grid grid-cols-2 gap-2"><RoleSelect label="주 포지션" value={form.primaryRole} onChange={(value) => setForm({...form, primaryRole: value})} /><RoleSelect label="부 포지션" value={form.secondaryRole} onChange={(value) => setForm({...form, secondaryRole: value})} /></div>{identityChanged && <p className="rounded-xl border border-[#f2d28b] bg-[var(--warning-soft)] px-4 py-3 text-xs leading-5 text-[var(--warning)]">Riot ID를 변경하면 기존 랭크와 전적이 초기화되고 새 계정의 전적 갱신을 요청합니다.</p>}{formError && <p role="alert" className="rounded-xl border border-[#f2b8aa] bg-[var(--error-soft)] px-4 py-3 text-sm text-[var(--error)]">{formError}</p>}</div>}
            {editorTab === "accounts" && editingPlayer && <AccountPanel accounts={accounts} loading={accountsLoading} alt={alt} setAlt={setAlt} pending={pendingAction !== null} onAdd={() => void addAlt()} onAction={(id, method) => void accountAction(id, method)} />}
            {editorTab === "stats" && editingPlayer && <StatsPanel player={editingPlayer} />}
          </div>
          <footer className="flex items-center justify-between gap-3 border-t border-[var(--hairline-soft)] bg-white px-5 py-4 sm:px-6"><p className="text-xs text-[var(--muted)]">{dirty ? "저장하지 않은 변경사항이 있습니다." : "변경사항이 없습니다."}</p>{editorTab === "profile" && <div className="flex gap-2"><button type="button" onClick={() => closeEditor()} className="secondary-button">취소</button><button disabled={pendingAction !== null || !dirty} className="primary-button">{pendingAction === "save" ? "저장 중…" : "저장"}</button></div>}</footer>
        </form>
      </dialog>

      {deleteTarget && <div className="fixed inset-0 z-[80] grid place-items-center bg-black/35 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-title"><div className="surface-card w-full max-w-sm p-6 shadow-2xl"><h2 id="delete-title" className="text-lg font-bold">선수를 삭제할까요?</h2><p className="mt-3 text-sm leading-6 text-[var(--muted)]">{deleteTarget.displayName} 선수와 연결 계정, 해당 선수가 포함된 팀 편성 기록이 삭제됩니다.</p><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setDeleteTarget(null)} className="secondary-button">취소</button><button type="button" disabled={pendingAction !== null} onClick={() => void remove()} className="primary-button border-[var(--error)] bg-[var(--error)]">삭제</button></div></div></div>}
    </div>
  );
}

function PlayerRow({player, pending, onEdit, onSync, onDelete}: {player: PlayerProfile; pending: boolean; onEdit: () => void; onSync: () => void; onDelete: () => void}) {
  return <article className="border-b border-[var(--hairline-soft)] bg-white p-4 last:border-b-0 sm:p-5"><div className="flex flex-col gap-4 xl:flex-row xl:items-center"><button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{player.displayName}</p><StatusBadge status={player.syncStatus} /></div><p className="mt-1 truncate text-sm text-[var(--muted)]">{player.riotGameName}#{player.riotTagLine}</p></button><div className="grid flex-1 gap-2 text-xs text-[var(--muted)] sm:grid-cols-3"><p><span className="block text-[10px]">포지션</span><b className="text-[var(--body)]">{ROLE_LABEL[player.primaryRole]} / {ROLE_LABEL[player.secondaryRole]}</b></p><p><span className="block text-[10px]">솔로랭크</span><b className="text-[var(--body)]">{rankDisplay(player.soloRank)}</b></p><p><span className="block text-[10px]">자유랭크</span><b className="text-[var(--body)]">{rankDisplay(player.flexRank)}</b></p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={onEdit} className="min-h-10 rounded-lg border border-[var(--hairline)] px-3 text-xs font-bold">관리</button><button type="button" disabled={pending || player.syncStatus === "REQUESTED" || player.syncStatus === "SYNCING"} onClick={onSync} className="min-h-10 rounded-lg border border-[#f0afbf] bg-[var(--primary-soft)] px-3 text-xs font-bold text-[var(--primary)] disabled:opacity-40">전적 갱신</button><button type="button" disabled={pending} onClick={onDelete} className="min-h-10 rounded-lg px-2 text-xs font-bold text-[var(--error)] disabled:opacity-40">삭제</button></div></div></article>;
}

function AccountPanel({accounts, loading, alt, setAlt, pending, onAdd, onAction}: {accounts: RiotAccountProfile[]; loading: boolean; alt: {riotGameName: string; riotTagLine: string}; setAlt: (value: {riotGameName: string; riotTagLine: string}) => void; pending: boolean; onAdd: () => void; onAction: (id: string, method: "PATCH" | "DELETE") => void}) {
  if (loading) return <p className="py-12 text-center text-sm text-[var(--muted)]">Riot 계정을 불러오는 중…</p>;
  return <div><div className="space-y-2">{accounts.map((account) => <div key={account.accountId} className="rounded-xl border border-[var(--hairline-soft)] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{account.riotGameName}#{account.riotTagLine}</p><p className="mt-1 text-xs text-[var(--muted)]">{account.isPrimary ? "대표 계정" : "부계정"}</p></div><div className="flex gap-2">{!account.isPrimary && <button type="button" disabled={pending} onClick={() => onAction(account.accountId, "PATCH")} className="min-h-10 rounded-lg border px-3 text-xs font-bold">대표로 변경</button>}{accounts.length > 1 && <button type="button" disabled={pending} onClick={() => onAction(account.accountId, "DELETE")} className="min-h-10 rounded-lg border border-[#f2b8aa] px-3 text-xs font-bold text-[var(--error)]">삭제</button>}</div></div></div>)}</div>{accounts.length < 2 && <div className="mt-6 rounded-xl bg-[var(--surface-soft)] p-4"><h3 className="text-sm font-bold">부계정 추가</h3><div className="mt-3 grid grid-cols-[minmax(0,1fr)_88px] gap-2"><input aria-label="부계정 게임 이름" placeholder="게임 이름" value={alt.riotGameName} onChange={(event) => setAlt({...alt, riotGameName: event.target.value})} className="form-control m-0" /><input aria-label="부계정 태그" placeholder="태그" value={alt.riotTagLine} onChange={(event) => setAlt({...alt, riotTagLine: event.target.value})} className="form-control m-0" /></div><button type="button" disabled={pending || !alt.riotGameName || !alt.riotTagLine} onClick={onAdd} className="secondary-button mt-3 w-full">부계정 등록</button></div>}</div>;
}

function StatsPanel({player}: {player: PlayerProfile}) {
  return <div className="space-y-5"><div className="rounded-xl bg-[var(--surface-soft)] p-4"><p className="text-sm font-bold">최근 플레이 라인</p><p className="mt-2 text-sm text-[var(--muted)]">{recentRoleSummary(player)}</p></div><div className="grid gap-3 sm:grid-cols-2">{ROLES.map((role) => {const stats = player.roleStats?.[role]; return <div key={role} className="rounded-xl border border-[var(--hairline-soft)] p-4 text-xs"><div className="flex justify-between"><p className="font-bold">{ROLE_LABEL[role]}</p><p className="font-bold text-[var(--primary)]">{Math.round((stats?.balanceSignal ?? 0.35) * 100)}점</p></div><p className="mt-2 text-[var(--muted)]">표본 {stats?.sampleCount ?? 0}경기 · 신뢰도 {Math.round((stats?.confidence ?? 0) * 100)}%</p><p className="mt-2 leading-5 text-[var(--muted)]">15분 골드 {Math.round(stats?.goldDiff15 ?? 0)} · XP {Math.round(stats?.xpDiff15 ?? 0)} · CS {(stats?.csDiff15 ?? 0).toFixed(1)}<br />피해효율 {(stats?.damagePerGoldDiff ?? 0).toFixed(2)} · 킬관여 {(stats?.killParticipationDiff ?? 0).toFixed(2)} · 시야 {(stats?.visionPerMinuteDiff ?? 0).toFixed(2)}</p></div>;})}</div></div>;
}

function EditorTab({active, onClick, children}: {active: boolean; onClick: () => void; children: React.ReactNode}) { return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`border-b-2 px-3 py-3 text-sm font-bold ${active ? "border-[var(--primary)] text-[var(--primary)]" : "border-transparent text-[var(--muted)]"}`}>{children}</button>; }
function StatusBadge({status}: {status: PlayerProfile["syncStatus"]}) { return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${status === "READY" ? "bg-[var(--success-soft)] text-[var(--success)]" : status === "FAILED" ? "bg-[var(--error-soft)] text-[var(--error)]" : "bg-[var(--warning-soft)] text-[var(--warning)]"}`}>{statusLabel[status]}</span>; }
function Field({label, value, onChange, disabled}: {label: string; value: string; onChange: (value: string) => void; disabled?: boolean}) { return <label className="block text-xs font-medium text-[var(--muted)]">{label}<input required disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} className="form-control text-sm" /></label>; }
function RoleSelect({label, value, onChange}: {label: string; value: Role; onChange: (value: Role) => void}) { return <label className="block text-xs font-medium text-[var(--muted)]">{label}<select value={value} onChange={(event) => onChange(event.target.value as Role)} className="form-control text-sm">{ROLES.map((role) => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}</select></label>; }
const toForm = (player: PlayerProfile) => ({discordUserId: player.discordUserId, displayName: player.displayName, riotGameName: player.riotGameName, riotTagLine: player.riotTagLine, primaryRole: player.primaryRole, secondaryRole: player.secondaryRole});
const formatDateTime = (time: number) => new Intl.DateTimeFormat("ko-KR", {month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"}).format(time);
function recentRoleSummary(player: PlayerProfile) { const sample = player.recentRoleSampleCount ?? 0; if (!sample) return "갱신 후 최근 플레이 라인이 표시됩니다."; return ROLES.map((role) => `${ROLE_LABEL[role]} ${Math.round(((player.recentRoleCounts?.[role] ?? 0) / sample) * 100)}%`).join(" · ") + ` (총 ${sample}경기)`; }
