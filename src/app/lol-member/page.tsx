import type {Metadata} from "next";
import Link from "next/link";
import Header from "@/app/components/Header";
import Footer from "@/app/components/Footer";
import TeamBuilder from "@/app/lol-statics/components/TeamBuilder";
import {listPlayers} from "@/lib/lol/repository";

export const metadata: Metadata = {
  title: "롤 내전 팀 편성 | 비비",
  description: "등록된 선수 10명을 골라 최근 전적과 선호 포지션을 반영한 LoL 내전 팀을 편성합니다.",
};

export const dynamic = "force-dynamic";

export default async function LolMemberPage() {
  let players = [] as Awaited<ReturnType<typeof listPlayers>>;
  let loadFailed = false;
  try {
    players = await listPlayers();
  } catch (error) {
    loadFailed = true;
    const message = error instanceof Error ? error.message : "unknown";
    console.error(`[lol-member] player storage error: ${message}`);
  }

  return (
    <div className="min-h-screen bg-[var(--surface-soft)]">
      <Header />
      <main className="page-shell pb-16 pt-32 sm:pb-20 sm:pt-36">
        <div className="mb-9 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow">LoL team balancer</p>
            <h1 className="mt-3 text-3xl font-bold tracking-[-0.03em] sm:text-4xl">롤 내전 팀 편성</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base sm:leading-7">
              갱신이 완료된 선수 중 10명을 선택하면 최근 전적과 선호 포지션을 반영해 팀을 나눕니다.
              결과는 관리자 내전 기록에 저장되지 않습니다.
            </p>
          </div>
          <Link href="/lol-statics/login" className="secondary-button self-start sm:self-auto">관리자 화면</Link>
        </div>
        {loadFailed ? (
          <div className="surface-card border-[#f2d28b] bg-[var(--warning-soft)] px-5 py-12 text-center">
            <p className="font-semibold text-[var(--warning)]">선수 목록을 불러오지 못했습니다.</p>
            <p className="mt-2 text-sm text-[var(--muted)]">잠시 후 페이지를 새로고침해 주세요.</p>
          </div>
        ) : <TeamBuilder players={players} publicMode />}
      </main>
      <Footer />
    </div>
  );
}
