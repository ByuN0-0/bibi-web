"use client";

import {FormEvent, useCallback, useEffect, useMemo, useRef, useState} from "react";
import {rankDisplay, ROLE_LABEL, ROLES, type PlayerProfile, type RiotAccountProfile, type RiotAccountSyncRow, type Role, type RolePreferences} from "@/lib/lol/types";
import {formatRolePreferences, legacyRolePreferences, resolveRolePreferences} from "@/lib/lol/role-preferences";

const empty = {discordUserId: "", displayName: "", riotGameName: "", riotTagLine: "", rolePreferences: legacyRolePreferences("TOP", "JUNGLE")};
type EditorTab = "profile" | "accounts" | "stats";
type PageTab = "players" | "sync";

export default function PlayerManager({initialPlayers}: {initialPlayers: PlayerProfile[]}) {
  const [players, setPlayers] = useState(initialPlayers);
  const [pageTab, setPageTab] = useState<PageTab>("players");
  const [query, setQuery] = useState("");
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
    return players.filter((player) => !normalized || `${player.displayName} ${player.riotGameName}#${player.riotTagLine}`.toLocaleLowerCase("ko-KR").includes(normalized));
  }, [players, query]);

  const reload = useCallback(async () => {
    const response = await fetch("/api/lol-statics/players", {cache: "no-store"});
    if (response.ok) setPlayers((await response.json()).players);
  }, []);

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
      const result = await response.json() as {error?: string; player?: PlayerProfile};
      if (!response.ok) { setFormError(result.error ?? "선수 정보를 저장하지 못했습니다."); return; }
      await reload();
      closeEditor(true);
      setToast(editingId ? "선수 정보를 수정했습니다." : "선수를 등록했습니다.");
    } catch {
      setFormError("선수 정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
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
      setToast("부계정을 등록했습니다. 전적 갱신 탭에서 최초 갱신을 진행해 주세요.");
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
      setToast(method === "PATCH" ? "대표 계정을 변경했습니다." : "계정을 삭제했습니다.");
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
      <div className="mb-4 flex gap-1 rounded-xl bg-[var(--surface-soft)] p-1" role="tablist" aria-label="선수 관리 메뉴">
        <PageTabButton active={pageTab === "players"} onClick={() => setPageTab("players")}>선수 목록</PageTabButton>
        <PageTabButton active={pageTab === "sync"} onClick={() => setPageTab("sync")}>전적 갱신</PageTabButton>
      </div>
      {pageTab === "players" ? <section className="surface-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div><h2 className="font-bold">등록 선수 {players.length}명</h2><p className="mt-1 text-xs text-[var(--muted)]">선수를 선택하면 계정과 상세 전적을 관리할 수 있습니다.</p></div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름 또는 Riot ID 검색" aria-label="선수 검색" className="form-control m-0 sm:w-64" />
            <button type="button" onClick={() => showEditor()} className="primary-button whitespace-nowrap">선수 추가</button>
          </div>
        </div>
        <div className="mt-5 overflow-hidden rounded-xl border border-[var(--hairline-soft)]">
          {filtered.map((player) => <PlayerRow key={player.discordUserId} player={player} pending={pendingAction !== null} onEdit={() => showEditor(player)} onDelete={() => setDeleteTarget(player)} />)}
          {!filtered.length && <p className="bg-white py-16 text-center text-sm text-[var(--muted)]">조건에 맞는 선수가 없습니다.</p>}
        </div>
      </section> : <AccountSyncPanel onToast={setToast} onPlayerReload={() => void reload()} />}

      <dialog ref={editorRef} onCancel={(event) => {event.preventDefault(); closeEditor();}} className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-xl border-0 bg-white p-0 shadow-2xl backdrop:bg-black/35">
        <form onSubmit={submit} className="flex h-full flex-col">
          <header className="flex items-center justify-between border-b border-[var(--hairline-soft)] px-5 py-4 sm:px-6"><div><p className="eyebrow text-[10px]">Player editor</p><h2 className="mt-1 text-xl font-bold">{editingPlayer ? `${editingPlayer.displayName} 수정` : "선수 추가"}</h2></div><button type="button" onClick={() => closeEditor()} className="grid h-11 w-11 place-items-center rounded-full border border-[var(--hairline)] text-xl" aria-label="편집 닫기">×</button></header>
          <div className="border-b border-[var(--hairline-soft)] px-5 pt-3 sm:px-6"><div className="flex gap-1" role="tablist" aria-label="선수 편집 메뉴"><EditorTab active={editorTab === "profile"} onClick={() => void selectEditorTab("profile")}>기본 정보</EditorTab>{editingPlayer && <><EditorTab active={editorTab === "accounts"} onClick={() => void selectEditorTab("accounts")}>Riot 계정</EditorTab><EditorTab active={editorTab === "stats"} onClick={() => void selectEditorTab("stats")}>전적 요약</EditorTab></>}</div></div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
            {editorTab === "profile" && <div className="space-y-4"><Field label="Discord 사용자 ID" value={form.discordUserId} disabled={!!editingPlayer} onChange={(value) => setForm({...form, discordUserId: value})} /><Field label="표시 이름" value={form.displayName} onChange={(value) => setForm({...form, displayName: value})} /><div className="grid grid-cols-[minmax(0,1fr)_92px] gap-2"><Field label="Riot 게임 이름" value={form.riotGameName} onChange={(value) => setForm({...form, riotGameName: value})} /><Field label="태그" value={form.riotTagLine} onChange={(value) => setForm({...form, riotTagLine: value})} /></div><RolePreferenceEditor key={editingId ?? "new"} value={form.rolePreferences} onChange={(rolePreferences) => setForm({...form, rolePreferences})} />{identityChanged && <p className="rounded-xl border border-[#f2d28b] bg-[var(--warning-soft)] px-4 py-3 text-xs leading-5 text-[var(--warning)]">Riot ID를 변경하면 기존 랭크와 전적이 초기화됩니다. 저장 후 전적 갱신 탭에서 직접 갱신해 주세요.</p>}{formError && <p role="alert" className="rounded-xl border border-[#f2b8aa] bg-[var(--error-soft)] px-4 py-3 text-sm text-[var(--error)]">{formError}</p>}</div>}
            {editorTab === "accounts" && editingPlayer && <AccountPanel accounts={accounts} loading={accountsLoading} alt={alt} setAlt={setAlt} pending={pendingAction !== null} onAdd={() => void addAlt()} onAction={(id, method) => void accountAction(id, method)} />}
            {editorTab === "stats" && editingPlayer && <StatsPanel player={editingPlayer} />}
          </div>
          <footer className="flex items-center justify-between gap-3 border-t border-[var(--hairline-soft)] bg-white px-5 py-4 sm:px-6"><p className="text-xs text-[var(--muted)]">{dirty ? "저장하지 않은 변경사항이 있습니다." : "변경사항이 없습니다."}</p>{editorTab === "profile" && <div className="flex gap-2"><button type="button" onClick={() => closeEditor()} className="secondary-button">취소</button><button disabled={pendingAction !== null || !dirty || rolePreferenceTotal(form.rolePreferences) !== 100} className="primary-button">{pendingAction === "save" ? "저장 중…" : "저장"}</button></div>}</footer>
        </form>
      </dialog>

      {deleteTarget && <div className="fixed inset-0 z-[80] grid place-items-center bg-black/35 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-title"><div className="surface-card w-full max-w-sm p-6 shadow-2xl"><h2 id="delete-title" className="text-lg font-bold">선수를 삭제할까요?</h2><p className="mt-3 text-sm leading-6 text-[var(--muted)]">{deleteTarget.displayName} 선수와 연결 계정, 해당 선수가 포함된 팀 편성 기록이 삭제됩니다.</p><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setDeleteTarget(null)} className="secondary-button">취소</button><button type="button" disabled={pendingAction !== null} onClick={() => void remove()} className="primary-button border-[var(--error)] bg-[var(--error)]">삭제</button></div></div></div>}
    </div>
  );
}

