import type {Metadata} from "next";
import Link from "next/link";
import PublicLolHub from "@/app/lol-statics/components/PublicLolHub";
import {
  sortPlayersByParticipation,
  summarizePlayerParticipation,
} from "@/lib/lol/player-participation";
import type {MatchHistoryAccount} from "@/lib/lol/match-history-view";
import {listMatchResults, listPlayerAccounts, listPlayers} from "@/lib/lol/repository";

export const metadata: Metadata = {
  title: "롤 내전 팀 편성 | 비비",
  description: "등록 선수의 내전 참가 기록과 최근 전적을 반영해 LoL 내전 팀을 편성하고 지난 경기 기록을 확인합니다.",
};

export const dynamic = "force-dynamic";

export default async function Home({searchParams}: {searchParams: Promise<{tab?: string}>}) {
  let players = [] as Awaited<ReturnType<typeof listPlayers>>;
  let accounts: MatchHistoryAccount[] = [];
  let participation = {} as ReturnType<typeof summarizePlayerParticipation>;
  let loadFailed = false;
  try {
    const [loadedPlayers, loadedAccounts, results] = await Promise.all([listPlayers(), listPlayerAccounts(), listMatchResults()]);
    participation = summarizePlayerParticipation(results);
    players = sortPlayersByParticipation(loadedPlayers, participation);
    accounts = loadedAccounts.map(({discordUserId, riotGameName, riotTagLine, soloRank, flexRank}) => ({discordUserId, riotGameName, riotTagLine, soloRank, flexRank}));
  } catch (error) {
    loadFailed = true;
    const message = error instanceof Error ? error.message : "unknown";
    console.error(`[home] LoL storage error: ${message}`);
  }

  const {tab} = await searchParams;
  return (
    <main className="min-h-[calc(100vh-72px)] bg-[var(--surface-soft)] pb-14 pt-20 sm:pb-16 sm:pt-24">
      <div className="page-shell">
        <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow">BIBI LoL</p>
            <h1 className="mt-1.5 text-2xl font-bold tracking-[-0.03em] sm:text-3xl">롤 내전</h1>
            <p className="mt-2 max-w-2xl text-sm leading-5 text-[var(--muted)]">
              자주 함께한 선수부터 빠르게 고르고, 최근 전적을 반영해 균형 잡힌 팀을 만들어 보세요.
            </p>
          </div>
          <Link href="/lol-statics/login" className="secondary-button min-h-10 self-start px-4 sm:self-auto">관리자 화면</Link>
        </div>
        <PublicLolHub
          players={players}
          accounts={accounts}
          playerParticipation={participation}
          playerLoadFailed={loadFailed}
          initialTab={tab === "history" ? "history" : "team"}
        />
      </div>
    </main>
  );
}
