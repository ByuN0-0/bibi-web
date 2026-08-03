"use client";

import LolIcon from "@/app/components/LolIcon";
import {LolObjectiveIcon} from "@/app/components/LolGameUiIcon";
import LolMatchScoreboard, {type MatchPlayerRankMap} from "@/app/components/LolMatchScoreboard";
import {groupMatchResultsByDate, playerNameKey, sortParticipantsByRole} from "@/lib/lol/match-history-view";
import type {MatchResultTeamStats, MatchTeam, PlayerProfile, PublicMatchResult, RankInfo} from "@/lib/lol/types";
import {rankTierDisplay} from "@/lib/lol/types";

export default function PublicMatchHistory({results, players, loading, error, hasMore, onLoadMore}: {
  results: PublicMatchResult[];
  players: PlayerProfile[];
  loading: boolean;
  error: string;
  hasMore: boolean;
  onLoadMore: () => void;
}) {
  const dateGroups = groupMatchResultsByDate(results);
  const playerRanks = Object.fromEntries(players.map((player) => [playerNameKey(player.riotGameName), currentRank(player)])) satisfies MatchPlayerRankMap;
  const playerNames = Object.fromEntries(players.map((player) => [playerNameKey(player.riotGameName), player.displayName]));

  return (
    <section aria-labelledby="history-title" className="mx-auto w-full max-w-[1080px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="eyebrow">LoL History</p><h2 id="history-title" className="mt-2 text-2xl font-bold tracking-[-0.03em] sm:text-3xl">내전 경기 기록</h2></div>
        <p className="text-sm text-[var(--muted)]">경기를 누르면 전체 점수판을 볼 수 있어요.</p>
      </div>
      {error && <div role="alert" className="mt-5 rounded-xl border border-[#f2b8aa] bg-[var(--error-soft)] px-4 py-4 text-sm text-[var(--error)]"><p>{error}</p><button type="button" onClick={onLoadMore} className="mt-3 font-bold underline">다시 시도</button></div>}
      <div className="mt-5 space-y-6">
        {dateGroups.map((group) => (
          <section key={group.playedOn} aria-labelledby={`history-date-${group.playedOn}`}>
            <div className="mb-2 flex items-center gap-2.5">
              <h3 id={`history-date-${group.playedOn}`} className="text-base font-bold tracking-[-0.02em]">{formatDate(group.playedOn)}</h3>
              <span className="rounded-full bg-[var(--surface-strong)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)]">{group.results.length}경기</span>
              <span className="h-px flex-1 bg-[var(--hairline-soft)]" aria-hidden="true" />
            </div>
            <div className="space-y-1.5">
              {group.results.map((result) => <MatchHistoryCard key={result.matchResultId} result={result} playerRanks={playerRanks} playerNames={playerNames} />)}
            </div>
          </section>
        ))}
        {!loading && !error && !results.length && <div className="surface-card border-dashed py-20 text-center text-sm text-[var(--muted)]">아직 저장된 내전 경기가 없습니다.</div>}
      </div>
      {loading && <div className="mt-4 surface-card py-8 text-center text-sm text-[var(--muted)]" aria-live="polite">내전 기록을 불러오는 중…</div>}
      {hasMore && !loading && <div className="mt-5 text-center"><button type="button" onClick={onLoadMore} className="secondary-button min-w-40">기록 더보기</button></div>}
    </section>
  );
}

