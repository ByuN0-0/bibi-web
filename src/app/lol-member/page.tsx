import type {Metadata} from "next";
import Link from "next/link";
import TeamBuilder from "@/app/lol-statics/components/TeamBuilder";
import {listPlayers} from "@/lib/lol/repository";

export const metadata: Metadata = {
  title: "롤 팀 편성 | 비비",
  description: "등록된 선수 10명을 골라 균형 잡힌 롤 내전 팀을 편성합니다.",
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
    <main className="min-h-screen bg-[#080d17] text-slate-100">
      <header className="border-b border-white/10 bg-[#080d17]/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="font-bold tracking-tight">BIBI</Link>
          <Link href="/lol-statics/login" className="text-xs text-slate-500 transition hover:text-slate-300">
            관리자
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="mb-8">
          <p className="text-sm font-medium text-cyan-300">LOL MEMBER</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">롤 내전 팀 편성</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            갱신이 완료된 선수 중 10명을 선택하면 최근 전적과 선호 포지션을 반영해 팀을 나눕니다.
            로그인 없이 누구나 사용할 수 있으며 결과는 내전 기록에 저장되지 않습니다.
          </p>
        </div>
        {loadFailed ? (
          <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.07] px-5 py-10 text-center">
            <p className="font-semibold text-amber-100">선수 목록을 불러오지 못했습니다.</p>
            <p className="mt-2 text-sm text-amber-100/60">잠시 후 페이지를 새로고침해 주세요.</p>
          </div>
        ) : <TeamBuilder players={players} publicMode />}
      </div>
    </main>
  );
}
