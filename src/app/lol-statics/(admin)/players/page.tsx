import PlayerManager from "@/app/lol-statics/components/PlayerManager";
import {listPlayers} from "@/lib/lol/repository";

export default async function PlayersPage() {
  return <div className="mx-auto max-w-7xl"><div className="mb-8"><p className="text-sm font-medium text-cyan-300">PLAYERS</p><h1 className="mt-2 text-3xl font-bold">선수 관리</h1><p className="mt-2 text-sm text-slate-400">Riot ID 변경은 Java 봇의 재검증과 초기 전적 동기화를 요청합니다.</p></div><PlayerManager initialPlayers={await listPlayers()} /></div>;
}
