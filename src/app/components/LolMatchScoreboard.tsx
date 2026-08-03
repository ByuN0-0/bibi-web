import LolIcon from "@/app/components/LolIcon";
import {LolPositionIcon} from "@/app/components/LolGameUiIcon";
import RankTierIcon from "@/app/lol-statics/components/RankTierIcon";
import {comparisonShare, formatCsPerMinute, formatKdaRatio, playerNameKey, sortParticipantsByRole} from "@/lib/lol/match-history-view";
import type {MatchObjectives, MatchResult, MatchResultParticipant, MatchResultTeamStats, MatchTeam, PublicMatchResult, PublicMatchResultParticipant} from "@/lib/lol/types";

const OBJECTIVES: Array<[keyof MatchObjectives, string]> = [
  ["turretsDestroyed", "포탑"],
  ["inhibitorsDestroyed", "억제기"],
  ["baronKills", "내셔"],
  ["dragonKills", "드래곤"],
  ["riftHeraldKills", "전령"],
  ["voidGrubKills", "공허 유충"],
];

type ScoreboardParticipant = MatchResultParticipant | PublicMatchResultParticipant;
export type MatchPlayerRankMap = Record<string, {rank: string; queue: "솔랭" | "자랭" | "랭크"}>;

export default function LolMatchScoreboard({result, compact = false, playerRanks}: {
  result: MatchResult | PublicMatchResult;
  compact?: boolean;
  playerRanks?: MatchPlayerRankMap;
}) {
  const blueStats = result.teamStats.find((stats) => stats.team === "BLUE")!;
  const redStats = result.teamStats.find((stats) => stats.team === "RED")!;
  const blueParticipants = sortParticipantsByRole(result.participants.filter((participant) => participant.team === "BLUE"));
  const redParticipants = sortParticipantsByRole(result.participants.filter((participant) => participant.team === "RED"));

  return (
    <div className={`overflow-hidden border border-[var(--hairline)] bg-white ${compact ? "rounded-xl" : "rounded-2xl"}`}>
      <TeamScoreboard team="BLUE" winner={result.winner === "BLUE"} version={result.ddragonVersion} durationSeconds={result.durationSeconds} stats={blueStats} participants={blueParticipants} compact={compact} playerRanks={playerRanks} />
      <TeamComparison blue={blueStats} red={redStats} compact={compact} />
      <TeamScoreboard team="RED" winner={result.winner === "RED"} version={result.ddragonVersion} durationSeconds={result.durationSeconds} stats={redStats} participants={redParticipants} compact={compact} playerRanks={playerRanks} />
    </div>
  );
}

function TeamScoreboard({team, winner, version, durationSeconds, stats, participants, compact, playerRanks}: {
  team: MatchTeam;
  winner: boolean;
  version: string;
  durationSeconds: number;
  stats: MatchResultTeamStats;
  participants: ScoreboardParticipant[];
  compact: boolean;
  playerRanks?: MatchPlayerRankMap;
}) {
  const blue = team === "BLUE";
  return (
    <section aria-label={`${blue ? "블루" : "레드"} 팀 점수판`}>
      <header className={`flex flex-wrap items-center justify-between gap-3 border-b border-[var(--hairline-soft)] ${compact ? "px-3 py-2.5" : "px-4 py-4 sm:px-5"} ${blue ? "bg-[#eef5ff]" : "bg-[#fff1f3]"}`}>
        <div className="flex items-baseline gap-2">
          <p className={`text-sm font-extrabold ${blue ? "text-[#3269bd]" : "text-[#c43652]"}`}>{winner ? "승리" : "패배"} · {blue ? "블루 팀" : "레드 팀"}</p>
          <p className="text-xs font-semibold tabular-nums text-[var(--muted)]">{stats.kills} / {stats.deaths} / {stats.assists}</p>
          <p className="hidden text-[11px] leading-none text-[var(--muted)] sm:block">{stats.goldTotal.toLocaleString()} 골드</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold leading-none text-[var(--muted)]">밴</span>
          <div className="flex gap-1" aria-label={`${blue ? "블루" : "레드"} 팀 밴`}>
            {stats.bans.map((ban, index) => <LolIcon key={index} asset={ban} version={version} size={compact ? 24 : 28} />)}
          </div>
        </div>
      </header>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[860px] border-collapse text-xs">
          <thead className="bg-[var(--surface-soft)] text-left text-[11px] font-semibold uppercase leading-none tracking-wide text-[var(--muted)]">
            <tr><th className="px-3 py-2">선수</th><th className="px-3 py-2">룬·주문</th><th className="px-3 py-2 text-center">K/D/A</th><th className="px-3 py-2 text-right">CS</th><th className="px-3 py-2 text-right">골드</th><th className="px-3 py-2">아이템</th></tr>
          </thead>
          <tbody>{participants.map((participant, index) => <DesktopPlayerRow key={`${participant.role}-${participant.observedName}-${index}`} participant={participant} version={version} durationSeconds={durationSeconds} compact={compact} playerRank={playerRanks?.[playerNameKey(participant.observedName)]} />)}</tbody>
        </table>
      </div>
      <div className="divide-y divide-[var(--hairline-soft)] md:hidden">
        {participants.map((participant, index) => <MobilePlayerCard key={`${participant.role}-${participant.observedName}-${index}`} participant={participant} version={version} durationSeconds={durationSeconds} compact={compact} playerRank={playerRanks?.[playerNameKey(participant.observedName)]} />)}
      </div>
    </section>
  );
}

