import {beforeEach, describe, expect, it, vi} from "vitest";
import {NextRequest} from "next/server";
import type {MatchResult} from "@/lib/lol/types";
import {makeMatchInput, makePlayers} from "@/lib/lol/match-result-test-fixtures";

const mocks = vi.hoisted(() => ({findByIngestionId: vi.fn(), listPlayers: vi.fn(), listAccounts: vi.fn(), replace: vi.fn(), save: vi.fn(), validateAssets: vi.fn(), rebuildRatings: vi.fn()}));

vi.mock("@/lib/server-env", () => ({getIngestServerEnv: () => ({token: "ingest-token-that-is-at-least-32-characters"})}));
vi.mock("@/lib/lol/data-dragon", () => ({validateDataDragonReferences: mocks.validateAssets}));
vi.mock("@/lib/lol/repository", () => ({findMatchResultByIngestionId: mocks.findByIngestionId, listPlayers: mocks.listPlayers, listPlayerAccounts: mocks.listAccounts, replaceMatchResult: mocks.replace, saveMatchResult: mocks.save}));
vi.mock("@/lib/lol/inhouse-rating-service", () => ({rebuildInhouseRatingSnapshot: mocks.rebuildRatings}));

import {GET, POST} from "@/app/api/internal/lol-match-results/route";

const endpoint = "https://bibi.example/api/internal/lol-match-results";
const token = "ingest-token-that-is-at-least-32-characters";

describe("internal match result route", () => {
  beforeEach(() => {
    const players = makePlayers();
    mocks.findByIngestionId.mockReset().mockResolvedValue(null);
    mocks.listPlayers.mockReset().mockResolvedValue(players);
    mocks.listAccounts.mockReset().mockResolvedValue([]);
    mocks.rebuildRatings.mockReset().mockResolvedValue(undefined);
    mocks.replace.mockReset().mockResolvedValue(undefined);
    mocks.save.mockReset().mockImplementation(async (result: MatchResult) => ({created: true, result}));
    mocks.validateAssets.mockReset().mockResolvedValue(undefined);
  });

  it("rejects missing and invalid bearer tokens", async () => {
    expect((await POST(request(makeMatchInput()))).status).toBe(401);
    expect((await POST(request(makeMatchInput(), "wrong-token"))).status).toBe(401);
    expect(mocks.listPlayers).not.toHaveBeenCalled();
  });

  it("returns an ingest-safe registered player catalog with bearer auth", async () => {
    expect((await GET(playerRequest())).status).toBe(401);
    const response = await GET(playerRequest(token));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.players[0]).toEqual(expect.objectContaining({discordUserId: "player-1", riotGameName: "RiotPlayer1"}));
    expect(payload.players[0]).not.toHaveProperty("puuid");
  });

  it("validates assets and mapping without writing", async () => {
    const response = await POST(request(makeMatchInput(), token));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.status).toBe("VALID");
    expect(payload.match.participants).toHaveLength(10);
    expect(payload).not.toHaveProperty("session");
    expect(mocks.validateAssets).toHaveBeenCalledTimes(1);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("commits once and handles an idempotent retry", async () => {
    const body = makeMatchInput(undefined, "commit");
    const created = await POST(request(body, token));
    const createdPayload = await created.json();
    expect(created.status).toBe(201);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    mocks.findByIngestionId.mockResolvedValue({key: "key", version: "version", value: createdPayload.result});
    const existing = await POST(request(body, token));
    expect(existing.status).toBe(200);
    expect((await existing.json()).status).toBe("EXISTING");
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it("updates only player mappings for an existing ingestion", async () => {
    const players = makePlayers();
    const body = makeMatchInput(players, "commit");
    body.participants[0].discordUserId = players[0].discordUserId;
    const created = await POST(request(body, token));
    const existingResult = (await created.json()).result as MatchResult;
    existingResult.participants[0] = {...existingResult.participants[0], discordUserId: null, guest: true};
    mocks.findByIngestionId.mockResolvedValue({key: "key", version: "version", value: existingResult});
    const response = await POST(request(body, token));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.status).toBe("UPDATED");
    expect(payload.result.participants[0]).toEqual(expect.objectContaining({discordUserId: "player-1", guest: false}));
    expect(mocks.replace).toHaveBeenCalledTimes(1);
  });
});

function request(body: Record<string, unknown>, bearer?: string) {
  return new NextRequest(endpoint, {method: "POST", headers: {"content-type": "application/json", ...(bearer ? {authorization: `Bearer ${bearer}`} : {})}, body: JSON.stringify(body)});
}

function playerRequest(bearer?: string) {
  return new NextRequest(endpoint, {headers: bearer ? {authorization: `Bearer ${bearer}`} : {}});
}
