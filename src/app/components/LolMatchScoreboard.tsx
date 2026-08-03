import LolIcon from "@/app/components/LolIcon";
import {comparisonShare, sortParticipantsByRole} from "@/lib/lol/match-history-view";
import type {MatchObjectives, MatchResult, MatchResultParticipant, MatchResultTeamStats, MatchTeam, PublicMatchResult, PublicMatchResultParticipant} from "@/lib/lol/types";
import {ROLE_LABEL} from "@/lib/lol/types";

const OBJECTIVES: Array<[keyof MatchObjectives, string]> = [
  ["turretsDestroyed", "포탑"],
  ["inhibitorsDestroyed", "억제기"],
  ["baronKills", "내셔"],
  ["dragonKills", "드래곤"],
  ["riftHeraldKills", "전령"],
  ["voidGrubKills", "공허 유충"],
];

type ScoreboardParticipant = MatchResultParticipant | PublicMatchResultParticipant;

export default function LolMatchScoreboard({result, compact = false}: {
  result: MatchResult | PublicMatchResult;
  compact?: boolean;
}) {
  const blueStats = result.teamStats.find((stats) => stats.team === "BLUE")!;
  const redStats = result.teamStats.find((stats) => stats.team === "RED")!;
  const blueParticipants = sortParticipantsByRole(result.participants.filter((participant) => participant.team === "BLUE"));
  const redParticipants = sortParticipantsByRole(result.participants.filter((participant) => participant.team === "RED"));

  return (
    <div className={`overflow-hidden border border-[var(--hairline)] bg-white ${compact ? "rounded-xl" : "rounded-2xl"}`}>
      <TeamScoreboard team="BLUE" winner={result.winner === "BLUE"} version={result.ddragonVersion} stats={blueStats} participants={blueParticipants} compact={compact} />
      <TeamComparison blue={blueStats} red={redStats} compact={compact} />
      <TeamScoreboard team="RED" winner={result.winner === "RED"} version={result.ddragonVersion} stats={redStats} participants={redParticipants} compact={compact} />
    </div>
  );
}

function TeamScoreboard({team, winner, version, stats, participants, compact}: {
  team: MatchTeam;
  winner: boolean;
  version: string;
  stats: MatchResultTeamStats;
  participants: ScoreboardParticipant[];
  compact: boolean;
}) {
  const blue = team === "BLUE";
  return (
    <section aria-label={`${blue ? "블루" : "레드"} 팀 점수판`}>
      <header className={`flex flex-wrap items-center justify-between gap-3 border-b border-[var(--hairline-soft)] ${compact ? "px-3 py-2.5" : "px-4 py-4 sm:px-5"} ${blue ? "bg-[#eef5ff]" : "bg-[#fff1f3]"}`}>
        <div className="flex items-baseline gap-2">
          <p className={`text-sm font-extrabold ${blue ? "text-[#3269bd]" : "text-[#c43652]"}`}>{winner ? "승리" : "패배"} · {blue ? "블루 팀" : "레드 팀"}</p>
          <p className="text-xs font-semibold tabular-nums text-[var(--muted)]">{stats.kills} / {stats.deaths} / {stats.assists}</p>
          <p className="hidden text-[10px] text-[var(--muted)] sm:block">{stats.goldTotal.toLocaleString()} 골드</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-[var(--muted)]">밴</span>
          <div className="flex gap-1" aria-label={`${blue ? "블루" : "레드"} 팀 밴`}>
            {stats.bans.map((ban, index) => <LolIcon key={index} asset={ban} version={version} size={compact ? 24 : 28} />)}
          </div>
        </div>
      </header>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[860px] border-collapse text-xs">
          <thead className="bg-[var(--surface-soft)] text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            <tr><th className="px-3 py-2">선수</th><th className="px-3 py-2">룬·주문</th><th className="px-3 py-2 text-center">K/D/A</th><th className="px-3 py-2 text-right">CS</th><th className="px-3 py-2 text-right">골드</th><th className="px-3 py-2">아이템</th></tr>
          </thead>
          <tbody>{participants.map((participant, index) => <DesktopPlayerRow key={`${participant.role}-${participant.observedName}-${index}`} participant={participant} version={version} compact={compact} />)}</tbody>
        </table>
      </div>
      <div className="divide-y divide-[var(--hairline-soft)] md:hidden">
        {participants.map((participant, index) => <MobilePlayerCard key={`${participant.role}-${participant.observedName}-${index}`} participant={participant} version={version} compact={compact} />)}
      </div>
    </section>
  );
}

