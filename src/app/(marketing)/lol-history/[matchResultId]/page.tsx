import Link from "next/link";
import {notFound} from "next/navigation";
import LolMatchScoreboard from "@/app/components/LolMatchScoreboard";
import {findMatchResult} from "@/lib/lol/repository";

export const dynamic = "force-dynamic";

export default async function LolHistoryDetailPage({params}: {params: Promise<{matchResultId: string}>}) {
  const {matchResultId} = await params;
  const document = await findMatchResult(matchResultId);
  if (!document) notFound();
  const result = document.value;
  return (
    <main className="min-h-[70vh] pt-[72px]">
      <div className="page-shell py-10 sm:py-14">
        <Link href="/lol-history" className="text-sm font-semibold text-[var(--primary)]">← 내전 경기 기록</Link>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div><p className="eyebrow">Match Scoreboard</p><h1 className="mt-3 text-3xl font-bold tracking-[-0.03em]">{result.winner === "BLUE" ? "블루 팀 승리" : "레드 팀 승리"}</h1><p className="mt-2 text-sm text-[var(--muted)]">{result.playedOn} · {Math.floor(result.durationSeconds / 60)}분 {String(result.durationSeconds % 60).padStart(2, "0")}초</p></div>
          <p className="text-xs text-[var(--muted)]">Data Dragon {result.ddragonVersion}</p>
        </div>
        <div className="mt-8"><LolMatchScoreboard result={result} /></div>
      </div>
    </main>
  );
}
