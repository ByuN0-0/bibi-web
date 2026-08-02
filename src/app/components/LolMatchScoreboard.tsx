import LolIcon from "@/app/components/LolIcon";
import type {LolAssetRef, MatchObjectives, MatchRecognitionReview, MatchResult, MatchResultDraft, MatchResultParticipant, MatchResultTeamStats, MatchTeam, PublicMatchResult, PublicMatchResultParticipant} from "@/lib/lol/types";
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

export default function LolMatchScoreboard({result, compact = false, reviews = [], confirmedReviewIds = [], onConfirmReview}: {
  result: MatchResult | MatchResultDraft | PublicMatchResult;
  compact?: boolean;
  reviews?: MatchRecognitionReview[];
  confirmedReviewIds?: string[];
  onConfirmReview?: (reviewId: string) => void;
}) {
  const confirmed = new Set(confirmedReviewIds);
  return (
    <div className={compact ? "space-y-3" : "space-y-6"}>
      {(["BLUE", "RED"] as const).map((team) => (
        <TeamScoreboard
          key={team}
          team={team}
          winner={result.winner === team}
          version={result.ddragonVersion}
          stats={result.teamStats.find((stats) => stats.team === team)!}
          participants={result.participants.map((participant, index) => ({participant, index})).filter(({participant}) => participant.team === team)}
          compact={compact}
          reviews={reviews}
          confirmed={confirmed}
          onConfirmReview={onConfirmReview}
        />
      ))}
    </div>
  );
}

function TeamScoreboard({team, winner, version, stats, participants, compact, reviews, confirmed, onConfirmReview}: {
  team: MatchTeam;
  winner: boolean;
  version: string;
  stats: MatchResultTeamStats;
  participants: Array<{participant: ScoreboardParticipant; index: number}>;
  compact: boolean;
  reviews: MatchRecognitionReview[];
  confirmed: Set<string>;
  onConfirmReview?: (reviewId: string) => void;
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
            {stats.bans.map((ban, index) => <ReviewedAsset key={index} asset={ban} version={version} size={30} field={`teamStats[${team === "BLUE" ? 0 : 1}].bans[${index}]`} reviews={reviews} confirmed={confirmed} onConfirm={onConfirmReview} />)}
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
          <tbody>{participants.map(({participant, index}) => <DesktopPlayerRow key={`${participant.observedName}-${index}`} participant={participant} participantIndex={index} version={version} compact={compact} reviews={reviews} confirmed={confirmed} onConfirmReview={onConfirmReview} />)}</tbody>
        </table>
      </div>
      <div className="divide-y divide-[var(--hairline-soft)] md:hidden">
        {participants.map(({participant, index}) => <MobilePlayerCard key={`${participant.observedName}-${index}`} participant={participant} participantIndex={index} version={version} compact={compact} reviews={reviews} confirmed={confirmed} onConfirmReview={onConfirmReview} />)}
      </div>
    </section>
  );
}

function DesktopPlayerRow({participant, participantIndex, version, compact, reviews, confirmed, onConfirmReview}: {participant: ScoreboardParticipant; participantIndex: number; version: string; compact: boolean; reviews: MatchRecognitionReview[]; confirmed: Set<string>; onConfirmReview?: (reviewId: string) => void}) {
  const iconSize = compact ? 32 : 38;
  return (
    <tr className="border-t border-[var(--hairline-soft)] bg-white">
      <td className={compact ? "px-3 py-2" : "px-4 py-3"}><div className="flex items-center gap-2.5"><ReviewedAsset asset={participant.champion} version={version} size={iconSize} field={`participants[${participantIndex}].champion`} reviews={reviews} confirmed={confirmed} onConfirm={onConfirmReview} /><div><p className="font-semibold">{participant.role ? `${ROLE_LABEL[participant.role]} · ` : ""}Lv.{participant.level} {participant.observedName}</p><p className="mt-0.5 text-[10px] text-[var(--muted)]">{participant.champion.name}{participant.guest ? " · 게스트" : ""}</p></div></div></td>
      <td className={compact ? "px-3 py-2" : "px-3 py-3"}><div className="flex gap-1"><ReviewedAsset asset={participant.primaryPerk} version={version} size={compact ? 24 : 28} field={`participants[${participantIndex}].primaryPerk`} reviews={reviews} confirmed={confirmed} onConfirm={onConfirmReview} />{participant.summonerSpells.map((spell, index) => <ReviewedAsset key={index} asset={spell} version={version} size={compact ? 24 : 28} field={`participants[${participantIndex}].summonerSpells[${index}]`} reviews={reviews} confirmed={confirmed} onConfirm={onConfirmReview} />)}</div></td>
      <td className={`${compact ? "px-2 py-2" : "px-3 py-3"} text-center font-semibold`}>{participant.kills} / {participant.deaths} / {participant.assists}</td>
      <td className={`${compact ? "px-2 py-2" : "px-3 py-3"} text-right`}>{participant.cs}</td>
      <td className={`${compact ? "px-2 py-2" : "px-3 py-3"} text-right`}>{participant.goldEarned.toLocaleString()}</td>
      <td className={compact ? "px-3 py-2" : "px-4 py-3"}><Inventory participant={participant} participantIndex={participantIndex} version={version} size={compact ? 24 : 28} reviews={reviews} confirmed={confirmed} onConfirmReview={onConfirmReview} /></td>
    </tr>
  );
}

