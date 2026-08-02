"use client";

import {useState, type FormEvent} from "react";
import type {MatchResult, PlayerProfile} from "@/lib/lol/types";

export default function MatchResultEditor({result, players}: {result: MatchResult; players: PlayerProfile[]}) {
  const [winner, setWinner] = useState(result.winner);
  const [playedOn, setPlayedOn] = useState(result.playedOn);
  const [durationSeconds, setDurationSeconds] = useState(String(result.durationSeconds));
  const [ddragonVersion, setDdragonVersion] = useState(result.ddragonVersion);
  const [teamStatsText, setTeamStatsText] = useState(JSON.stringify(result.teamStats, null, 2));
  const [participantsText, setParticipantsText] = useState(JSON.stringify(result.participants, null, 2));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const teamStats = parseArray(teamStatsText, "팀 통계");
      const participants = parseArray(participantsText, "참가자");
      const response = await fetch(`/api/lol-statics/match-results/${encodeURIComponent(result.matchResultId)}`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({revision: result.revision, winner, playedOn, durationSeconds: Number(durationSeconds), ddragonVersion, teamStats, participants}),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "경기 결과를 수정하지 못했습니다.");
      window.location.href = `/lol-history/${encodeURIComponent(result.matchResultId)}`;
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "경기 결과를 수정하지 못했습니다.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="surface-card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4 sm:p-6">
        <Field label="승리 팀"><select value={winner} onChange={(event) => setWinner(event.target.value as MatchResult["winner"])} className="form-control"><option value="BLUE">블루</option><option value="RED">레드</option></select></Field>
        <Field label="경기 날짜"><input type="date" required value={playedOn} onChange={(event) => setPlayedOn(event.target.value)} className="form-control" /></Field>
        <Field label="진행 시간(초)"><input type="number" min="1" required value={durationSeconds} onChange={(event) => setDurationSeconds(event.target.value)} className="form-control" /></Field>
        <Field label="Data Dragon 버전"><input required pattern="[0-9]+\.[0-9]+\.[0-9]+" value={ddragonVersion} onChange={(event) => setDdragonVersion(event.target.value)} className="form-control" /></Field>
      </section>

      <section className="surface-card p-5 sm:p-6">
        <h2 className="text-lg font-bold">팀 통계·오브젝트·밴</h2>
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">BLUE·RED 각 1개, 목표물 6종과 밴 5칸을 유지하세요. 아이콘은 id·name·iconPath를 함께 수정합니다.</p>
        <textarea value={teamStatsText} onChange={(event) => setTeamStatsText(event.target.value)} rows={22} spellCheck={false} className="mt-4 w-full rounded-xl border border-[var(--hairline)] bg-[#fbfbfb] p-4 font-mono text-xs leading-5" />
      </section>

      <section className="surface-card p-5 sm:p-6">
        <h2 className="text-lg font-bold">참가자 10명</h2>
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">등록 선수 연결은 아래 Discord ID를 사용하고, 게스트는 discordUserId를 null로 둡니다. 개인 합계는 팀 K/D/A·골드와 정확히 같아야 합니다.</p>
        <details className="mt-3 rounded-xl border border-[var(--hairline-soft)] bg-[var(--surface-soft)] px-4 py-3"><summary className="cursor-pointer text-xs font-semibold">등록 선수 ID 보기</summary><div className="mt-3 grid gap-1 text-[11px] text-[var(--muted)] sm:grid-cols-2">{players.map((player) => <span key={player.discordUserId}><code>{player.discordUserId}</code> · {player.displayName} ({player.riotGameName}#{player.riotTagLine})</span>)}</div></details>
        <textarea value={participantsText} onChange={(event) => setParticipantsText(event.target.value)} rows={38} spellCheck={false} className="mt-4 w-full rounded-xl border border-[var(--hairline)] bg-[#fbfbfb] p-4 font-mono text-xs leading-5" />
      </section>

      {error && <p role="alert" className="rounded-xl border border-[#f2b8aa] bg-[var(--error-soft)] px-4 py-3 text-sm text-[var(--error)]">{error}</p>}
      <div className="flex gap-3"><button type="submit" disabled={pending} className="primary-button">{pending ? "검증·저장 중…" : "수정 저장"}</button><a href="/lol-statics/history" className="secondary-button">취소</a></div>
    </form>
  );
}

function Field({label, children}: {label: string; children: React.ReactNode}) {
  return <label className="text-sm font-semibold">{label}{children}</label>;
}

function parseArray(value: string, label: string): unknown[] {
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error(`${label}은 JSON 배열이어야 합니다.`);
  return parsed;
}
