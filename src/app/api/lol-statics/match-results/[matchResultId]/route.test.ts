import {beforeEach, describe, expect, it, vi} from "vitest";
import {NextRequest} from "next/server";
import {makePlayers, makeStoredResult} from "@/lib/lol/match-result-test-fixtures";

const mocks = vi.hoisted(() => ({hasSession: vi.fn(), hasOrigin: vi.fn(), findResult: vi.fn(), listPlayers: vi.fn(), replaceResult: vi.fn(), validateAssets: vi.fn(), rebuildRatings: vi.fn()}));
vi.mock("@/lib/auth-server", () => ({hasApiSession: mocks.hasSession, hasSameOrigin: mocks.hasOrigin}));
vi.mock("@/lib/lol/data-dragon", () => ({validateDataDragonReferences: mocks.validateAssets}));
vi.mock("@/lib/lol/repository", () => ({findMatchResult: mocks.findResult, listPlayers: mocks.listPlayers, replaceMatchResult: mocks.replaceResult}));
vi.mock("@/lib/lol/inhouse-rating-service", () => ({rebuildInhouseRatingSnapshot: mocks.rebuildRatings}));

import {PATCH} from "@/app/api/lol-statics/match-results/[matchResultId]/route";

describe("admin correction route", () => {
  beforeEach(() => {
    mocks.hasSession.mockReset().mockResolvedValue(true);
    mocks.hasOrigin.mockReset().mockReturnValue(true);
    mocks.findResult.mockReset().mockResolvedValue({key: "key", version: "version", value: makeStoredResult()});
    mocks.listPlayers.mockReset().mockResolvedValue(makePlayers());
    mocks.replaceResult.mockReset().mockResolvedValue(undefined);
    mocks.validateAssets.mockReset().mockResolvedValue(undefined);
    mocks.rebuildRatings.mockReset().mockResolvedValue(undefined);
  });

  it("requires an admin session and same-origin request", async () => {
    mocks.hasSession.mockResolvedValueOnce(false);
    expect((await PATCH(request(editBody()), context())).status).toBe(401);
    mocks.hasOrigin.mockReturnValueOnce(false);
    expect((await PATCH(request(editBody()), context())).status).toBe(403);
    expect(mocks.replaceResult).not.toHaveBeenCalled();
  });

  it("revalidates assets, increments revision and keeps correction history", async () => {
    const response = await PATCH(request(editBody()), context());
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.result).toMatchObject({revision: 2, correctedBy: "web-admin"});
    expect(payload.result.corrections).toHaveLength(1);
    expect(mocks.validateAssets).toHaveBeenCalledTimes(1);
    expect(mocks.replaceResult).toHaveBeenCalledTimes(1);
  });
});

function editBody() {
  const result = makeStoredResult();
  return {...result, winner: "RED"};
}
function request(body: Record<string, unknown>) {
  return new NextRequest("https://bibi.example/api/lol-statics/match-results/result-1", {method: "PATCH", headers: {"content-type": "application/json", origin: "https://bibi.example"}, body: JSON.stringify(body)});
}
function context() { return {params: Promise.resolve({matchResultId: "result-1"})}; }