function MobilePlayerCard({participant, participantIndex, version, compact, reviews, confirmed, onConfirmReview}: {participant: ScoreboardParticipant; participantIndex: number; version: string; compact: boolean; reviews: MatchRecognitionReview[]; confirmed: Set<string>; onConfirmReview?: (reviewId: string) => void}) {
  return (
    <article className={`bg-white ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><ReviewedAsset asset={participant.champion} version={version} size={compact ? 36 : 42} field={`participants[${participantIndex}].champion`} reviews={reviews} confirmed={confirmed} onConfirm={onConfirmReview} /><div><p className="text-sm font-semibold">{participant.role ? `${ROLE_LABEL[participant.role]} · ` : ""}Lv.{participant.level} {participant.observedName}</p><p className="text-[10px] text-[var(--muted)]">{participant.champion.name}{participant.guest ? " · 게스트" : ""}</p></div></div><p className="text-sm font-bold">{participant.kills}/{participant.deaths}/{participant.assists}</p></div>
      <div className={`${compact ? "mt-2" : "mt-3"} flex items-center justify-between gap-3`}><div className="flex gap-1"><ReviewedAsset asset={participant.primaryPerk} version={version} size={compact ? 24 : 26} field={`participants[${participantIndex}].primaryPerk`} reviews={reviews} confirmed={confirmed} onConfirm={onConfirmReview} />{participant.summonerSpells.map((spell, index) => <ReviewedAsset key={index} asset={spell} version={version} size={compact ? 24 : 26} field={`participants[${participantIndex}].summonerSpells[${index}]`} reviews={reviews} confirmed={confirmed} onConfirm={onConfirmReview} />)}</div><p className="text-xs text-[var(--muted)]">CS {participant.cs} · {participant.goldEarned.toLocaleString()} G</p></div>
      <div className={compact ? "mt-2" : "mt-3"}><Inventory participant={participant} participantIndex={participantIndex} version={version} size={compact ? 24 : 28} reviews={reviews} confirmed={confirmed} onConfirmReview={onConfirmReview} /></div>
    </article>
  );
}

function Inventory({participant, participantIndex, version, size = 28, reviews, confirmed, onConfirmReview}: {participant: ScoreboardParticipant; participantIndex: number; version: string; size?: number; reviews: MatchRecognitionReview[]; confirmed: Set<string>; onConfirmReview?: (reviewId: string) => void}) {
  return <div className="flex gap-1">{participant.items.map((item, index) => <ReviewedAsset key={index} asset={item} version={version} size={size} field={`participants[${participantIndex}].items[${index}]`} reviews={reviews} confirmed={confirmed} onConfirm={onConfirmReview} />)}<span className="mx-0.5 border-l border-[var(--hairline)]" /><ReviewedAsset asset={participant.trinket} version={version} size={size} field={`participants[${participantIndex}].trinket`} reviews={reviews} confirmed={confirmed} onConfirm={onConfirmReview} /><ReviewedAsset asset={participant.questSlot} version={version} size={size} field={`participants[${participantIndex}].questSlot`} reviews={reviews} confirmed={confirmed} onConfirm={onConfirmReview} /></div>;
}

function ReviewedAsset({asset, version, size, field, reviews, confirmed, onConfirm}: {asset: LolAssetRef | null; version: string; size: number; field: string; reviews: MatchRecognitionReview[]; confirmed: Set<string>; onConfirm?: (reviewId: string) => void}) {
  const review = reviews.find((entry) => entry.field === field);
  if (!review) return <LolIcon asset={asset} version={version} size={size} />;
  const done = confirmed.has(review.id);
  return <span className={`relative inline-flex shrink-0 rounded-md ring-2 ring-offset-1 ${done ? "ring-[#57a773]" : "ring-[#e3a72f]"}`} title={done ? `${review.selected.name} 확인 완료` : `${review.selected.name} 확인 필요`}><LolIcon asset={asset} version={version} size={size} />{onConfirm && <button type="button" aria-label={`${review.selected.name} 판독 결과가 맞음`} onClick={() => onConfirm(review.id)} disabled={done} className={`absolute -bottom-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[8px] font-bold shadow ${done ? "bg-[#e8f6ed] text-[#287a45]" : "bg-[#fff1cf] text-[#8b5b00]"}`}>{done ? "확인됨" : "맞음"}</button>}</span>;
}
