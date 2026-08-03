import Link from "next/link";
import {notFound} from "next/navigation";
import MatchResultEditor from "@/app/lol-statics/components/MatchResultEditor";
import {matchReviewStatus} from "@/lib/lol/match-review";
import {findMatchResult, listPlayers} from "@/lib/lol/repository";

export default async function MatchResultEditPage({params}: {params: Promise<{matchResultId: string}>}) {
  const {matchResultId} = await params;
  const [document, players] = await Promise.all([findMatchResult(matchResultId), listPlayers()]);
  if (!document) notFound();
  const pendingReview = matchReviewStatus(document.value) === "PENDING_REVIEW";
  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="mb-8">
        <Link href="/lol-statics/history" className="text-sm font-semibold text-[var(--primary)]">← 팀·경기 기록</Link>
        <p className="eyebrow mt-5">{pendingReview ? "Review" : "Correction"}</p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.03em]">{pendingReview ? "경기 결과 검토" : "경기 결과 수정"}</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{pendingReview
          ? "기계 판독 결과와 저신뢰 항목을 확인한 뒤 검토를 완료하면 공개 전적과 Elo에 반영됩니다."
          : "블루·레드 양 팀의 점수판을 한 화면에서 수정할 수 있으며, 팀 합계와 Data Dragon 에셋을 저장 전에 다시 검증합니다."}</p>
      </div>
      <MatchResultEditor result={document.value} players={players} />
    </div>
  );
}
