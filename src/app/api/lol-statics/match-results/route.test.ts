import {beforeEach, describe, expect, it, vi} from "vitest";
import {NextRequest} from "next/server";
import {makeMatchInput, makePlayers, makeStoredResult} from "@/lib/lol/match-result-test-fixtures";

vi.mock("@/lib/auth-server", () => ({hasApiSession: vi.fn(), hasSameOrigin: vi.fn()}));
vi.mock("@/lib/lol/match-recognition-receipt", () => ({verifyReviewReceipt: vi.fn()}));
vi.mock("@/lib/lol/data-dragon", () => ({validateDataDragonReferences: vi.fn()}));
vi.mock("@/lib/lol/inhouse-rating-service", () => ({rebuildInhouseRatingSnapshot: vi.fn()}));
vi.mock("@/lib/lol/repository", () => ({
  findMatchResultByIngestionId: vi.fn(),
  listPlayerAccounts: vi.fn(),
  listPlayers: vi.fn(),
  saveMatchResult: vi.fn(),
}));

import {hasApiSession, hasSameOrigin} from "@/lib/auth-server";
import {verifyReviewReceipt} from "@/lib/lol/match-recognition-receipt";
import {rebuildInhouseRatingSnapshot} from "@/lib/lol/inhouse-rating-service";
import {findMatchResultByIngestionId, listPlayerAccounts, listPlayers, saveMatchResult} from "@/lib/lol/repository";
import {POST} from "@/app/api/lol-statics/match-results/route";

describe("admin match result creation API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasApiSession).mockResolvedValue(true);
    vi.mocked(hasSameOrigin).mockReturnValue(true);
    vi.mocked(verifyReviewReceipt).mockImplementation(() => ({version: 1, ingestionId: makeMatchInput().ingestionId, requiredReviewIds: []}));
    vi.mocked(listPlayers).mockResolvedValue(makePlayers());
    vi.mocked(listPlayerAccounts).mockResolvedValue([]);
    vi.mocked(findMatchResultByIngestionId).mockResolvedValue(null);
  });

  it("blocks a draft whose low-confidence reviews are incomplete", async () => {
    vi.mocked(verifyReviewReceipt).mockImplementation(() => { throw new Error("확인이 필요한 판독 항목이 1개 남아 있습니다."); });
    const response = await postDraft();
    expect(response.status).toBe(400);
    expect(saveMatchResult).not.toHaveBeenCalled();
  });

  it("validates, saves, and rebuilds ratings after explicit review", async () => {
    const stored = makeStoredResult();
    vi.mocked(saveMatchResult).mockResolvedValue({created: true, result: stored});
    const response = await postDraft();
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body.status).toBe("CREATED");
    expect(saveMatchResult).toHaveBeenCalledOnce();
    expect(rebuildInhouseRatingSnapshot).toHaveBeenCalledOnce();
  });

  it("returns an existing identical ingestion without rebuilding ratings", async () => {
    const stored = makeStoredResult();
    const input = makeMatchInput();
    const players = makePlayers();
    // Use the source hash produced by the same parsed input and player catalog.
    const {parseMatchResultInput, prepareMatchResult} = await import("@/lib/lol/match-result");
    stored.sourceHash = prepareMatchResult(parseMatchResultInput(input), players).sourceHash;
    vi.mocked(findMatchResultByIngestionId).mockResolvedValue({id: "key", etag: "1", value: stored});
    const response = await postDraft();
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("EXISTING");
    expect(saveMatchResult).not.toHaveBeenCalled();
    expect(rebuildInhouseRatingSnapshot).not.toHaveBeenCalled();
  });
});

function postDraft() {
  return POST(new NextRequest("https://bibi.example/api/lol-statics/match-results", {
    method: "POST",
    headers: {origin: "https://bibi.example", "content-type": "application/json"},
    body: JSON.stringify({draft: makeMatchInput(), reviewReceipt: "receipt", confirmedReviewIds: []}),
  }));
}