function TeamComparison({blue, red, compact}: {blue: MatchResultTeamStats; red: MatchResultTeamStats; compact: boolean}) {
  return (
    <section aria-label="팀 기록 비교" className={`border-y border-[var(--hairline)] bg-[#f5f6f8] ${compact ? "px-3 py-2" : "px-4 py-5 sm:px-5"}`}>
      <div className={compact ? "space-y-1.5" : "space-y-2.5"}>
        <ComparisonBar label="총 킬" blue={blue.kills} red={red.kills} />
        <ComparisonBar label="총 골드" blue={blue.goldTotal} red={red.goldTotal} formatValue={(value) => `${(value / 1000).toFixed(1)}K`} />
      </div>
      <div className={`grid grid-cols-3 divide-x divide-[var(--hairline)] sm:grid-cols-6 ${compact ? "mt-2 text-[11px] leading-none" : "mt-3 text-xs"}`}>
        {OBJECTIVES.map(([field, label]) => (
          <div key={field} className={`${compact ? "py-0.5" : "py-1.5"} px-1 text-center`}>
            <p className="font-semibold text-[var(--muted)]">{label}</p>
            <p className={`${compact ? "mt-1 text-xs" : "mt-0.5"} font-bold tabular-nums`}><span className="text-[#3269bd]">{blue.objectives[field]}</span><span className="mx-1.5 text-[var(--muted-soft)]">:</span><span className="text-[#c43652]">{red.objectives[field]}</span></p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ComparisonBar({label, blue, red, formatValue = (value) => value.toLocaleString()}: {
  label: string;
  blue: number;
  red: number;
  formatValue?: (value: number) => string;
}) {
  const blueShare = comparisonShare(blue, red);
  return (
    <div className="grid grid-cols-[minmax(52px,1fr)_minmax(120px,520px)_minmax(52px,1fr)] items-center gap-3 sm:gap-5">
      <span className="text-right text-sm font-extrabold leading-none tabular-nums text-[#3269bd]">{formatValue(blue)}</span>
      <div className="min-w-0">
        <p className="mb-1 text-center text-xs font-bold leading-none text-[var(--muted)]">{label}</p>
        <div className="flex h-2 overflow-hidden rounded-full bg-[var(--hairline)]" aria-label={`${label} 블루 ${formatValue(blue)}, 레드 ${formatValue(red)}`}>
          <span className="bg-[#4f83e3]" style={{width: `${blueShare}%`}} />
          <span className="flex-1 bg-[#e94f6d]" />
        </div>
      </div>
      <span className="text-sm font-extrabold leading-none tabular-nums text-[#c43652]">{formatValue(red)}</span>
    </div>
  );
}

function DesktopPlayerRow({participant, version, durationSeconds, compact, playerRank}: {participant: ScoreboardParticipant; version: string; durationSeconds: number; compact: boolean; playerRank?: MatchPlayerRankMap[string]}) {
  const iconSize = compact ? 32 : 38;
  return (
    <tr className="border-t border-[var(--hairline-soft)] bg-white hover:bg-[var(--surface-soft)]">
      <td className={compact ? "px-3 py-1" : "px-3 py-2.5"}><div className="flex items-center gap-2.5"><LolIcon asset={participant.champion} version={version} size={iconSize} /><div className="min-w-0"><p className="flex max-w-52 items-center gap-1.5 font-semibold"><LolPositionIcon role={participant.role} size={compact ? 14 : 16} /><span className="truncate" title={participant.observedName}>{participant.observedName}</span></p><PlayerMeta participant={participant} playerRank={playerRank} /></div></div></td>
      <td className={compact ? "px-3 py-1" : "px-3 py-2.5"}><div className="flex gap-1"><LolIcon asset={participant.primaryPerk} version={version} size={compact ? 24 : 28} />{participant.summonerSpells.map((spell, index) => <LolIcon key={index} asset={spell} version={version} size={compact ? 24 : 28} />)}</div></td>
      <td className={`${compact ? "px-2 py-1" : "px-3 py-2.5"} text-center tabular-nums`}><p className="font-bold">{participant.kills} / {participant.deaths} / {participant.assists}</p><p className="mt-px text-[11px] leading-none text-[var(--muted)]">{formatKdaRatio(participant.kills, participant.deaths, participant.assists)} KDA</p></td>
      <td className={`${compact ? "px-2 py-1" : "px-3 py-2.5"} text-right tabular-nums`}><p>{participant.cs}</p><p className="mt-px text-[11px] leading-none text-[var(--muted)]">{formatCsPerMinute(participant.cs, durationSeconds)}/분</p></td>
      <td className={`${compact ? "px-2 py-1" : "px-3 py-2.5"} text-right tabular-nums`}>{participant.goldEarned.toLocaleString()}</td>
      <td className={compact ? "px-3 py-1" : "px-3 py-2.5"}><Inventory participant={participant} version={version} size={compact ? 24 : 28} /></td>
    </tr>
  );
}

function MobilePlayerCard({participant, version, durationSeconds, compact, playerRank}: {participant: ScoreboardParticipant; version: string; durationSeconds: number; compact: boolean; playerRank?: MatchPlayerRankMap[string]}) {
  return (
    <article className={`bg-white ${compact ? "p-2.5" : "p-4"}`}>
      <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-2.5"><LolIcon asset={participant.champion} version={version} size={compact ? 34 : 42} /><div className="min-w-0"><p className="flex items-center gap-1.5 text-sm font-semibold"><LolPositionIcon role={participant.role} size={compact ? 14 : 16} /><span className="truncate" title={participant.observedName}>{participant.observedName}</span></p><PlayerMeta participant={participant} playerRank={playerRank} /></div></div><div className="shrink-0 text-right tabular-nums"><p className="text-sm font-bold">{participant.kills}/{participant.deaths}/{participant.assists}</p><p className="mt-px text-[11px] leading-none text-[var(--muted)]">{formatKdaRatio(participant.kills, participant.deaths, participant.assists)} KDA</p></div></div>
      <div className={`${compact ? "mt-2" : "mt-3"} flex flex-wrap items-center justify-between gap-2`}><div className="flex gap-1"><LolIcon asset={participant.primaryPerk} version={version} size={compact ? 22 : 26} />{participant.summonerSpells.map((spell, index) => <LolIcon key={index} asset={spell} version={version} size={compact ? 22 : 26} />)}</div><p className="text-xs text-[var(--muted)]">CS {participant.cs} · {formatCsPerMinute(participant.cs, durationSeconds)}/분 · {participant.goldEarned.toLocaleString()} G</p></div>
      <div className={compact ? "mt-2" : "mt-3"}><Inventory participant={participant} version={version} size={compact ? 22 : 28} /></div>
    </article>
  );
}

function PlayerMeta({participant, playerRank}: {participant: ScoreboardParticipant; playerRank?: MatchPlayerRankMap[string]}) {
  return (
    <p className="mt-px flex min-h-[18px] items-center gap-1 text-[11px] leading-none text-[var(--muted)]">
      {playerRank && <><RankTierIcon rank={playerRank.rank} size={18} /><span>현재 {playerRank.rank} · {playerRank.queue}</span><span aria-hidden="true">·</span></>}
      <span className="truncate">Lv.{participant.level} · {participant.champion.name}{participant.guest ? " · 게스트" : ""}</span>
    </p>
  );
}

function Inventory({participant, version, size = 28}: {participant: ScoreboardParticipant; version: string; size?: number}) {
  return <div className="flex gap-1">{participant.items.map((item, index) => <LolIcon key={index} asset={item} version={version} size={size} />)}<span className="mx-0.5 border-l border-[var(--hairline)]" /><LolIcon asset={participant.trinket} version={version} size={size} /><LolIcon asset={participant.questSlot} version={version} size={size} /></div>;
}
