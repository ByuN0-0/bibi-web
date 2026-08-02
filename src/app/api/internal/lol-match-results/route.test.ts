import {beforeEach, describe, expect, it, vi} from "vitest";
import {NextRequest} from "next/server";
import type {MatchResult} from "@/lib/lol/types";
import {makeMatchInput, makePlayers, makeSession} from "@/lib/lol/match-result-test-fixtures";

const mocks = vi.hoisted(() => ({findByIngestionId: vi.fn(), listPlayers: vi.fn(), listSessions: vi.fn(), listResults: vi.fn(), save: vi.fn(), validateAssets: vi.fn()}));

vi.mock("@/lib/server-env", () => ({getIngestServerEnv: () => ({token: "ingest-token-that-is-at-least-32-characters"})}));
vi.mock("@/lib/lol/data-dragon", () => ({validateDataDragonReferences: mocks.validateAssets}));
vi.mock("@/lib/lol/repository", () => ({findMatchResultByIngestionId: mocks.findByIngestionId, listPlayers: mocks.listPlayers, listAllSessions: mocks.listSessions, listMatchResults: mocks.listResults, saveMatchResult: mocks.save}));

import {POST} from "@/app/api/internal/lol-match-results/route";

const endpoint = "https://bibi.example/api/internal/lol-match-results";
const token = "ingest-token-that-is-at-least-32-characters";

describe("internal match result route", () => {
  beforeEach(() => {
    const players = makePlayers();
    const session = makeSession(players);
    session.confirmedAt = Date.now() - 60_000;
    mocks.findByIngestionId.mockReset().mockResolvedValue(null);
    mocks.listPlayers.mockReset().mockResolvedValue(players);
    mocks.listSessions.mockReset().mockResolvedValue([session]);
    mocks.listResults.mockReset().mockResolvedValue([]);
    mocks.save.mockReset().mockImplementation(async (result: MatchResult) => ({created: true, result}));
    mocks.validateAssets.mockReset().mockResolvedValue(undefined);
  });

  it("rejects missing and invalid bearer tokens", async () => {
    expect((await POST(request(makeMatchInput()))).status).toBe(401);
    expect((await POST(request(makeMatchInput(), "wrong-token"))).status).toBe(401);
    expect(mocks.listPlayers).not.toHaveBeenCalled();
  });

  it("validates assets and mapping without writing", async () => {
    const response = await POST(request(makeMatchInput(), token));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.status).toBe("VALID");
    expect(payload.match.participants).toHaveLength(10);
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
});

function request(body: Record<string, unknown>, bearer?: string) {
  return new NextRequest(endpoint, {method: "POST", headers: {"content-type": "application/json", ...(bearer ? {authorization: `Bearer ${bearer}`} : {})}, body: JSON.stringify(body)});
}
