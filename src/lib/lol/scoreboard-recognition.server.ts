import "server-only";
import {createHash} from "node:crypto";
import {tmpdir} from "node:os";
import {parseMatchResultInput, prepareMatchResult} from "@/lib/lol/match-result";
import type {
  MatchRecognitionReport,
  MatchRecognitionReview,
  MatchResultDraft,
  PlayerProfile,
  RiotAccountProfile,
} from "@/lib/lol/types";

// The same JavaScript module is used by the repository skill CLI and the web API.
import {readScoreboardImage} from "../../../.agents/skills/bibi-ingest-lol-match/scripts/read-scoreboard.mjs";

type RawAssetReview = {
  field: string;
  kind: MatchRecognitionReview["kind"];
  selected: MatchRecognitionReview["selected"];
  accepted: boolean;
  score: number;
  runnerUpGap: number | null;
};

let recognitionQueue: Promise<unknown> = Promise.resolve();

export function recognizeScoreboard(
  image: Buffer,
  players: PlayerProfile[],
  accounts: RiotAccountProfile[],
): Promise<{draft: MatchResultDraft; report: MatchRecognitionReport}> {
  const pending = recognitionQueue.then(async () => {
    const accountByPlayer = new Map<string, RiotAccountProfile[]>();
    for (const account of accounts) accountByPlayer.set(account.discordUserId, [...(accountByPlayer.get(account.discordUserId) ?? []), account]);
    const recognitionPlayers = players.map((player) => ({
      discordUserId: player.discordUserId,
      displayName: player.displayName,
      riotGameName: player.riotGameName,
      riotTagLine: player.riotTagLine,
      accounts: (accountByPlayer.get(player.discordUserId) ?? []).map((account) => ({
        riotGameName: account.riotGameName,
        riotTagLine: account.riotTagLine,
        isPrimary: account.isPrimary,
      })),
    }));
    const result = await readScoreboardImage(image, {
      players: recognitionPlayers,
      cacheRoot: tmpdir(),
      resolveAssets: true,
      allowAmbiguous: true,
      reuseWorkers: true,
    });
    const parsed = parseMatchResultInput(result.payload);
    const prepared = prepareMatchResult(parsed, players, accounts);
    const reviews = (result.report.assets as RawAssetReview[])
      .filter((asset) => !asset.accepted)
      .map((asset): MatchRecognitionReview => ({
        id: createHash("sha256").update(`${parsed.ingestionId}:${asset.field}:${asset.kind}:${asset.selected.id}`).digest("hex").slice(0, 24),
        field: asset.field,
        kind: asset.kind,
        selected: asset.selected,
        score: asset.score,
        runnerUpGap: Number.isFinite(asset.runnerUpGap) ? asset.runnerUpGap : null,
      }));
    return {
      draft: {
        ingestionId: parsed.ingestionId,
        playedOn: parsed.playedOn,
        winner: parsed.winner,
        durationSeconds: parsed.durationSeconds,
        ddragonVersion: parsed.ddragonVersion,
        teamStats: parsed.teamStats,
        participants: prepared.participants,
      },
      report: {
        elapsedMs: result.report.elapsedMs,
        layoutConfidence: result.report.layout.confidence,
        reviews,
      },
    };
  });
  recognitionQueue = pending.catch(() => undefined);
  return pending;
}
