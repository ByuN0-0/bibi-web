import type {Metadata} from "next";
import Link from "next/link";
import Header from "@/app/components/Header";
import Footer from "@/app/components/Footer";
import PublicLolHub from "@/app/lol-statics/components/PublicLolHub";
import {listPlayers} from "@/lib/lol/repository";

export const metadata: Metadata = {
  title: "롤 내전 | 비비",
  description: "등록 선수의 최근 전적을 반영해 LoL 내전 팀을 편성하고 지난 경기 기록을 확인합니다.",
};

export const dynamic = "force-dynamic";

export default async function LolMemberPage({searchParams}: {searchParams: Promise<{tab?: string}>}) {
  let players = [] as Awaited<ReturnType<typeof listPlayers>>;
  let loadFailed = false;
  try {
    players = await listPlayers();
  } catch (error) {
    loadFailed = true;
    const message = error instanceof Error ? error.message : "unknown";
    console.error(`[lol-member] player storage error: ${message}`);
  }

  const {tab} = await searchParams;
  return (
    <div className="min-h-screen bg-[var(--surface-soft)]">
      <Header />
      <main className="page-shell pb-16 pt-32 sm:pb-20 sm:pt-36">
        <div className="mb-9 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow">BIBI LoL</p>
            <h1 className="mt-3 text-3xl font-bold tracking-[-0.03em] sm:text-4xl">롤 내전</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base sm:leading-7">
              최근 전적을 반영해 팀을 편성하고, 친구들과 진행한 내전 경기 기록을 확인하세요.
            </p>
          </div>
          <Link href="/lol-statics/login" className="secondary-button self-start sm:self-auto">관리자 화면</Link>
        </div>
        <PublicLolHub players={players} playerLoadFailed={loadFailed} initialTab={tab === "history" ? "history" : "team"} />
      </main>
      <Footer />
    </div>
  );
}
