"use client";

import {useEffect, useRef, useState} from "react";
import {useRouter} from "next/navigation";
import TeamBuilder from "@/app/lol-statics/components/TeamBuilder";
import PublicMatchHistory from "@/app/lol-statics/components/PublicMatchHistory";
import PublicPlayerStats from "@/app/lol-statics/components/PublicPlayerStats";
import type {MatchHistoryAccount} from "@/lib/lol/match-history-view";
import type {PlayerParticipationMap} from "@/lib/lol/player-participation";
import type {PlayerInhouseStatsMap} from "@/lib/lol/player-stats";
import type {PlayerProfile, PublicMatchResult} from "@/lib/lol/types";

type HubTab = "team" | "history" | "stats";

export default function PublicLolHub({players, accounts, playerParticipation, playerStats, playerLoadFailed, initialTab}: {
  players: PlayerProfile[];
  accounts: MatchHistoryAccount[];
  playerParticipation: PlayerParticipationMap;
  playerStats: PlayerInhouseStatsMap;
  playerLoadFailed: boolean;
  initialTab: HubTab;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<HubTab>(initialTab);
  const [results, setResults] = useState<PublicMatchResult[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const historyRequestPending = useRef(false);

  useEffect(() => {
    setTab(initialTab);
    if (initialTab === "history" && !historyLoaded) void loadHistory(0);
    // URL navigation changes initialTab; request state is intentionally managed inside loadHistory.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab]);

  async function loadHistory(offset = nextOffset ?? 0) {
    if (historyRequestPending.current || (historyLoaded && nextOffset === null)) return;
    historyRequestPending.current = true;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const response = await fetch(`/api/lol-member/history?offset=${offset}`, {cache: "no-store"});
      const payload = await response.json() as {results?: PublicMatchResult[]; nextOffset?: number | null; error?: string};
      if (!response.ok) throw new Error(payload.error ?? "내전 기록을 불러오지 못했습니다.");
      setResults((current) => offset === 0 ? payload.results ?? [] : [...current, ...(payload.results ?? [])]);
      setNextOffset(payload.nextOffset ?? null);
      setHistoryLoaded(true);
    } catch (loadError) {
      setHistoryError(loadError instanceof Error ? loadError.message : "내전 기록을 불러오지 못했습니다.");
    } finally {
      historyRequestPending.current = false;
      setHistoryLoading(false);
    }
  }

  function selectTab(next: HubTab) {
    setTab(next);
    router.replace(next === "team" ? "/" : `/?tab=${next}`, {scroll: false});
    if (next === "history" && !historyLoaded && !historyLoading) void loadHistory(0);
  }

  return (
    <>
      <div className="mb-4 inline-flex rounded-lg border border-[var(--hairline)] bg-white p-1" role="tablist" aria-label="롤 내전 메뉴">
        <TabButton active={tab === "team"} onClick={() => selectTab("team")}>팀 편성</TabButton>
        <TabButton active={tab === "history"} onClick={() => selectTab("history")}>내전 기록</TabButton>
        <TabButton active={tab === "stats"} onClick={() => selectTab("stats")}>개인 스탯</TabButton>
      </div>
      <div role="tabpanel" aria-label="팀 편성" hidden={tab !== "team"}>
        {playerLoadFailed ? (
          <div className="surface-card border-[#f2d28b] bg-[var(--warning-soft)] px-5 py-12 text-center">
            <p className="font-semibold text-[var(--warning)]">선수 목록을 불러오지 못했습니다.</p>
            <p className="mt-2 text-sm text-[var(--muted)]">잠시 후 페이지를 새로고침해 주세요.</p>
          </div>
        ) : <TeamBuilder players={players} playerParticipation={playerParticipation} publicMode />}
      </div>
      <div role="tabpanel" aria-label="내전 기록" hidden={tab !== "history"}>
        <PublicMatchHistory
          results={results}
          players={players}
          accounts={accounts}
          loading={historyLoading || (!historyLoaded && !historyError)}
          error={historyError}
          hasMore={historyLoaded && nextOffset !== null}
          onLoadMore={() => void loadHistory(historyLoaded ? nextOffset ?? 0 : 0)}
        />
      </div>
      <div role="tabpanel" aria-label="개인 스탯" hidden={tab !== "stats"}>
        {playerLoadFailed ? (
          <div className="surface-card border-[#f2d28b] bg-[var(--warning-soft)] px-5 py-12 text-center">
            <p className="font-semibold text-[var(--warning)]">선수 통계를 불러오지 못했습니다.</p>
            <p className="mt-2 text-sm text-[var(--muted)]">잠시 후 페이지를 새로고침해 주세요.</p>
          </div>
        ) : <PublicPlayerStats players={players} accounts={accounts} stats={playerStats} />}
      </div>
    </>
  );
}

function TabButton({active, onClick, children}: {active: boolean; onClick: () => void; children: React.ReactNode}) {
  return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`min-h-10 rounded-md px-4 text-sm font-bold ${active ? "bg-[var(--primary)] text-white shadow-sm" : "text-[var(--muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]"}`}>{children}</button>;
}