function PlayerRow({player, pending, onEdit, onDelete}: {player: PlayerProfile; pending: boolean; onEdit: () => void; onDelete: () => void}) {
  return <article className="border-b border-[var(--hairline-soft)] bg-white p-4 last:border-b-0 sm:p-5"><div className="flex flex-col gap-4 xl:flex-row xl:items-center"><button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left"><p className="font-semibold">{player.displayName}</p><p className="mt-1 truncate text-sm text-[var(--muted)]">{player.riotGameName}#{player.riotTagLine}</p></button><div className="grid flex-1 gap-2 text-xs text-[var(--muted)] sm:grid-cols-3"><p><span className="block text-[10px]">포지션 선호</span><b className="text-[var(--body)]">{formatRolePreferences(resolveRolePreferences(player), ROLE_LABEL)}</b></p><p><span className="block text-[10px]">솔로랭크</span><b className="text-[var(--body)]">{rankDisplay(player.soloRank)}</b></p><p><span className="block text-[10px]">자유랭크</span><b className="text-[var(--body)]">{rankDisplay(player.flexRank)}</b></p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={onEdit} className="min-h-10 rounded-lg border border-[var(--hairline)] px-3 text-xs font-bold">관리</button><button type="button" disabled={pending} onClick={onDelete} className="min-h-10 rounded-lg px-2 text-xs font-bold text-[var(--error)] disabled:opacity-40">삭제</button></div></div></article>;
}

