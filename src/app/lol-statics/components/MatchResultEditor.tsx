"use client";

import {useEffect, useMemo, useState, type FormEvent} from "react";
import LolIcon from "@/app/components/LolIcon";
import LolMatchScoreboard from "@/app/components/LolMatchScoreboard";
import {swapMatchTeams} from "@/lib/lol/match-result-draft";
import {isQuestSlotAllowed, participantRoleAssetError, TRINKET_IDS} from "@/lib/lol/match-role-assets";
import type {DataDragonAssetKind, LolAssetRef, MatchObjectives, MatchResult, MatchResultParticipant, MatchTeam, PlayerProfile, Role} from "@/lib/lol/types";
import {ROLE_LABEL, ROLES} from "@/lib/lol/types";

const OBJECTIVES: Array<[keyof MatchObjectives, string]> = [["turretsDestroyed", "포탑"], ["inhibitorsDestroyed", "억제기"], ["baronKills", "내셔 남작"], ["dragonKills", "드래곤"], ["riftHeraldKills", "전령"], ["voidGrubKills", "공허 유충"]];
const catalogCache = new Map<string, LolAssetRef[]>();
type PickerState = {kind: DataDragonAssetKind; label: string; current: LolAssetRef | null; nullable: boolean; filter?: (asset: LolAssetRef) => boolean; apply: (asset: LolAssetRef | null) => void};

