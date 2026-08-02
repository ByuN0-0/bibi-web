import LolIcon from "@/app/components/LolIcon";
import type {MatchObjectives, MatchResult, MatchResultParticipant, MatchResultTeamStats, MatchTeam} from "@/lib/lol/types";

const OBJECTIVES: Array<[keyof MatchObjectives, string]> = [
  ["turretsDestroyed", "포탑"],
  ["inhibitorsDestroyed", "억제기"],
  ["baronKills", "내셔"],
  ["dragonKills", "드래곤"],
  ["riftHeraldKills", "전령"],
  ["voidGrubKills", "공허 유충"],
];

export default function LolMatchScoreboard({result, compact = false}: {result: MatchResult; compact?: boolean}) {
  return (
    <div className={compact ? "space-y-3" : "space-y-6"}>
      {(["BLUE", "RED"] as const).map((team) => (
        <TeamScoreboard
          key={team}
          team={team}
          winner={result.winner === team}
          version={result.ddragonVersion}
          stats={result.teamStats.find((stats) => stats.team === team)!}
          participants={result.participants.filter((participant) => participant.team === team)}
          compact={compact}
        />
      ))}
    </div>
  );
}

function TeamScoreboard({team, winner, version, stats, participants, compact}: {
  team: MatchTeam;
  winner: boolean;
  version: string;
  stats: MatchResultTeamStats;
  participants: MatchResultParticipant[];
  compact: boolean;
}) {
  const blue = team === "BLUE";
  return (
    <section className={`overflow-hidden border ${compact ? "rounded-xl" : "rounded-2xl"} ${blue ? "border-[#c9dcf5]" : "border-[#f0cbd2]"}`}>
      <header className={`flex flex-wrap items-center justify-between ${compact ? "gap-2 px-3 py-2.5" : "gap-4 px-4 py-4 sm:px-5"} ${blue ? "bg-[#f2f7ff]" : "bg-[#fff5f7]"}`}>
        <div>
          <p className={`text-sm font-bold ${blue ? "text-[#2463a5]" : "text-[#b62e49]"}`}>{blue ? "블루 팀" : "레드 팀"} · {winner ? "승리" : "패배"}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">K/D/A {stats.kills}/{stats.deaths}/{stats.assists} · 골드 {stats.goldTotal.toLocaleString()}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1" aria-label={`${blue ? "블루" : "레드"} 팀 밴`}>
            {stats.bans.map((ban, index) => <LolIcon key={index} asset={ban} version={version} size={30} />)}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[var(--muted)]">
            {OBJECTIVES.map(([field, label]) => <span key={field}>{label} <strong className="text-[var(--ink)]">{stats.objectives[field]}</strong></span>)}
          </div>
        </div>
      </header>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[960px] border-collapse text-xs">
          <thead className="bg-[var(--surface-soft)] text-left text-[10px] uppercase tracking-wide text-[var(--muted)]">
            <tr><th className="px-4 py-2">선수</th><th className="px-3 py-2">룬·주문</th><th className="px-3 py-2 text-center">K/D/A</th><th className="px-3 py-2 text-right">CS</th><th className="px-3 py-2 text-right">골드</th><th className="px-4 py-2">아이템</th></tr>
          </thead>
          <tbody>{participants.map((participant, index) => <DesktopPlayerRow key={`${participant.observedName}-${index}`} participant={participant} version={version} compact={compact} />)}</tbody>
        </table>
      </div>
      <div className="divide-y divide-[var(--hairline-soft)] md:hidden">
        {participants.map((participant, index) => <MobilePlayerCard key={`${participant.observedName}-${index}`} participant={participant} version={version} compact={compact} />)}
      </div>
    </section>
  );
}

function DesktopPlayerRow({participant, version, compact}: {participant: MatchResultParticipant; version: string; compact: boolean}) {
  const iconSize = compact ? 32 : 38;
  return (
    <tr className="border-t border-[var(--hairline-soft)] bg-white">
      <td className={compact ? "px-3 py-2" : "px-4 py-3"}><div className="flex items-center gap-2.5"><LolIcon asset={participant.champion} version={version} size={iconSize} /><div><p className="font-semibold">Lv.{participant.level} {participant.observedName}</p><p className="mt-0.5 text-[10px] text-[var(--muted)]">{participant.champion.name}{participant.guest ? " · 게스트" : ""}</p></div></div></td>
      <td className={compact ? "px-3 py-2" : "px-3 py-3"}><div className="flex gap-1"><LolIcon asset={participant.primaryPerk} version={version} size={compact ? 24 : 28} />{participant.summonerSpells.map((spell, index) => <LolIcon key={index} asset={spell} version={version} size={compact ? 24 : 28} />)}</div></td>
      <td className={`${compact ? "px-2 py-2" : "px-3 py-3"} text-center font-semibold`}>{participant.kills} / {participant.deaths} / {participant.assists}</td>
      <td className={`${compact ? "px-2 py-2" : "px-3 py-3"} text-right`}>{participant.cs}</td>
      <td className={`${compact ? "px-2 py-2" : "px-3 py-3"} text-right`}>{participant.goldEarned.toLocaleString()}</td>
      <td className={compact ? "px-3 py-2" : "px-4 py-3"}><Inventory participant={participant} version={version} size={compact ? 24 : 28} /></td>
    </tr>
  );
}

function MobilePlayerCard({participant, version, compact}: {participant: MatchResultParticipant; version: string; compact: boolean}) {
  return (
    <article className={`bg-white ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><LolIcon asset={participant.champion} version={version} size={compact ? 36 : 42} /><div><p className="text-sm font-semibold">Lv.{participant.level} {participant.observedName}</p><p className="text-[10px] text-[var(--muted)]">{participant.champion.name}{participant.guest ? " · 게스트" : ""}</p></div></div><p className="text-sm font-bold">{participant.kills}/{participant.deaths}/{participant.assists}</p></div>
      <div className={`${compact ? "mt-2" : "mt-3"} flex items-center justify-between gap-3`}><div className="flex gap-1"><LolIcon asset={participant.primaryPerk} version={version} size={compact ? 24 : 26} />{participant.summonerSpells.map((spell, index) => <LolIcon key={index} asset={spell} version={version} size={compact ? 24 : 26} />)}</div><p className="text-xs text-[var(--muted)]">CS {participant.cs} · {participant.goldEarned.toLocaleString()} G</p></div>
      <div className={compact ? "mt-2" : "mt-3"}><Inventory participant={participant} version={version} size={compact ? 24 : 28} /></div>
    </article>
  );
}

function Inventory({participant, version, size = 28}: {participant: MatchResultParticipant; version: string; size?: number}) {
  return <div className="flex gap-1">{participant.items.map((item, index) => <LolIcon key={index} asset={item} version={version} size={size} />)}<span className="mx-0.5 border-l border-[var(--hairline)]" /><LolIcon asset={participant.trinket} version={version} size={size} /><LolIcon asset={participant.questSlot} version={version} size={size} /></div>;
}
