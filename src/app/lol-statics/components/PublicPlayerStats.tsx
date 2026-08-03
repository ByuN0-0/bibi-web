"use client";

import React, {useMemo, useState} from "react";
import LolIcon from "@/app/components/LolIcon";
import {LolPositionIcon} from "@/app/components/LolGameUiIcon";
import {formatKdaRatio, playerNameKey, type MatchHistoryAccount} from "@/lib/lol/match-history-view";
import type {
  PlayerHeadToHeadStats,
  PlayerInhouseStats,
  PlayerInhouseStatsMap,
  PlayerStatsLine,
  PlayerStatsMatch,
} from "@/lib/lol/player-stats";
import type {PlayerProfile} from "@/lib/lol/types";
import {ROLE_LABEL, ROLES} from "@/lib/lol/types";

export default function PublicPlayerStats({players, accounts, stats}: {
  players: PlayerProfile[];
  accounts: MatchHistoryAccount[];
  stats: PlayerInhouseStatsMap;
}) {
  const [query, setQuery] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const searchablePlayers = useMemo(() => players.map((player) => ({
    player,
    searchText: buildPlayerSearchText(player, accounts),
  })), [players, accounts]);
  const normalizedQuery = playerNameKey(query);
  const filteredPlayers = searchablePlayers.filter(({searchText}) => !normalizedQuery || searchText.includes(normalizedQuery));
  const selectedPlayer = players.find((player) => player.discordUserId === selectedPlayerId);
  const selectedStats = selectedPlayerId ? stats[selectedPlayerId] : undefined;

  return (
    <section aria-labelledby="player-stats-title" className="mx-auto w-full max-w-[1080px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Player Stats</p>
          <h2 id="player-stats-title" className="mt-2 text-2xl font-bold tracking-[-0.03em] sm:text-3xl">개인 스탯</h2>
        </div>
        <p className="text-sm text-[var(--muted)]">확정된 내전 기록만 반영해요.</p>
      </div>

      <div className="surface-card mt-5 p-4 sm:p-5">
        <label htmlFor="player-stats-search" className="text-sm font-bold">선수 검색</label>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Discord 표시 이름이나 주·부계정 Riot ID로 찾을 수 있어요.</p>
        <input
          id="player-stats-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="선수 이름 또는 Riot ID"
          className="form-control"
        />
        <div className="mt-3 flex max-h-48 flex-wrap gap-2 overflow-y-auto" aria-label="검색된 선수">
          {filteredPlayers.map(({player}) => (
            <button
              key={player.discordUserId}
              type="button"
              aria-pressed={selectedPlayerId === player.discordUserId}
              onClick={() => setSelectedPlayerId(player.discordUserId)}
              className={`min-h-10 rounded-lg border px-3.5 py-2 text-left text-sm font-semibold ${selectedPlayerId === player.discordUserId ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-active)]" : "border-[var(--hairline)] bg-white hover:bg-[var(--surface-soft)]"}`}
            >
              {player.displayName}
              <span className="ml-2 text-xs font-normal text-[var(--muted)]">{player.riotGameName}#{player.riotTagLine}</span>
            </button>
          ))}
          {!filteredPlayers.length && <p className="w-full py-5 text-center text-sm text-[var(--muted)]">검색 결과가 없습니다.</p>}
        </div>
      </div>

      {!selectedPlayer || !selectedStats ? (
        <div className="surface-card mt-5 border-dashed py-20 text-center">
          <p className="font-semibold">기록을 확인할 선수를 선택해 주세요.</p>
          <p className="mt-2 text-sm text-[var(--muted)]">전체 전적부터 자주 만난 상대까지 한 번에 볼 수 있어요.</p>
        </div>
      ) : (
        <PlayerStatsProfile
          key={selectedPlayer.discordUserId}
          player={selectedPlayer}
          players={players}
          accounts={accounts}
          stats={selectedStats}
        />
      )}
    </section>
  );
}

function PlayerStatsProfile({player, players, accounts, stats}: {
  player: PlayerProfile;
  players: PlayerProfile[];
  accounts: MatchHistoryAccount[];
  stats: PlayerInhouseStats;
}) {
  return (
    <div className="mt-5 space-y-5">
      <header className="surface-card overflow-hidden">
        <div className="border-l-4 border-[var(--primary)] px-5 py-5 sm:px-6">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--primary)]">Selected Player</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-2xl font-extrabold tracking-[-0.03em]">{player.displayName}</h3>
            <p className="text-sm text-[var(--muted)]">{player.riotGameName}#{player.riotTagLine}</p>
          </div>
        </div>
      </header>

      {stats.overall.matchCount === 0 ? (
        <div className="surface-card border-dashed py-16 text-center text-sm text-[var(--muted)]">아직 확정된 내전 경기 기록이 없습니다.</div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <StatsSummary title="전체 전적" subtitle={`${stats.overall.matchCount}경기 누적`} stats={stats.overall} />
            <StatsSummary title="최근 폼" subtitle={`최근 ${stats.recent.matchCount}경기`} stats={stats.recent} />
          </div>
          <Breakdowns stats={stats} />
          <RecentMatches matches={stats.recentMatches} />
          <HeadToHeadSection player={player} players={players} accounts={accounts} opponents={stats.headToHead} />
        </>
      )}
    </div>
  );
}