function PageTabButton({active, onClick, children}: {active: boolean; onClick: () => void; children: React.ReactNode}) {
  return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`min-h-11 flex-1 rounded-lg px-4 text-sm font-bold transition ${active ? "bg-white text-[var(--primary)] shadow-sm" : "text-[var(--muted)]"}`}>{children}</button>;
}

type AccountSyncDashboard = {
  accounts: RiotAccountSyncRow[];
  activeAccountId: string | null;
  nextAllowedAt: number;
};

function AccountSyncPanel({onToast, onPlayerReload}: {onToast: (message: string) => void; onPlayerReload: () => void}) {
  const [dashboard, setDashboard] = useState<AccountSyncDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingAccountId, setPendingAccountId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/lol-statics/accounts/sync", {cache: "no-store"});
      if (!response.ok) throw new Error();
      setDashboard(await response.json());
    } catch {
      onToast("계정별 전적 갱신 상태를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    if (!dashboard?.activeAccountId && !pendingAccountId) return;
    const interval = window.setInterval(() => void load(), 5_000);
    return () => window.clearInterval(interval);
  }, [dashboard?.activeAccountId, pendingAccountId, load]);

  async function sync(accountId: string) {
    setPendingAccountId(accountId);
    setDashboard((current) => {
      if (!current) return current;
      const accounts = current.accounts.map((account) => account.accountId === accountId
        ? {...account, syncStatus: "SYNCING" as const, lastSyncStartedAt: Date.now(), syncErrorCode: null}
        : account);
      accounts.sort((left, right) => Number(right.accountId === accountId) - Number(left.accountId === accountId));
      return {...current, activeAccountId: accountId, accounts};
    });
    try {
      const response = await fetch("/api/lol-statics/accounts/sync", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({accountId}),
      });
      const payload = await response.json() as {error?: string; retryAt?: number};
      if (!response.ok) {
        onToast(payload.retryAt
          ? `${payload.error} ${formatDateTime(payload.retryAt)} 이후 다시 시도해 주세요.`
          : payload.error ?? "Riot 계정 전적을 갱신하지 못했습니다.");
      } else {
        onToast("Riot 계정 전적 갱신을 완료했습니다.");
      }
    } catch {
      onToast("Riot 계정 전적을 갱신하지 못했습니다.");
    } finally {
      setPendingAccountId(null);
      await load();
      onPlayerReload();
    }
  }

  if (loading && !dashboard) return <section className="surface-card py-20 text-center text-sm text-[var(--muted)]">계정별 갱신 상태를 불러오는 중…</section>;
  if (!dashboard) return <section className="surface-card py-20 text-center text-sm text-[var(--error)]">계정별 갱신 상태를 표시할 수 없습니다.</section>;

  const active = dashboard.activeAccountId !== null || pendingAccountId !== null;
  const waitMilliseconds = Math.max(dashboard.nextAllowedAt - now, 0);
  const cooldown = waitMilliseconds > 0;
  return <section className="surface-card p-5 sm:p-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><h2 className="font-bold">Riot 계정 전적 갱신 · {dashboard.accounts.length}개</h2><p className="mt-1 text-xs leading-5 text-[var(--muted)]">한 번에 한 계정만 처리하며, 갱신 시작은 전체 기준 2분 간격입니다.</p></div>
      <div className={`rounded-lg px-3 py-2 text-xs font-bold ${active ? "bg-[var(--warning-soft)] text-[var(--warning)]" : cooldown ? "bg-[var(--surface-soft)] text-[var(--muted)]" : "bg-[var(--success-soft)] text-[var(--success)]"}`}>
        {active ? "계정 갱신 진행 중" : cooldown ? `다음 갱신까지 ${formatCountdown(waitMilliseconds)}` : "지금 갱신 가능"}
      </div>
    </div>
    <div className="mt-5 overflow-hidden rounded-xl border border-[var(--hairline-soft)]">
      {dashboard.accounts.map((account) => {
        const syncing = dashboard.activeAccountId === account.accountId || pendingAccountId === account.accountId || account.syncStatus === "SYNCING";
        return <article key={account.accountId} className="border-b border-[var(--hairline-soft)] bg-white p-4 last:border-b-0 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{account.displayName}</p><span className="rounded-full bg-[var(--surface-soft)] px-2 py-1 text-[10px] font-bold text-[var(--muted)]">{account.isPrimary ? "대표 계정" : "부계정"}</span><AccountSyncBadge status={account.syncStatus} syncing={syncing} /></div><p className="mt-1 truncate text-sm text-[var(--muted)]">{account.riotGameName}#{account.riotTagLine}</p></div>
            <div className="min-w-48 text-xs"><p className="text-[10px] text-[var(--muted)]">마지막 성공 갱신</p><p className="mt-1 font-bold text-[var(--body)]">{account.lastSyncedAt ? formatDateTime(account.lastSyncedAt) : "갱신 기록 없음"}</p>{account.syncErrorCode && account.syncStatus === "FAILED" && <p className="mt-1 text-[10px] text-[var(--error)]">{account.syncErrorCode}</p>}</div>
            <button type="button" disabled={active || cooldown} onClick={() => void sync(account.accountId)} className="primary-button min-w-28 disabled:opacity-40">{syncing ? <span className="inline-flex items-center gap-2"><LoadingSpinner />갱신 중</span> : "전적 갱신"}</button>
          </div>
        </article>;
      })}
      {!dashboard.accounts.length && <p className="py-16 text-center text-sm text-[var(--muted)]">등록된 Riot 계정이 없습니다.</p>}
    </div>
  </section>;
}