export default function MatchResultEditor({result, players}: {
  result: MatchResult;
  players: PlayerProfile[];
}) {
  const [draft, setDraft] = useState<MatchResult>(() => structuredClone(result));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [picker, setPicker] = useState<PickerState | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(result);
  const previewDraft = useMemo(() => ({...draft, teamStats: draft.teamStats.map((stats) => ({...stats, ...teamTotals(draft.participants, stats.team)}))}), [draft]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function updateParticipant(index: number, patch: Partial<MatchResultParticipant>) {
    setDraft((current) => ({...current, participants: current.participants.map((participant, participantIndex) => participantIndex === index ? {...participant, ...patch} : participant)}));
  }

  function updateTeam(team: MatchTeam, update: (stats: MatchResult["teamStats"][number]) => MatchResult["teamStats"][number]) {
    setDraft((current) => ({...current, teamStats: current.teamStats.map((stats) => stats.team === team ? update(stats) : stats)}));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const teamStats = draft.teamStats.map((stats) => ({...stats, ...teamTotals(draft.participants, stats.team)}));
      const normalizedDraft = {...draft, teamStats};
      await validateDraftAssets(normalizedDraft);
      const response = await fetch(`/api/lol-statics/match-results/${encodeURIComponent(result.matchResultId)}`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({revision: result.revision, winner: normalizedDraft.winner, playedOn: normalizedDraft.playedOn, durationSeconds: normalizedDraft.durationSeconds, ddragonVersion: normalizedDraft.ddragonVersion, teamStats, participants: normalizedDraft.participants}),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(response.status === 409 ? "다른 관리자가 먼저 수정했습니다. 입력한 내용은 유지되며, 원본을 다시 확인한 뒤 새로고침해 주세요." : payload.error ?? "경기 결과를 수정하지 못했습니다.");
      window.location.href = `/lol-statics/history?open=${encodeURIComponent((payload.result as MatchResult).matchResultId)}`;
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "경기 결과를 수정하지 못했습니다.");
      setPending(false);
      window.requestAnimationFrame(() => document.getElementById("match-editor-error")?.scrollIntoView({behavior: "smooth", block: "center"}));
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6 pb-24">
      <section className="surface-card overflow-hidden p-3 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><p className="eyebrow">Live Scoreboard</p><h2 className="mt-1 text-lg font-bold">점수표 미리보기</h2></div>
          <button type="button" onClick={() => setDraft((current) => swapMatchTeams(current))} className="secondary-button">블루 ↔ 레드 팀 교체</button>
        </div>
        <LolMatchScoreboard result={previewDraft} compact />
      </section>
      <section className="surface-card grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4 sm:p-6">
        <SelectField label="승리 팀" value={draft.winner} onChange={(value) => setDraft({...draft, winner: value as MatchTeam})}><option value="BLUE">블루</option><option value="RED">레드</option></SelectField>
        <InputField label="경기 날짜" type="date" value={draft.playedOn} onChange={(value) => setDraft({...draft, playedOn: value})} />
        <NumberField label="진행 시간(초)" value={draft.durationSeconds} min={1} onChange={(value) => setDraft({...draft, durationSeconds: value})} />
        <InputField label="Data Dragon 버전" value={draft.ddragonVersion} pattern="[0-9]+\.[0-9]+\.[0-9]+" onChange={(value) => setDraft({...draft, ddragonVersion: value})} />
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        {(["BLUE", "RED"] as const).map((team) => {
          const stats = draft.teamStats.find((entry) => entry.team === team)!;
          const totals = teamTotals(draft.participants, team);
          const indexedParticipants = draft.participants.map((participant, index) => ({participant, index})).filter(({participant}) => participant.team === team);
          return <section key={team} className={`overflow-hidden rounded-2xl border ${team === "BLUE" ? "border-[#c9dcf5]" : "border-[#f0cbd2]"}`}>
            <header className={`p-5 ${team === "BLUE" ? "bg-[#f2f7ff]" : "bg-[#fff5f7]"}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className={`text-lg font-bold ${team === "BLUE" ? "text-[#2463a5]" : "text-[#b62e49]"}`}>{team === "BLUE" ? "블루 팀" : "레드 팀"}</h2><p className="mt-1 text-xs text-[var(--muted)]">개인 기록을 수정하면 팀 합계가 자동으로 계산됩니다.</p></div><div className="rounded-xl bg-white/80 px-4 py-2 text-right text-xs"><p className="font-bold">{totals.kills} / {totals.deaths} / {totals.assists}</p><p className="mt-1 text-[var(--muted)]">{totals.goldTotal.toLocaleString()} G</p></div></div></header>
            <div className="border-y border-[var(--hairline-soft)] bg-white p-4 sm:p-5"><h3 className="text-sm font-bold">오브젝트</h3><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{OBJECTIVES.map(([field, label]) => <NumberField key={field} compact label={label} value={stats.objectives[field]} min={0} onChange={(value) => updateTeam(team, (current) => ({...current, objectives: {...current.objectives, [field]: value}}))} />)}</div><h3 className="mt-5 text-sm font-bold">밴</h3><div className="mt-3 grid grid-cols-5 gap-2">{stats.bans.map((asset, index) => <AssetField key={index} label={`밴 ${index + 1}`} asset={asset} version={draft.ddragonVersion} onClick={() => setPicker({kind: "champions", label: `${team === "BLUE" ? "블루" : "레드"} 팀 밴 ${index + 1}`, current: asset, nullable: true, apply: (next) => updateTeam(team, (current) => {const bans = [...current.bans] as typeof current.bans; bans[index] = next; return {...current, bans};})})} />)}</div></div>
            <div className="space-y-3 bg-[var(--surface-soft)] p-3 sm:p-4">{indexedParticipants.map(({participant, index}, teamIndex) => <ParticipantEditor key={`${team}-${teamIndex}`} participant={participant} index={index} changed={JSON.stringify(participant) !== JSON.stringify(result.participants[index])} players={players} version={draft.ddragonVersion} onChange={(patch) => updateParticipant(index, patch)} onPick={(state) => setPicker(state)} />)}</div>
          </section>;
        })}
      </div>

      {error && <p id="match-editor-error" role="alert" className="rounded-xl border border-[#f2b8aa] bg-[var(--error-soft)] px-4 py-3 text-sm text-[var(--error)]">{error}</p>}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--hairline)] bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur lg:left-64"><div className="mx-auto flex max-w-[1380px] items-center justify-between gap-4"><p className="text-xs text-[var(--muted)]">{dirty ? "수정된 내용이 있습니다." : "변경사항이 없습니다."}</p><div className="flex gap-2"><a href="/lol-statics/history" className="secondary-button">취소</a><button type="submit" disabled={pending || !dirty} className="primary-button">{pending ? "검증·저장 중…" : "수정 저장"}</button></div></div></div>
      {picker && <AssetPicker version={draft.ddragonVersion} state={picker} onClose={() => setPicker(null)} />}
    </form>
  );
}

function ParticipantEditor({participant, index, changed, players, version, onChange, onPick}: {participant: MatchResultParticipant; index: number; changed: boolean; players: PlayerProfile[]; version: string; onChange: (patch: Partial<MatchResultParticipant>) => void; onPick: (state: PickerState) => void}) {
  function pick(kind: DataDragonAssetKind, label: string, current: LolAssetRef | null, nullable: boolean, apply: (asset: LolAssetRef | null) => void, filter?: (asset: LolAssetRef) => boolean) { onPick({kind, label, current, nullable, apply, filter}); }
  return <article className={`rounded-xl border bg-white p-4 ${changed ? "border-[var(--primary)] shadow-[inset_3px_0_0_var(--primary)]" : "border-[var(--hairline-soft)]"}`}>
    <div className="mb-4 flex items-center justify-between gap-3"><div className="flex items-center gap-3"><LolIcon asset={participant.champion} version={version} size={42} /><div><p className="font-bold">{participant.role ? `${ROLE_LABEL[participant.role]} · ` : ""}{participant.observedName}</p><p className="text-[10px] text-[var(--muted)]">{participant.guest ? "게스트" : "등록 선수"} · {participant.champion.name}</p></div></div>{changed && <span className="rounded-full bg-[var(--primary-soft)] px-2 py-1 text-[10px] font-bold text-[var(--primary)]">수정됨</span>}</div>
    <div className="grid gap-3 sm:grid-cols-3"><SelectField label="등록 선수 연결" value={participant.discordUserId ?? ""} onChange={(value) => onChange({discordUserId: value || null, guest: !value})}><option value="">게스트</option>{players.map((player) => <option key={player.discordUserId} value={player.discordUserId}>{player.displayName} · {player.riotGameName}#{player.riotTagLine}</option>)}</SelectField><InputField label="점수판 이름" value={participant.observedName} onChange={(value) => onChange({observedName: value})} /><SelectField label="라인" value={participant.role} onChange={(value) => {const role = value as Role; onChange({role, questSlot: participant.questSlot && isQuestSlotAllowed(participant.questSlot, role, participant.summonerSpells) ? participant.questSlot : null});}}>{ROLES.map((role) => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}</SelectField></div>
    <div className="mt-3 grid grid-cols-[92px_repeat(3,minmax(0,1fr))] gap-2"><NumberField compact label="레벨" value={participant.level} min={1} onChange={(value) => onChange({level: value})} /><NumberField compact label="킬" value={participant.kills} min={0} onChange={(value) => onChange({kills: value})} /><NumberField compact label="데스" value={participant.deaths} min={0} onChange={(value) => onChange({deaths: value})} /><NumberField compact label="어시스트" value={participant.assists} min={0} onChange={(value) => onChange({assists: value})} /></div>
    <div className="mt-3 grid grid-cols-2 gap-2"><NumberField compact label="CS" value={participant.cs} min={0} onChange={(value) => onChange({cs: value})} /><NumberField compact label="골드" value={participant.goldEarned} min={0} onChange={(value) => onChange({goldEarned: value})} /></div>
    <div className="mt-4 grid grid-cols-4 gap-2"><AssetField label="챔피언" asset={participant.champion} version={version} onClick={() => pick("champions", `${participant.observedName} 챔피언`, participant.champion, false, (asset) => asset && onChange({champion: asset}))} /><AssetField label="핵심 룬" asset={participant.primaryPerk} version={version} onClick={() => pick("perks", `${participant.observedName} 핵심 룬`, participant.primaryPerk, false, (asset) => asset && onChange({primaryPerk: asset}))} />{participant.summonerSpells.map((asset, slot) => <AssetField key={slot} label={`주문 ${slot + 1}`} asset={asset} version={version} onClick={() => pick("spells", `${participant.observedName} 소환사 주문 ${slot + 1}`, asset, false, (next) => {if (!next) return; const spells = [...participant.summonerSpells] as typeof participant.summonerSpells; spells[slot] = next; onChange({summonerSpells: spells, questSlot: participant.questSlot && isQuestSlotAllowed(participant.questSlot, participant.role, spells) ? participant.questSlot : null});})} />)}</div>
    <div className="mt-4"><p className="mb-2 text-[11px] font-bold text-[var(--muted)]">아이템·장신구</p><div className="grid grid-cols-4 gap-2 sm:grid-cols-8">{participant.items.map((asset, slot) => <AssetField key={slot} label={`아이템 ${slot + 1}`} asset={asset} version={version} onClick={() => pick("items", `${participant.observedName} 아이템 ${slot + 1}`, asset, true, (next) => {const items = [...participant.items] as typeof participant.items; items[slot] = next; onChange({items});})} />)}<AssetField label="장신구" asset={participant.trinket} version={version} onClick={() => pick("items", `${participant.observedName} 장신구`, participant.trinket, true, (asset) => onChange({trinket: asset}), (asset) => TRINKET_IDS.has(asset.id))} /><AssetField label="퀘스트" asset={participant.questSlot} version={version} onClick={() => pick("items", `${participant.observedName} ${ROLE_LABEL[participant.role]} 퀘스트 슬롯`, participant.questSlot, false, (asset) => asset && onChange({questSlot: asset}), (asset) => isQuestSlotAllowed(asset, participant.role, participant.summonerSpells))} /></div></div>
    <span className="sr-only">참가자 {index + 1}</span>
  </article>;
}

function AssetPicker({version, state, onClose}: {version: string; state: PickerState; onClose: () => void}) {
  const [assets, setAssets] = useState<LolAssetRef[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    loadAssetCatalog(version, state.kind).then((next) => {if (active) setAssets(next);}).catch((loadError) => {if (active) setError(loadError instanceof Error ? loadError.message : "에셋을 불러오지 못했습니다.");}).finally(() => {if (active) setLoading(false);});
    return () => {active = false;};
  }, [state.kind, version]);
  const eligible = useMemo(() => state.filter ? assets.filter(state.filter) : assets, [assets, state.filter]);
  const filtered = useMemo(() => {const normalized = query.trim().toLocaleLowerCase("ko-KR"); return normalized ? eligible.filter((asset) => `${asset.name} ${asset.id}`.toLocaleLowerCase("ko-KR").includes(normalized)).slice(0, 80) : eligible.slice(0, 80);}, [eligible, query]);
  function choose(asset: LolAssetRef | null) {state.apply(asset); onClose();}
  return <div className="fixed inset-0 z-[90] grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="asset-picker-title"><div className="surface-card flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden shadow-2xl"><header className="flex items-center justify-between border-b border-[var(--hairline-soft)] px-5 py-4"><div><h2 id="asset-picker-title" className="font-bold">{state.label}</h2><p className="mt-1 text-xs text-[var(--muted)]">이름 또는 ID로 검색하세요.</p></div><button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full border" aria-label="선택 창 닫기">×</button></header><div className="p-4"><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="검색" className="form-control m-0" /></div><div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{loading ? <p className="py-12 text-center text-sm text-[var(--muted)]">카탈로그를 불러오는 중…</p> : error ? <p role="alert" className="rounded-xl bg-[var(--error-soft)] p-4 text-sm text-[var(--error)]">{error}</p> : <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">{state.nullable && <button type="button" onClick={() => choose(null)} className="grid min-h-24 place-items-center rounded-xl border border-dashed p-2 text-xs font-bold text-[var(--muted)]">빈 슬롯</button>}{filtered.map((asset) => <button type="button" key={asset.id} onClick={() => choose(asset)} className={`flex min-h-24 flex-col items-center justify-center rounded-xl border p-2 text-center text-[10px] ${state.current?.id === asset.id ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--hairline-soft)] hover:border-[var(--hairline)]"}`}><LolIcon asset={asset} version={version} size={38} /><span className="mt-2 line-clamp-2">{asset.name}</span></button>)}</div>}</div></div></div>;
}

function AssetField({label, asset, version, onClick}: {label: string; asset: LolAssetRef | null; version: string; onClick: () => void}) { return <button type="button" onClick={onClick} className="flex min-w-0 flex-col items-center rounded-lg border border-[var(--hairline-soft)] bg-white p-2 text-center hover:border-[var(--primary)]"><LolIcon asset={asset} version={version} size={32} /><span className="mt-1 w-full truncate text-[9px] text-[var(--muted)]">{label}</span><span className="w-full truncate text-[10px] font-bold">{asset?.name ?? "비어 있음"}</span></button>; }
function InputField({label, value, onChange, type = "text", pattern}: {label: string; value: string; onChange: (value: string) => void; type?: string; pattern?: string}) { return <label className="block text-xs font-medium text-[var(--muted)]">{label}<input type={type} required pattern={pattern} value={value} onChange={(event) => onChange(event.target.value)} className="form-control text-sm" /></label>; }
function NumberField({label, value, min, onChange, compact = false}: {label: string; value: number; min: number; onChange: (value: number) => void; compact?: boolean}) { return <label className="block text-[10px] font-medium text-[var(--muted)]">{label}<input type="number" required min={min} value={value} onChange={(event) => onChange(Math.max(min, Number(event.target.value) || 0))} className={`form-control text-sm ${compact ? "min-h-10 px-2 py-2" : ""}`} /></label>; }
function SelectField({label, value, onChange, children}: {label: string; value: string; onChange: (value: string) => void; children: React.ReactNode}) { return <label className="block text-xs font-medium text-[var(--muted)]">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="form-control text-sm">{children}</select></label>; }
function teamTotals(participants: MatchResultParticipant[], team: MatchTeam) { const members = participants.filter((participant) => participant.team === team); return {kills: members.reduce((total, participant) => total + participant.kills, 0), deaths: members.reduce((total, participant) => total + participant.deaths, 0), assists: members.reduce((total, participant) => total + participant.assists, 0), goldTotal: members.reduce((total, participant) => total + participant.goldEarned, 0)}; }

async function loadAssetCatalog(version: string, kind: DataDragonAssetKind) {
  const key = `${version}:${kind}`;
  const cached = catalogCache.get(key);
  if (cached) return cached;
  const response = await fetch(`/api/lol-statics/data-dragon/catalog?version=${encodeURIComponent(version)}&type=${kind}`, {cache: "no-store"});
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "Data Dragon 카탈로그를 불러오지 못했습니다.");
  const assets = payload.assets as LolAssetRef[];
  catalogCache.set(key, assets);
  return assets;
}

async function validateDraftAssets(draft: MatchResult) {
  for (const participant of draft.participants) {
    const roleAssetError = participantRoleAssetError(participant);
    if (roleAssetError) throw new Error(roleAssetError);
  }
  const groups: Record<DataDragonAssetKind, LolAssetRef[]> = {
    champions: [...draft.teamStats.flatMap((stats) => stats.bans.filter((asset): asset is LolAssetRef => !!asset)), ...draft.participants.map((participant) => participant.champion)],
    items: draft.participants.flatMap((participant) => [...participant.items, participant.trinket, participant.questSlot].filter((asset): asset is LolAssetRef => !!asset)),
    perks: draft.participants.map((participant) => participant.primaryPerk),
    spells: draft.participants.flatMap((participant) => participant.summonerSpells),
  };
  const catalogs = await Promise.all((Object.keys(groups) as DataDragonAssetKind[]).map(async (kind) => [kind, await loadAssetCatalog(draft.ddragonVersion, kind)] as const));
  for (const [kind, assets] of catalogs) {
    const canonical = new Map(assets.map((asset) => [asset.id, asset]));
    const invalid = groups[kind].find((asset) => {const expected = canonical.get(asset.id); return !expected || expected.name !== asset.name || expected.iconPath !== asset.iconPath;});
    if (invalid) throw new Error(`${invalid.name} 에셋이 Data Dragon ${draft.ddragonVersion} 카탈로그와 일치하지 않습니다. 해당 슬롯을 다시 선택해 주세요.`);
  }
}