function StatsSummary({title, subtitle, stats}: {title: string; subtitle: string; stats: PlayerStatsLine}) {
  const metrics = [
    ["승률", formatPercent(stats.winRate)],
    ["평균 K/D/A", formatAverageKda(stats)],
    ["KDA", formatKda(stats)],
    ["CS/분", stats.csPerMinute.toFixed(1)],
    ["골드/분", Math.round(stats.goldPerMinute).toLocaleString()],
    ["킬관여율", formatPercent(stats.killParticipation)],
  ];
  return (
    <section className="surface-card overflow-hidden" aria-label={title}>
      <div className="flex items-center justify-between border-b border-[var(--hairline-soft)] px-4 py-3.5 sm:px-5">
        <div><h4 className="font-bold">{title}</h4><p className="mt-0.5 text-xs text-[var(--muted)]">{subtitle}</p></div>
        <p className="rounded-full bg-[var(--surface-strong)] px-3 py-1 text-xs font-bold tabular-nums">{stats.wins}승 {stats.losses}패</p>
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-3">
        {metrics.map(([label, value], index) => (
          <div key={label} className={`px-4 py-4 sm:px-5 ${index % 2 ? "border-l sm:border-l-0" : ""} ${index % 3 ? "sm:border-l" : ""} ${index >= 2 ? "border-t sm:border-t-0" : ""} ${index >= 3 ? "sm:border-t" : ""} border-[var(--hairline-soft)]`}>
            <dt className="text-xs font-semibold text-[var(--muted)]">{label}</dt>
            <dd className="mt-1 text-lg font-extrabold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Breakdowns({stats}: {stats: PlayerInhouseStats}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="surface-card p-4 sm:p-5" aria-labelledby="role-stats-title">
        <h4 id="role-stats-title" className="font-bold">포지션별 기록</h4>
        <div className="mt-3 space-y-2">
          {ROLES.flatMap((role) => {
            const roleStats = stats.byRole[role];
            return roleStats ? [<BreakdownRow key={role} icon={<LolPositionIcon role={role} size={25} />} label={ROLE_LABEL[role]} stats={roleStats} />] : [];
          })}
        </div>
      </section>
      <section className="surface-card p-4 sm:p-5" aria-labelledby="champion-stats-title">
        <h4 id="champion-stats-title" className="font-bold">많이 플레이한 챔피언</h4>
        <div className="mt-3 space-y-2">
          {stats.champions.map((champion) => (
            <BreakdownRow
              key={champion.champion.id}
              icon={<LolIcon asset={champion.champion} version={champion.ddragonVersion} size={30} className="rounded-md" />}
              label={champion.champion.name}
              stats={champion}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function BreakdownRow({icon, label, stats}: {icon: React.ReactNode; label: string; stats: PlayerStatsLine}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-xl border border-[var(--hairline-soft)] px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">{icon}<span className="truncate text-sm font-bold">{label}</span></div>
      <div className="text-right text-xs text-[var(--muted)]"><p className="font-bold text-[var(--ink)]">{stats.matchCount}경기</p><p>{stats.wins}승 {stats.losses}패</p></div>
      <div className="min-w-16 text-right text-xs"><p className="font-extrabold text-[var(--primary)]">{formatPercent(stats.winRate)}</p><p className="text-[var(--muted)]">{formatKda(stats)} KDA</p></div>
    </div>
  );
}

function RecentMatches({matches}: {matches: PlayerStatsMatch[]}) {
  return (
    <section className="surface-card p-4 sm:p-5" aria-labelledby="recent-matches-title">
      <div className="flex items-center justify-between gap-3"><h4 id="recent-matches-title" className="font-bold">최근 경기</h4><p className="text-xs text-[var(--muted)]">최대 10경기</p></div>
      <div className="mt-3 divide-y divide-[var(--hairline-soft)] rounded-xl border border-[var(--hairline-soft)]">
        {matches.map((match) => <MatchRow key={match.matchResultId} match={match} />)}
      </div>
    </section>
  );
}

function MatchRow({match}: {match: PlayerStatsMatch}) {
  const won = match.result === "WIN";
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 sm:grid-cols-[88px_minmax(0,1fr)_110px_100px] sm:px-4">
      <div><p className={`text-sm font-extrabold ${won ? "text-[#3269bd]" : "text-[#c43652]"}`}>{won ? "승리" : "패배"}</p><p className="mt-0.5 text-[11px] text-[var(--muted)]">{formatDate(match.playedOn)}</p></div>
      <div className="flex min-w-0 items-center gap-2.5"><LolIcon asset={match.champion} version={match.ddragonVersion} size={34} className="rounded-md" /><div className="min-w-0"><p className="truncate text-sm font-bold">{match.champion.name}</p><p className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--muted)]"><LolPositionIcon role={match.role} size={13} />{ROLE_LABEL[match.role]}</p></div></div>
      <div className="text-right"><p className="text-sm font-bold tabular-nums">{match.kills} / {match.deaths} / {match.assists}</p><p className="mt-0.5 text-[11px] text-[var(--muted)]">{formatKdaRatio(match.kills, match.deaths, match.assists)} KDA</p></div>
      <div className="hidden text-right text-xs text-[var(--muted)] sm:block"><p>CS {match.csPerMinute.toFixed(1)}/분</p><p className="mt-0.5">{Math.round(match.goldPerMinute).toLocaleString()} G/분</p></div>
    </div>
  );
}

function HeadToHeadSection({player, players, accounts, opponents}: {
  player: PlayerProfile;
  players: PlayerProfile[];
  accounts: MatchHistoryAccount[];
  opponents: PlayerHeadToHeadStats[];
}) {
  const [query, setQuery] = useState("");
  const [selectedOpponentId, setSelectedOpponentId] = useState(opponents[0]?.opponentDiscordUserId ?? null);
  const playerById = useMemo(() => new Map(players.map((entry) => [entry.discordUserId, entry])), [players]);
  const normalizedQuery = playerNameKey(query);
  const filtered = opponents.filter((opponent) => {
    const identity = playerById.get(opponent.opponentDiscordUserId);
    return !normalizedQuery || (identity && buildPlayerSearchText(identity, accounts).includes(normalizedQuery));
  });
  const selected = opponents.find((opponent) => opponent.opponentDiscordUserId === selectedOpponentId) ?? opponents[0];

  return (
    <section className="surface-card p-4 sm:p-5" aria-labelledby="head-to-head-title">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h4 id="head-to-head-title" className="font-bold">상대전적</h4><p className="mt-1 text-xs text-[var(--muted)]">상대 팀으로 만난 경기만 집계합니다.</p></div>{selected && <p className="text-xs font-semibold text-[var(--muted)]">{opponents.length}명의 상대</p>}</div>
      {!opponents.length ? (
        <div className="mt-4 rounded-xl border border-dashed border-[var(--hairline)] py-12 text-center text-sm text-[var(--muted)]">아직 상대 팀으로 만난 기록이 없습니다.</div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div>
            <label htmlFor="opponent-search" className="sr-only">상대 검색</label>
            <input id="opponent-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="상대 검색" className="form-control mt-0 min-h-10 py-2" />
            <div className="mt-2 max-h-[430px] space-y-1.5 overflow-y-auto" aria-label="상대 목록">
              {filtered.map((opponent) => {
                const active = selected?.opponentDiscordUserId === opponent.opponentDiscordUserId;
                return (
                  <button key={opponent.opponentDiscordUserId} type="button" aria-pressed={active} onClick={() => setSelectedOpponentId(opponent.opponentDiscordUserId)} className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left ${active ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--hairline-soft)] hover:bg-[var(--surface-soft)]"}`}>
                    <span className="min-w-0"><span className="block truncate text-sm font-bold">{opponent.opponentDisplayName}</span><span className="mt-0.5 block text-[11px] text-[var(--muted)]">최근 {formatDate(opponent.lastPlayedOn)}</span></span>
                    <span className="ml-2 shrink-0 text-right text-xs"><span className="block font-extrabold">{opponent.matchCount}전</span><span className="text-[var(--muted)]">{opponent.player.wins}승 {opponent.player.losses}패</span></span>
                  </button>
                );
              })}
              {!filtered.length && <p className="py-8 text-center text-sm text-[var(--muted)]">검색 결과가 없습니다.</p>}
            </div>
          </div>
          {selected && <HeadToHeadDetail playerName={player.displayName} opponent={selected} />}
        </div>
      )}
    </section>
  );
}

function HeadToHeadDetail({playerName, opponent}: {playerName: string; opponent: PlayerHeadToHeadStats}) {
  return (
    <div className="min-w-0">
      <div className="overflow-hidden rounded-xl border border-[var(--hairline-soft)]">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 bg-[var(--surface-soft)] px-4 py-4 text-center">
          <div><p className="truncate font-extrabold">{playerName}</p><p className="mt-1 text-2xl font-black text-[#3269bd]">{opponent.player.wins}승</p></div>
          <div><p className="text-xs font-bold text-[var(--muted)]">맞대결</p><p className="mt-1 text-lg font-black tabular-nums">{opponent.matchCount}</p></div>
          <div><p className="truncate font-extrabold">{opponent.opponentDisplayName}</p><p className="mt-1 text-2xl font-black text-[#c43652]">{opponent.opponent.wins}승</p></div>
        </div>
        <div className="divide-y divide-[var(--hairline-soft)] bg-white">
          <ComparisonMetric label="승률" left={formatPercent(opponent.player.winRate)} right={formatPercent(opponent.opponent.winRate)} />
          <ComparisonMetric label="평균 K/D/A" left={formatAverageKda(opponent.player)} right={formatAverageKda(opponent.opponent)} />
          <ComparisonMetric label="KDA" left={formatKda(opponent.player)} right={formatKda(opponent.opponent)} />
          <ComparisonMetric label="CS/분" left={opponent.player.csPerMinute.toFixed(1)} right={opponent.opponent.csPerMinute.toFixed(1)} />
          <ComparisonMetric label="골드/분" left={Math.round(opponent.player.goldPerMinute).toLocaleString()} right={Math.round(opponent.opponent.goldPerMinute).toLocaleString()} />
        </div>
      </div>
      <h5 className="mt-5 text-sm font-bold">최근 맞대결</h5>
      <div className="mt-2 divide-y divide-[var(--hairline-soft)] rounded-xl border border-[var(--hairline-soft)]">
        {opponent.recentMatches.map((match) => (
          <div key={match.matchResultId} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 py-3 text-xs sm:gap-4 sm:px-4">
            <HeadToHeadPlayer match={match.player} align="right" />
            <div className="text-center"><p className={`font-extrabold ${match.player.result === "WIN" ? "text-[#3269bd]" : "text-[#c43652]"}`}>{match.player.result === "WIN" ? "승" : "패"}</p><p className="mt-0.5 text-[10px] text-[var(--muted)]">{formatDate(match.playedOn)}</p></div>
            <HeadToHeadPlayer match={match.opponent} align="left" />
          </div>
        ))}
      </div>
    </div>
  );
}

function HeadToHeadPlayer({match, align}: {match: PlayerStatsMatch; align: "left" | "right"}) {
  return (
    <div className={`flex min-w-0 items-center gap-2 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <LolIcon asset={match.champion} version={match.ddragonVersion} size={30} className="shrink-0 rounded-md" />
      <div className="min-w-0"><p className="truncate font-bold">{match.champion.name} · {ROLE_LABEL[match.role]}</p><p className="mt-0.5 tabular-nums text-[var(--muted)]">{match.kills}/{match.deaths}/{match.assists}</p></div>
    </div>
  );
}

function ComparisonMetric({label, left, right}: {label: string; left: string; right: string}) {
  return <dl className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-2.5 text-sm"><dd className="text-right font-bold tabular-nums">{left}</dd><dt className="min-w-20 text-center text-xs font-semibold text-[var(--muted)]">{label}</dt><dd className="font-bold tabular-nums">{right}</dd></dl>;
}

export function buildPlayerSearchText(player: PlayerProfile, accounts: MatchHistoryAccount[]) {
  const aliases = accounts.filter((account) => account.discordUserId === player.discordUserId)
    .flatMap((account) => [account.riotGameName, `${account.riotGameName}#${account.riotTagLine}`]);
  return [player.displayName, player.riotGameName, `${player.riotGameName}#${player.riotTagLine}`, ...aliases]
    .map(playerNameKey).join(" ");
}

function formatAverageKda(stats: PlayerStatsLine) {
  return `${stats.averageKills.toFixed(1)} / ${stats.averageDeaths.toFixed(1)} / ${stats.averageAssists.toFixed(1)}`;
}

function formatKda(stats: PlayerStatsLine) {
  if (!stats.matchCount) return "-";
  return stats.kda === null ? "Perfect" : stats.kda.toFixed(2);
}

const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;
const formatDate = (value: string) => new Intl.DateTimeFormat("ko-KR", {month: "short", day: "numeric", timeZone: "Asia/Seoul"}).format(new Date(`${value}T00:00:00+09:00`));
