import PlayerManager from "@/app/lol-statics/components/PlayerManager";
import {listPlayers} from "@/lib/lol/repository";

export default async function PlayersPage() {
  return <div className="mx-auto max-w-7xl"><div className="mb-8"><p className="eyebrow">Players</p><h1 className="mt-3 text-3xl font-bold tracking-[-0.03em]">선수 관리</h1><p className="mt-3 text-sm leading-6 text-[var(--muted)]">Riot ID 변경은 Java 봇의 재검증과 초기 전적 동기화를 요청합니다.</p></div><PlayerManager initialPlayers={await listPlayers()} /></div>;
}
