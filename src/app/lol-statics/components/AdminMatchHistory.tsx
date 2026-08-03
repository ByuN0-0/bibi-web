"use client";

import {useEffect, useState} from "react";
import Link from "next/link";
import LolIcon from "@/app/components/LolIcon";
import LolMatchScoreboard from "@/app/components/LolMatchScoreboard";
import {readApiJson} from "@/lib/api-response";
import type {MatchResult, MatchTeam} from "@/lib/lol/types";
import {matchReviewIssues, matchReviewStatus} from "@/lib/lol/match-review";

type Notice = {kind: "success" | "error"; message: string};

export default function AdminMatchHistory({initialResults, initialNextOffset, initialOpenId}: {
  initialResults: MatchResult[];
  initialNextOffset: number | null;
  initialOpenId: string | null;
}) {
  const [results, setResults] = useState(initialResults);
  const [nextOffset, setNextOffset] = useState(initialNextOffset);
  const [openId, setOpenId] = useState<string | null>(initialResults.some((result) => result.matchResultId === initialOpenId) ? initialOpenId : null);
  const [deleteTarget, setDeleteTarget] = useState<MatchResult | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), notice.kind === "success" ? 2500 : 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function deleteResult() {
    if (!deleteTarget || deletingId) return;
    setDeletingId(deleteTarget.matchResultId);
    setError("");
    try {
      const response = await fetch(`/api/lol-statics/match-results/${encodeURIComponent(deleteTarget.matchResultId)}`, {method: "DELETE"});
      const payload = await readApiJson<{ok?: boolean; error?: string}>(response, {fallbackMessage: "경기 결과를 삭제하지 못했습니다."});
      if (!response.ok) throw new Error(payload.error ?? "경기 결과를 삭제하지 못했습니다.");
      setResults((current) => current.filter((result) => result.matchResultId !== deleteTarget.matchResultId));
      setNextOffset((current) => current === null ? null : Math.max(0, current - 1));
      setOpenId((current) => current === deleteTarget.matchResultId ? null : current);
      setDeleteTarget(null);
      setNotice({kind: "success", message: "경기 기록을 삭제했습니다."});
    } catch (deleteError) {
      setNotice({kind: "error", message: deleteError instanceof Error ? deleteError.message : "경기 결과를 삭제하지 못했습니다."});
    } finally {
      setDeletingId(null);
    }
  }

  async function loadMore() {
    if (nextOffset === null || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const response = await fetch(`/api/lol-statics/history?offset=${nextOffset}`, {cache: "no-store"});
      const payload = await readApiJson<{results?: MatchResult[]; nextOffset?: number | null; error?: string}>(response, {
        fallbackMessage: "기록을 더 불러오지 못했습니다.",
      });
      if (!response.ok) throw new Error(payload.error ?? "기록을 더 불러오지 못했습니다.");
      setResults((current) => [...current, ...(payload.results ?? []).filter((next) => !current.some((result) => result.matchResultId === next.matchResultId))]);
      setNextOffset(payload.nextOffset ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "기록을 더 불러오지 못했습니다.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div><p className="eyebrow">History</p><h1 className="mt-2 text-3xl font-bold tracking-[-0.03em]">내전 경기 기록</h1><p className="mt-2 text-sm text-[var(--muted)]">로컬에서 등록한 경기를 펼쳐 확인하고 잘못된 결과를 수정하거나 삭제하세요.</p></div>
        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[var(--muted)] shadow-sm">총 {results.length}{nextOffset !== null ? "+" : ""}경기</span>
      </div>

      {error && <div role="alert" className="mb-4 rounded-xl border border-[#f2b8aa] bg-[var(--error-soft)] px-4 py-3 text-sm text-[var(--error)]">{error}</div>}
      {notice && <div className={`fixed right-5 top-20 z-[100] rounded-xl px-4 py-3 text-sm font-bold text-white shadow-xl ${notice.kind === "success" ? "bg-[#25312a]" : "bg-[var(--error)]"}`} role="status">{notice.message}</div>}
      {deleteTarget && <div className="fixed right-5 top-20 z-[110] w-[min(24rem,calc(100vw-2.5rem))] rounded-2xl border border-[#f2b8aa] bg-white p-4 shadow-2xl" role="alertdialog" aria-labelledby="delete-match-title" aria-describedby="delete-match-description">
        <p id="delete-match-title" className="font-bold text-[var(--error)]">경기 기록을 삭제할까요?</p>
        <p id="delete-match-description" className="mt-2 text-sm leading-6 text-[var(--muted)]">{formatDate(deleteTarget.playedOn)} 경기입니다. 삭제한 기록은 복구할 수 없습니다.</p>
        <div className="mt-4 flex justify-end gap-2"><button type="button" disabled={!!deletingId} onClick={() => setDeleteTarget(null)} className="secondary-button">취소</button><button type="button" disabled={!!deletingId} onClick={() => void deleteResult()} className="min-h-11 rounded-xl bg-[var(--error)] px-4 text-sm font-bold text-white disabled:opacity-50">{deletingId ? "삭제 중…" : "삭제"}</button></div>
      </div>}

      <div className="space-y-2">
        {results.map((result) => {
          const opened = openId === result.matchResultId;
          const pendingReview = matchReviewStatus(result) === "PENDING_REVIEW";
          const openIssues = matchReviewIssues(result).filter((issue) => issue.status === "OPEN").length;
          return <article key={result.matchResultId} className="surface-card overflow-hidden">
            <button type="button" aria-expanded={opened} onClick={() => setOpenId(opened ? null : result.matchResultId)} className="w-full px-4 py-3 text-left transition hover:bg-[var(--surface-soft)] sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-3"><WinnerBadge winner={result.winner} />{pendingReview && <span className="rounded-full bg-[var(--warning-soft)] px-2.5 py-1 text-[11px] font-bold text-[var(--warning)]">검토 대기{openIssues ? ` · ${openIssues}건` : ""}</span>}<p className="text-sm font-bold">{formatDate(result.playedOn)} <span className="ml-1 font-normal text-[var(--muted)]">{formatDuration(result.durationSeconds)}</span></p></div><span className="text-xs font-bold text-[var(--primary)]">{opened ? "접기 ↑" : "점수판 펼치기 ↓"}</span></div>
              <div className="mt-3 grid gap-2 lg:grid-cols-2"><TeamSummary result={result} team="BLUE" /><TeamSummary result={result} team="RED" /></div>
            </button>
            {opened && <div className="border-t border-[var(--hairline-soft)] bg-white p-3 sm:p-4"><LolMatchScoreboard result={result} compact /><div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--hairline-soft)] pt-4"><p className="text-xs text-[var(--muted)]">Data Dragon {result.ddragonVersion} · 리비전 {result.revision} · 게스트 {result.participants.filter((participant) => participant.guest).length}명</p><div className="flex gap-2"><button type="button" disabled={!!deletingId} onClick={() => {setNotice(null); setDeleteTarget(result);}} className="secondary-button border-[#f2b8aa] text-[var(--error)] disabled:opacity-50">삭제</button><Link href={`/lol-statics/history/${encodeURIComponent(result.matchResultId)}/edit`} className="primary-button">{pendingReview ? "검토하기" : "결과 수정"}</Link></div></div></div>}
          </article>;
        })}
        {!results.length && <div className="surface-card border-dashed py-20 text-center text-sm text-[var(--muted)]">아직 저장된 내전 경기가 없습니다.</div>}
      </div>
      {nextOffset !== null && <div className="mt-5 text-center"><button type="button" disabled={loadingMore} onClick={() => void loadMore()} className="secondary-button min-w-40">{loadingMore ? "불러오는 중…" : "기록 더보기"}</button></div>}
    </div>
  );
}

function TeamSummary({result, team}: {result: MatchResult; team: MatchTeam}) {
  const stats = result.teamStats.find((entry) => entry.team === team)!;
  const members = result.participants.filter((participant) => participant.team === team);
  return <div className={`flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2 ${team === "BLUE" ? "border-[#d5e4f8] bg-[#f7faff]" : "border-[#f2d6db] bg-[#fff8f9]"}`}><div className="w-32 shrink-0"><p className="text-xs font-bold">{team === "BLUE" ? "블루" : "레드"} · {stats.kills}/{stats.deaths}/{stats.assists}</p><p className="mt-0.5 text-[10px] text-[var(--muted)]">{stats.goldTotal.toLocaleString()} G · 포탑 {stats.objectives.turretsDestroyed} · 용 {stats.objectives.dragonKills}</p></div><div className="flex shrink-0 -space-x-1">{members.map((participant, index) => <LolIcon key={index} asset={participant.champion} version={result.ddragonVersion} size={28} className="ring-2 ring-white" />)}</div><p className="min-w-0 truncate text-[11px] text-[var(--muted)]">{members.map((participant) => participant.observedName).join(" · ")}</p></div>;
}

function WinnerBadge({winner}: {winner: MatchTeam}) {
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${winner === "BLUE" ? "bg-[#eaf3ff] text-[#2463a5]" : "bg-[#fff0f2] text-[#b62e49]"}`}>{winner === "BLUE" ? "블루 승" : "레드 승"}</span>;
}

const formatDate = (value: string) => new Intl.DateTimeFormat("ko-KR", {dateStyle: "long", timeZone: "Asia/Seoul"}).format(new Date(`${value}T00:00:00+09:00`));
const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)}분 ${String(seconds % 60).padStart(2, "0")}초`;
