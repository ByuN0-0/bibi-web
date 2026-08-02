"use client";

import {useEffect, useRef, useState, type DragEvent} from "react";
import Link from "next/link";
import LolIcon from "@/app/components/LolIcon";
import LolMatchScoreboard from "@/app/components/LolMatchScoreboard";
import MatchResultEditor from "@/app/lol-statics/components/MatchResultEditor";
import {readApiJson} from "@/lib/api-response";
import {swapRecognitionReviews} from "@/lib/lol/match-result-draft";
import type {MatchRecognitionReport, MatchRecognitionReview, MatchResult, MatchResultDraft, MatchTeam, PlayerProfile} from "@/lib/lol/types";

type Recognition = {draft: MatchResultDraft; report: MatchRecognitionReport; reviewReceipt: string};
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export default function AdminMatchHistory({initialResults, initialNextOffset, players, initialOpenId}: {
  initialResults: MatchResult[];
  initialNextOffset: number | null;
  players: PlayerProfile[];
  initialOpenId: string | null;
}) {
  const [results, setResults] = useState(initialResults);
  const [nextOffset, setNextOffset] = useState(initialNextOffset);
  const [openId, setOpenId] = useState<string | null>(initialResults.some((result) => result.matchResultId === initialOpenId) ? initialOpenId : null);
  const [recognition, setRecognition] = useState<Recognition | null>(null);
  const [reviews, setReviews] = useState<MatchRecognitionReview[]>([]);
  const [confirmedReviewIds, setConfirmedReviewIds] = useState<string[]>([]);
  const [editingDraft, setEditingDraft] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState(0);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const phases = ["이미지 정렬", "문자 판독", "아이콘 대조", "결과 구성"];

  useEffect(() => {
    if (!recognizing) return;
    setPhase(0);
    const timer = window.setInterval(() => setPhase((current) => Math.min(3, current + 1)), 3500);
    return () => window.clearInterval(timer);
  }, [recognizing]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function recognize(file: File) {
    setError("");
    if (!ACCEPTED_TYPES.has(file.type)) return setError("PNG, JPEG, WebP 이미지만 판독할 수 있습니다.");
    if (file.size > MAX_IMAGE_BYTES) return setError("점수판 이미지는 4MB 이하여야 합니다.");
    setRecognizing(true);
    setRecognition(null);
    setReviews([]);
    setConfirmedReviewIds([]);
    setEditingDraft(false);
    const form = new FormData();
    form.set("image", file);
    try {
      const response = await fetch("/api/lol-statics/match-results/recognize", {method: "POST", body: form});
      const payload = await readApiJson<Recognition & {error?: string}>(response, {
        fallbackMessage: "점수판을 판독하지 못했습니다.",
        timeoutMessage: "점수판 판독 시간이 제한을 초과했습니다. 잠시 후 다시 시도해 주세요.",
      });
      if (!response.ok) throw new Error(payload.error ?? "점수판을 판독하지 못했습니다.");
      setRecognition(payload);
      setReviews(payload.report.reviews);
      setOpenId(null);
      setToast(`판독 완료 · ${payload.report.reviews.length ? `${payload.report.reviews.length}개 확인 필요` : "모든 항목 고신뢰"}`);
    } catch (recognizeError) {
      setError(recognizeError instanceof Error ? recognizeError.message : "점수판을 판독하지 못했습니다.");
    } finally {
      setRecognizing(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function saveRecognition(draft = recognition?.draft) {
    if (!recognition || !draft || reviews.some((review) => !confirmedReviewIds.includes(review.id))) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/lol-statics/match-results", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({draft, reviewReceipt: recognition.reviewReceipt, confirmedReviewIds}),
      });
      const payload = await readApiJson<{status?: "CREATED" | "EXISTING"; result?: MatchResult; error?: string}>(response, {
        fallbackMessage: "경기 결과를 저장하지 못했습니다.",
      });
      if (!response.ok || !payload.result) throw new Error(payload.error ?? "경기 결과를 저장하지 못했습니다.");
      finishSaved(payload.result, payload.status === "EXISTING" ? "이미 저장된 경기를 열었습니다." : "경기 결과를 저장했습니다.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "경기 결과를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function finishSaved(saved: MatchResult, message = "경기 결과를 저장했습니다.") {
    setResults((current) => [saved, ...current.filter((result) => result.matchResultId !== saved.matchResultId)]);
    setOpenId(saved.matchResultId);
    setRecognition(null);
    setReviews([]);
    setConfirmedReviewIds([]);
    setEditingDraft(false);
    setToast(message);
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

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void recognize(file);
  }

  const remainingReviews = reviews.filter((review) => !confirmedReviewIds.includes(review.id)).length;
  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div><p className="eyebrow">History</p><h1 className="mt-2 text-3xl font-bold tracking-[-0.03em]">내전 경기 기록</h1><p className="mt-2 text-sm text-[var(--muted)]">점수판 이미지를 판독하거나 저장된 경기를 펼쳐 바로 확인하세요.</p></div>
        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[var(--muted)] shadow-sm">총 {results.length}{nextOffset !== null ? "+" : ""}경기</span>
      </div>

      <section className="surface-card mb-5 overflow-hidden">
        <div className="border-b border-[var(--hairline-soft)] px-4 py-3 sm:px-5"><h2 className="font-bold">점수판 이미지 판독</h2><p className="mt-1 text-xs text-[var(--muted)]">PNG·JPEG·WebP, 최대 4MB · 이미지는 저장하지 않습니다.</p></div>
        <div className="p-3 sm:p-4">
          <label onDragEnter={(event) => {event.preventDefault(); setDragging(true);}} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={onDrop} className={`flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 text-center transition ${dragging ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--hairline)] bg-[var(--surface-soft)] hover:border-[var(--primary)]"}`}>
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" disabled={recognizing} className="sr-only" onChange={(event) => {const file = event.target.files?.[0]; if (file) void recognize(file);}} />
            <span className="text-2xl" aria-hidden="true">▣</span><strong className="mt-2 text-sm">{recognizing ? `${phases[phase]} 중…` : "점수판 이미지를 놓거나 눌러서 선택"}</strong><span className="mt-1 text-xs text-[var(--muted)]">{recognizing ? "첫 판독은 약 15~20초 걸릴 수 있습니다." : "판독 후 확인하기 전에는 저장되지 않습니다."}</span>
          </label>
          {recognizing && <div className="mt-3 grid grid-cols-4 gap-1" aria-live="polite">{phases.map((label, index) => <div key={label} className={`rounded-md px-2 py-2 text-center text-[10px] font-bold ${index <= phase ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "bg-[var(--surface-soft)] text-[var(--muted)]"}`}>{label}</div>)}</div>}
        </div>
      </section>

      {error && <div role="alert" className="mb-4 rounded-xl border border-[#f2b8aa] bg-[var(--error-soft)] px-4 py-3 text-sm text-[var(--error)]">{error}</div>}
      {toast && <div className="fixed right-5 top-20 z-[100] rounded-xl bg-[#25312a] px-4 py-3 text-sm font-bold text-white shadow-xl" role="status">{toast}</div>}

      {recognition && <section className="surface-card mb-5 overflow-hidden border-[var(--primary)]">
        <header className="flex flex-wrap items-center justify-between gap-3 bg-[var(--primary-soft)] px-4 py-3 sm:px-5"><div><p className="text-xs font-bold text-[var(--primary)]">새 판독 결과</p><p className="mt-1 text-sm text-[var(--muted)]">{recognition.draft.playedOn} · {formatDuration(recognition.draft.durationSeconds)} · {(recognition.report.elapsedMs / 1000).toFixed(1)}초</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${remainingReviews ? "bg-[#fff1cf] text-[#8b5b00]" : "bg-[#e8f6ed] text-[#287a45]"}`}>{remainingReviews ? `${remainingReviews}개 확인 필요` : "검토 완료"}</span></header>
        <div className="p-3 sm:p-4">
          {editingDraft ? <MatchResultEditor result={recognition.draft} players={players} mode="create" reviewReceipt={recognition.reviewReceipt} reviews={reviews} confirmedReviewIds={confirmedReviewIds} onConfirmReview={(id) => setConfirmedReviewIds((current) => current.includes(id) ? current : [...current, id])} onSwapReviews={() => setReviews((current) => swapRecognitionReviews(current))} onCancel={() => {if (window.confirm("수정 중인 내용을 버리고 판독 결과로 돌아갈까요?")) {setEditingDraft(false); setReviews(recognition.report.reviews);}}} onSaved={(saved) => finishSaved(saved)} /> : <>
            <LolMatchScoreboard result={recognition.draft} compact reviews={reviews} confirmedReviewIds={confirmedReviewIds} onConfirmReview={(id) => setConfirmedReviewIds((current) => current.includes(id) ? current : [...current, id])} />
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--hairline-soft)] pt-4"><p className="text-xs text-[var(--muted)]">정렬 신뢰도 {(recognition.report.layoutConfidence * 100).toFixed(0)}% · 모든 주황색 아이콘을 확인해 주세요.</p><div className="flex gap-2"><button type="button" onClick={() => {setRecognition(null); setReviews([]); setConfirmedReviewIds([]);}} className="secondary-button">취소</button><button type="button" onClick={() => setEditingDraft(true)} className="secondary-button">수정하기</button><button type="button" disabled={saving || remainingReviews > 0} onClick={() => void saveRecognition()} className="primary-button">{saving ? "저장 중…" : "이대로 저장"}</button></div></div>
          </>}
        </div>
      </section>}

      <div className="space-y-2">
        {results.map((result) => {
          const opened = openId === result.matchResultId;
          return <article key={result.matchResultId} className="surface-card overflow-hidden">
            <button type="button" aria-expanded={opened} onClick={() => setOpenId(opened ? null : result.matchResultId)} className="w-full px-4 py-3 text-left transition hover:bg-[var(--surface-soft)] sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-3"><WinnerBadge winner={result.winner} /><p className="text-sm font-bold">{formatDate(result.playedOn)} <span className="ml-1 font-normal text-[var(--muted)]">{formatDuration(result.durationSeconds)}</span></p></div><span className="text-xs font-bold text-[var(--primary)]">{opened ? "접기 ↑" : "점수판 펼치기 ↓"}</span></div>
              <div className="mt-3 grid gap-2 lg:grid-cols-2"><TeamSummary result={result} team="BLUE" /><TeamSummary result={result} team="RED" /></div>
            </button>
            {opened && <div className="border-t border-[var(--hairline-soft)] bg-white p-3 sm:p-4"><LolMatchScoreboard result={result} compact /><div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--hairline-soft)] pt-4"><p className="text-xs text-[var(--muted)]">Data Dragon {result.ddragonVersion} · 리비전 {result.revision} · 게스트 {result.participants.filter((participant) => participant.guest).length}명</p><Link href={`/lol-statics/history/${encodeURIComponent(result.matchResultId)}/edit`} className="primary-button">결과 수정</Link></div></div>}
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