function MatchHistoryCard({result, playerRanks, playerNames}: {result: PublicMatchResult; playerRanks: MatchPlayerRankMap; playerNames: Record<string, string>}) {
  const blueStats = result.teamStats.find((entry) => entry.team === "BLUE")!;
  const redStats = result.teamStats.find((entry) => entry.team === "RED")!;
  const blueWinner = result.winner === "BLUE";

  return (
    <details className={`group overflow-hidden rounded-xl border border-[var(--hairline-soft)] border-l-4 bg-white ${blueWinner ? "border-l-[#4f83e3]" : "border-l-[#e94f6d]"}`}>
      <summary className="relative cursor-pointer list-none px-3.5 py-2 transition-colors hover:bg-[var(--surface-soft)] [&::-webkit-details-marker]:hidden">
        <div className="grid gap-3 md:grid-cols-[100px_minmax(0,1fr)] lg:grid-cols-[88px_360px_minmax(0,1fr)] lg:items-center lg:gap-x-6">
          <MatchInfo winner={result.winner} durationSeconds={result.durationSeconds} />
          <TeamTotals blue={blueStats} red={redStats} />
          <RosterSummary result={result} playerNames={playerNames} />
        </div>
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-[var(--muted)] shadow-[0_0_0_1px_var(--hairline-soft)]">
          <span className="group-open:hidden">상세 보기</span><span className="hidden group-open:inline">접기</span>
          <span className="inline-block transition-transform group-open:rotate-180" aria-hidden="true">⌄</span>
        </span>
      </summary>
      <div className="border-t border-[var(--hairline-soft)] bg-[var(--surface-soft)] p-2 sm:p-3">
        <LolMatchScoreboard result={result} compact playerRanks={playerRanks} />
      </div>
    </details>
  );
}

function MatchInfo({winner, durationSeconds}: {winner: MatchTeam; durationSeconds: number}) {
  const blue = winner === "BLUE";
  return (
    <div className="pr-20 md:pr-0">
      <p className={`text-[17px] font-extrabold leading-none ${blue ? "text-[#3269bd]" : "text-[#c43652]"}`}>{blue ? "블루 승리" : "레드 승리"}</p>
      <p className="mt-1.5 text-[11px] font-medium text-[var(--muted)]">{formatDuration(durationSeconds)}</p>
    </div>
  );
}

function TeamTotals({blue, red}: {blue: MatchResultTeamStats; red: MatchResultTeamStats}) {
  return (
    <div className="flex self-stretch overflow-hidden rounded-lg border border-[var(--hairline-soft)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="flex w-full flex-col">
      <div className="flex h-0.5" aria-hidden="true"><span className="flex-1 bg-[#4f83e3]" /><span className="flex-1 bg-[#e94f6d]" /></div>
      <div className="flex flex-1 flex-col justify-center px-3 pb-2 pt-1.5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2 text-center">
          <div><p className="text-[10px] font-bold uppercase leading-none tracking-wide text-[#3269bd]">Blue</p><p className="mt-0.5 text-[30px] font-black leading-none tabular-nums">{blue.kills}</p></div>
          <p className="pb-0.5 text-[10px] font-bold text-[var(--muted-soft)]">VS</p>
          <div><p className="text-[10px] font-bold uppercase leading-none tracking-wide text-[#c43652]">Red</p><p className="mt-0.5 text-[30px] font-black leading-none tabular-nums">{red.kills}</p></div>
        </div>
        <div className="mt-1.5 grid grid-cols-3 divide-x divide-[var(--hairline-soft)] border-t border-[var(--hairline-soft)] pt-1.5 text-center text-[11px] text-[var(--muted)]">
          <Metric kind="gold" label="골드" blue={formatGold(blue.goldTotal)} red={formatGold(red.goldTotal)} />
          <Metric kind="turret" label="포탑" blue={blue.objectives.turretsDestroyed} red={red.objectives.turretsDestroyed} />
          <Metric kind="dragon" label="드래곤" blue={blue.objectives.dragonKills} red={red.objectives.dragonKills} />
        </div>
      </div>
      </div>
    </div>
  );
}

function Metric({kind, label, blue, red}: {kind: "gold" | "turret" | "dragon"; label: string; blue: string | number; red: string | number}) {
  return (
    <p className="flex items-center justify-center gap-1.5 leading-none" aria-label={`${label} 블루 ${blue}, 레드 ${red}`}>
      <span className="text-xs font-extrabold text-[#3269bd]">{blue}</span>
      <LolObjectiveIcon kind={kind} size={15} />
      <span className="text-xs font-extrabold text-[#c43652]">{red}</span>
    </p>
  );
}