function AccountSyncBadge({status, syncing}: {status: RiotAccountProfile["syncStatus"]; syncing: boolean}) {
  const label = syncing ? "갱신 중" : {UNSYNCED: "미갱신", READY: "갱신 완료", FAILED: "갱신 실패", SYNCING: "갱신 중"}[status];
  const className = syncing ? "bg-[var(--warning-soft)] text-[var(--warning)]" : status === "READY" ? "bg-[var(--success-soft)] text-[var(--success)]" : status === "FAILED" ? "bg-[var(--error-soft)] text-[var(--error)]" : "bg-[var(--surface-soft)] text-[var(--muted)]";
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${className}`}>{syncing && <LoadingSpinner small />}{label}</span>;
}

function LoadingSpinner({small = false}: {small?: boolean}) {
  return <span role="status" aria-label="갱신 중" className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${small ? "h-3 w-3" : "h-4 w-4"}`} />;
}

function formatCountdown(milliseconds: number) {
  const totalSeconds = Math.ceil(milliseconds / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function AccountPanel({accounts, loading, alt, setAlt, pending, onAdd, onAction}: {accounts: RiotAccountProfile[]; loading: boolean; alt: {riotGameName: string; riotTagLine: string}; setAlt: (value: {riotGameName: string; riotTagLine: string}) => void; pending: boolean; onAdd: () => void; onAction: (id: string, method: "PATCH" | "DELETE") => void}) {
  if (loading) return <p className="py-12 text-center text-sm text-[var(--muted)]">Riot 계정을 불러오는 중…</p>;
  return <div><div className="space-y-2">{accounts.map((account) => <div key={account.accountId} className="rounded-xl border border-[var(--hairline-soft)] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{account.riotGameName}#{account.riotTagLine}</p><p className="mt-1 text-xs text-[var(--muted)]">{account.isPrimary ? "대표 계정" : "부계정"}</p></div><div className="flex gap-2">{!account.isPrimary && <button type="button" disabled={pending} onClick={() => onAction(account.accountId, "PATCH")} className="min-h-10 rounded-lg border px-3 text-xs font-bold">대표로 변경</button>}{accounts.length > 1 && <button type="button" disabled={pending} onClick={() => onAction(account.accountId, "DELETE")} className="min-h-10 rounded-lg border border-[#f2b8aa] px-3 text-xs font-bold text-[var(--error)]">삭제</button>}</div></div></div>)}</div>{accounts.length < 2 && <div className="mt-6 rounded-xl bg-[var(--surface-soft)] p-4"><h3 className="text-sm font-bold">부계정 추가</h3><div className="mt-3 grid grid-cols-[minmax(0,1fr)_88px] gap-2"><input aria-label="부계정 게임 이름" placeholder="게임 이름" value={alt.riotGameName} onChange={(event) => setAlt({...alt, riotGameName: event.target.value})} className="form-control m-0" /><input aria-label="부계정 태그" placeholder="태그" value={alt.riotTagLine} onChange={(event) => setAlt({...alt, riotTagLine: event.target.value})} className="form-control m-0" /></div><button type="button" disabled={pending || !alt.riotGameName || !alt.riotTagLine} onClick={onAdd} className="secondary-button mt-3 w-full">부계정 등록</button></div>}</div>;
}

function StatsPanel({player}: {player: PlayerProfile}) {
  return <div className="space-y-5"><div className="rounded-xl bg-[var(--surface-soft)] p-4"><p className="text-sm font-bold">최근 플레이 라인</p><p className="mt-2 text-sm text-[var(--muted)]">{recentRoleSummary(player)}</p></div><div className="grid gap-3 sm:grid-cols-2">{ROLES.map((role) => {const stats = player.roleStats?.[role]; return <div key={role} className="rounded-xl border border-[var(--hairline-soft)] p-4 text-xs"><div className="flex justify-between"><p className="font-bold">{ROLE_LABEL[role]}</p><p className="font-bold text-[var(--primary)]">{Math.round((stats?.balanceSignal ?? 0.35) * 100)}점</p></div><p className="mt-2 text-[var(--muted)]">표본 {stats?.sampleCount ?? 0}경기 · 신뢰도 {Math.round((stats?.confidence ?? 0) * 100)}%</p><p className="mt-2 leading-5 text-[var(--muted)]">15분 골드 {Math.round(stats?.goldDiff15 ?? 0)} · XP {Math.round(stats?.xpDiff15 ?? 0)} · CS {(stats?.csDiff15 ?? 0).toFixed(1)}<br />피해효율 {(stats?.damagePerGoldDiff ?? 0).toFixed(2)} · 킬관여 {(stats?.killParticipationDiff ?? 0).toFixed(2)} · 시야 {(stats?.visionPerMinuteDiff ?? 0).toFixed(2)}</p></div>;})}</div></div>;
}

function EditorTab({active, onClick, children}: {active: boolean; onClick: () => void; children: React.ReactNode}) { return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`border-b-2 px-3 py-3 text-sm font-bold ${active ? "border-[var(--primary)] text-[var(--primary)]" : "border-transparent text-[var(--muted)]"}`}>{children}</button>; }
function Field({label, value, onChange, disabled}: {label: string; value: string; onChange: (value: string) => void; disabled?: boolean}) { return <label className="block text-xs font-medium text-[var(--muted)]">{label}<input required disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} className="form-control text-sm" /></label>; }
function RolePreferenceEditor({value, onChange}: {value: RolePreferences; onChange: (value: RolePreferences) => void}) {
  const total = rolePreferenceTotal(value);
  const adjust = (role: Role, amount: number) => onChange({...value, [role]: Math.max(0, Math.min(100, value[role] + amount))});
  const topTwo = [...ROLES].sort((left, right) => value[right] - value[left] || ROLES.indexOf(left) - ROLES.indexOf(right)).slice(0, 2);
  const [presetPrimary, setPresetPrimary] = useState<Role>(topTwo[0]);
  const [presetSecondary, setPresetSecondary] = useState<Role>(topTwo[1]);
  return <fieldset className="rounded-xl border border-[var(--hairline-soft)] p-4"><legend className="text-sm font-bold">포지션 선호도</legend><div className="flex flex-wrap items-center justify-between gap-2"><p className="mt-1 text-xs text-[var(--muted)]">원하는 라인 수만큼 배분하고 합계를 100%로 맞춰 주세요.</p><span className={`rounded-full px-3 py-1 text-xs font-bold ${total === 100 ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--warning-soft)] text-[var(--warning)]"}`}>합계 {total}%</span></div><div className="mt-3 space-y-2">{ROLES.map((role) => <div key={role} className="grid grid-cols-[1fr_40px_58px_40px] items-center gap-2"><span className="text-sm font-semibold">{ROLE_LABEL[role]}</span><button type="button" disabled={value[role] === 0} onClick={() => adjust(role, -5)} className="min-h-10 rounded-lg border border-[var(--hairline)] font-bold disabled:opacity-35" aria-label={`${ROLE_LABEL[role]} 선호도 5% 감소`}>−</button><output className="text-center text-sm font-bold">{value[role]}%</output><button type="button" disabled={value[role] === 100} onClick={() => adjust(role, 5)} className="min-h-10 rounded-lg border border-[var(--hairline)] font-bold disabled:opacity-35" aria-label={`${ROLE_LABEL[role]} 선호도 5% 증가`}>+</button></div>)}</div><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => onChange({TOP: 20, JUNGLE: 20, MIDDLE: 20, BOTTOM: 20, UTILITY: 20})} className="secondary-button min-h-9 px-3 text-xs">전 라인 균등</button></div><div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2"><select aria-label="80% 적용 라인" value={presetPrimary} onChange={(event) => setPresetPrimary(event.target.value as Role)} className="min-w-0 rounded-lg border border-[var(--hairline)] bg-white px-2 text-xs">{ROLES.map((role) => <option key={role} value={role}>{ROLE_LABEL[role]} 80%</option>)}</select><select aria-label="20% 적용 라인" value={presetSecondary} onChange={(event) => setPresetSecondary(event.target.value as Role)} className="min-w-0 rounded-lg border border-[var(--hairline)] bg-white px-2 text-xs">{ROLES.map((role) => <option key={role} value={role}>{ROLE_LABEL[role]} 20%</option>)}</select><button type="button" disabled={presetPrimary === presetSecondary} onClick={() => onChange(legacyRolePreferences(presetPrimary, presetSecondary))} className="secondary-button min-h-10 px-3 text-xs">80/20 적용</button></div></fieldset>;
}
const rolePreferenceTotal = (preferences: RolePreferences) => ROLES.reduce((sum, role) => sum + preferences[role], 0);
const toForm = (player: PlayerProfile) => ({discordUserId: player.discordUserId, displayName: player.displayName, riotGameName: player.riotGameName, riotTagLine: player.riotTagLine, rolePreferences: resolveRolePreferences(player)});
const formatDateTime = (time: number) => new Intl.DateTimeFormat("ko-KR", {month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"}).format(time);
function recentRoleSummary(player: PlayerProfile) { const sample = player.recentRoleSampleCount ?? 0; if (!sample) return "갱신 후 최근 플레이 라인이 표시됩니다."; return ROLES.map((role) => `${ROLE_LABEL[role]} ${Math.round(((player.recentRoleCounts?.[role] ?? 0) / sample) * 100)}%`).join(" · ") + ` (총 ${sample}경기)`; }