function TeamComparison({blue, red, compact}: {blue: MatchResultTeamStats; red: MatchResultTeamStats; compact: boolean}) {
  return (
    <section aria-label="팀 기록 비교" className={`border-y border-[var(--hairline)] bg-[#f5f6f8] ${compact ? "px-3 py-3" : "px-4 py-5 sm:px-5"}`}>
      <div className="mx-auto max-w-4xl space-y-2.5">
        <ComparisonBar label="총 킬" blue={blue.kills} red={red.kills} />
        <ComparisonBar label="총 골드" blue={blue.goldTotal} red={red.goldTotal} formatValue={(value) => `${(value / 1000).toFixed(1)}K`} />
      </div>
      <div className={`mx-auto mt-3 grid max-w-4xl grid-cols-3 divide-x divide-[var(--hairline)] sm:grid-cols-6 ${compact ? "text-[10px]" : "text-xs"}`}>
        {OBJECTIVES.map(([field, label]) => (
          <div key={field} className="px-1 py-1.5 text-center">
            <p className="font-semibold text-[var(--muted)]">{label}</p>
            <p className="mt-0.5 font-bold tabular-nums"><span className="text-[#3269bd]">{blue.objectives[field]}</span><span className="mx-1.5 text-[var(--muted-soft)]">:</span><span className="text-[#c43652]">{red.objectives[field]}</span></p>
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
    <div>
      <div className="mb-1 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-[10px] font-bold tabular-nums">
        <span className="text-[#3269bd]">{formatValue(blue)}</span>
        <span className="font-semibold text-[var(--muted)]">{label}</span>
        <span className="text-right text-[#c43652]">{formatValue(red)}</span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-[var(--hairline)]" aria-label={`${label} 블루 ${formatValue(blue)}, 레드 ${formatValue(red)}`}>
        <span className="bg-[#4f83e3]" style={{width: `${blueShare}%`}} />
        <span className="flex-1 bg-[#e94f6d]" />
      </div>
    </div>
  );
}

function DesktopPlayerRow({participant, version, compact}: {participant: ScoreboardParticipant; version: string; compact: boolean}) {
  const iconSize = compact ? 32 : 38;
  return (
    <tr className="border-t border-[var(--hairline-soft)] bg-white hover:bg-[var(--surface-soft)]">
      <td className={compact ? "px-3 py-1.5" : "px-3 py-2.5"}><div className="flex items-center gap-2.5"><LolIcon asset={participant.champion} version={version} size={iconSize} /><div className="min-w-0"><p className="max-w-52 truncate font-semibold" title={participant.observedName}><span className="mr-1 text-[10px] text-[var(--muted)]">{ROLE_LABEL[participant.role]}</span>{participant.observedName}</p><p className="mt-0.5 text-[10px] text-[var(--muted)]">Lv.{participant.level} · {participant.champion.name}{participant.guest ? " · 게스트" : ""}</p></div></div></td>
      <td className={compact ? "px-3 py-1.5" : "px-3 py-2.5"}><div className="flex gap-1"><LolIcon asset={participant.primaryPerk} version={version} size={compact ? 24 : 28} />{participant.summonerSpells.map((spell, index) => <LolIcon key={index} asset={spell} version={version} size={compact ? 24 : 28} />)}</div></td>
      <td className={`${compact ? "px-2 py-1.5" : "px-3 py-2.5"} text-center font-bold tabular-nums`}>{participant.kills} / {participant.deaths} / {participant.assists}</td>
      <td className={`${compact ? "px-2 py-1.5" : "px-3 py-2.5"} text-right tabular-nums`}>{participant.cs}</td>
      <td className={`${compact ? "px-2 py-1.5" : "px-3 py-2.5"} text-right tabular-nums`}>{participant.goldEarned.toLocaleString()}</td>
      <td className={compact ? "px-3 py-1.5" : "px-3 py-2.5"}><Inventory participant={participant} version={version} size={compact ? 24 : 28} /></td>
    </tr>
  );
}

function MobilePlayerCard({participant, version, compact}: {participant: ScoreboardParticipant; version: string; compact: boolean}) {
  return (
    <article className={`bg-white ${compact ? "p-2.5" : "p-4"}`}>
      <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-2.5"><LolIcon asset={participant.champion} version={version} size={compact ? 34 : 42} /><div className="min-w-0"><p className="truncate text-sm font-semibold" title={participant.observedName}><span className="mr-1 text-[10px] text-[var(--muted)]">{ROLE_LABEL[participant.role]}</span>{participant.observedName}</p><p className="text-[10px] text-[var(--muted)]">Lv.{participant.level} · {participant.champion.name}{participant.guest ? " · 게스트" : ""}</p></div></div><p className="shrink-0 text-sm font-bold tabular-nums">{participant.kills}/{participant.deaths}/{participant.assists}</p></div>
      <div className={`${compact ? "mt-2" : "mt-3"} flex flex-wrap items-center justify-between gap-2`}><div className="flex gap-1"><LolIcon asset={participant.primaryPerk} version={version} size={compact ? 22 : 26} />{participant.summonerSpells.map((spell, index) => <LolIcon key={index} asset={spell} version={version} size={compact ? 22 : 26} />)}</div><p className="text-xs text-[var(--muted)]">CS {participant.cs} · {participant.goldEarned.toLocaleString()} G</p></div>
      <div className={compact ? "mt-2" : "mt-3"}><Inventory participant={participant} version={version} size={compact ? 22 : 28} /></div>
    </article>
  );
}

function Inventory({participant, version, size = 28}: {participant: ScoreboardParticipant; version: string; size?: number}) {
  return <div className="flex gap-1">{participant.items.map((item, index) => <LolIcon key={index} asset={item} version={version} size={size} />)}<span className="mx-0.5 border-l border-[var(--hairline)]" /><LolIcon asset={participant.trinket} version={version} size={size} /><LolIcon asset={participant.questSlot} version={version} size={size} /></div>;
}