function RosterSummary({result, playerNames}: {result: PublicMatchResult; playerNames: Record<string, string>}) {
  const blueParticipants = sortParticipantsByRole(result.participants.filter((participant) => participant.team === "BLUE"));
  const redParticipants = sortParticipantsByRole(result.participants.filter((participant) => participant.team === "RED"));
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:col-span-2 md:grid-cols-[repeat(2,minmax(0,200px))] md:justify-center lg:hidden">
        <RosterColumn result={result} team="BLUE" playerNames={playerNames} />
        <RosterColumn result={result} team="RED" playerNames={playerNames} />
      </div>
      <div className="hidden min-w-0 pr-16 lg:block">
        <div className="mb-0.5 grid grid-cols-[minmax(0,145px)_minmax(0,145px)_minmax(0,150px)] gap-2">
          <p className="text-[9px] font-bold uppercase leading-none tracking-wide text-[#3269bd]">Blue team</p>
          <p className="text-[9px] font-bold uppercase leading-none tracking-wide text-[#c43652]">Red team</p>
          <span aria-hidden="true" />
        </div>
        <div className="space-y-px">
          {blueParticipants.map((blueParticipant, index) => {
            const redParticipant = redParticipants[index];
            const blueName = playerNames[playerNameKey(blueParticipant.observedName)];
            const redName = redParticipant ? playerNames[playerNameKey(redParticipant.observedName)] : undefined;
            return (
              <div key={blueParticipant.role} className="grid min-w-0 grid-cols-[minmax(0,145px)_minmax(0,145px)_minmax(0,150px)] items-center gap-2">
                <RosterPlayer result={result} participant={blueParticipant} />
                {redParticipant ? <RosterPlayer result={result} participant={redParticipant} /> : <span />}
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 text-[10px] font-semibold leading-none text-[var(--muted)]">
                  <span className="truncate text-right" title={blueName}>{blueName ?? ""}</span>
                  <span className="text-[var(--hairline)]" aria-hidden="true">|</span>
                  <span className="truncate" title={redName}>{redName ?? ""}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function RosterPlayer({result, participant}: {result: PublicMatchResult; participant: PublicMatchResult["participants"][number]}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <LolIcon asset={participant.champion} version={result.ddragonVersion} size={17} className="shrink-0 rounded" />
      <span className="min-w-0 truncate text-[11px] font-medium leading-none" title={participant.observedName}>{participant.observedName}</span>
    </div>
  );
}

function RosterColumn({result, team, playerNames}: {result: PublicMatchResult; team: MatchTeam; playerNames: Record<string, string>}) {
  const participants = sortParticipantsByRole(result.participants.filter((participant) => participant.team === team));
  const blue = team === "BLUE";
  return (
    <div className="min-w-0">
      <p className={`mb-px text-[9px] font-bold uppercase leading-none tracking-wide ${blue ? "text-[#3269bd]" : "text-[#c43652]"}`}>{blue ? "Blue team" : "Red team"}</p>
      <div className="space-y-px">
        {participants.map((participant) => {
          const displayName = playerNames[playerNameKey(participant.observedName)];
          return (
            <div key={`${participant.role}-${participant.observedName}`} className="flex min-w-0 items-center gap-1.5">
              <LolIcon asset={participant.champion} version={result.ddragonVersion} size={17} className="shrink-0 rounded" />
              <span className="min-w-0 flex-1 truncate text-[11px] font-medium leading-none" title={participant.observedName}>{participant.observedName}</span>
              {displayName && <span className="max-w-16 shrink-0 truncate text-right text-[10px] font-semibold leading-none text-[var(--muted)]" title={displayName}>{displayName}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const formatDate = (value: string) => new Intl.DateTimeFormat("ko-KR", {dateStyle: "long", timeZone: "Asia/Seoul"}).format(new Date(`${value}T00:00:00+09:00`));
const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)}분 ${String(seconds % 60).padStart(2, "0")}초`;
const formatGold = (gold: number) => `${(gold / 1000).toFixed(1)}K`;

function currentRank(player: PlayerProfile): MatchPlayerRankMap[string] {
  if (isRanked(player.soloRank)) return {rank: rankTierDisplay(player.soloRank), queue: "솔랭"};
  if (isRanked(player.flexRank)) return {rank: rankTierDisplay(player.flexRank), queue: "자랭"};
  return {rank: "배치 전", queue: "랭크"};
}

const isRanked = (rank: RankInfo) => rank.tier !== "UNRANKED";
