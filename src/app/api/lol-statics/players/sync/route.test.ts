import {beforeEach, describe, expect, it, vi} from "vitest";
import {NextRequest} from "next/server";

const mocks = vi.hoisted(() => ({hasSession: vi.fn(), hasOrigin: vi.fn(), sync: vi.fn()}));

vi.mock("@/lib/auth-server", () => ({hasApiSession: mocks.hasSession, hasSameOrigin: mocks.hasOrigin}));
vi.mock("@/lib/lol/web-sync-service", async () => {
  class WebSyncError extends Error {
    constructor(message: string, readonly status: number, readonly retryAt?: number) {
      super(message);
    }
  }
  return {syncPlayerFromWeb: mocks.sync, WebSyncError};
});
vi.mock("@/lib/lol/riot-client", () => ({
  RiotApiError: class RiotApiError extends Error {
    constructor(readonly status: number) {
      super(`Riot API request failed with HTTP ${status}`);
    }
  },
}));

import {RiotApiError} from "@/lib/lol/riot-client";
import {WebSyncError} from "@/lib/lol/web-sync-service";
import {POST} from "@/app/api/lol-statics/players/sync/route";

const endpoint = "https://bibi.example/api/lol-statics/players/sync";
const discordUserId = "123456789012345678";

describe("player web sync route", () => {
  beforeEach(() => {
    mocks.hasSession.mockReset().mockResolvedValue(true);
    mocks.hasOrigin.mockReset().mockReturnValue(true);
    mocks.sync.mockReset().mockResolvedValue({discordUserId});
  });

  it("runs the Riot sync directly and returns its completion", async () => {
    const response = await POST(request({discordUserId}));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({synced: true});
    expect(mocks.sync).toHaveBeenCalledWith(discordUserId);
  });

  it("protects the endpoint and validates the player id", async () => {
    mocks.hasSession.mockResolvedValueOnce(false);
    expect((await POST(request({discordUserId}))).status).toBe(401);
    mocks.hasOrigin.mockReturnValueOnce(false);
    expect((await POST(request({discordUserId}))).status).toBe(403);
    expect((await POST(request({discordUserId: "invalid"}))).status).toBe(400);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("preserves sync conflicts and cooldown details", async () => {
    mocks.sync.mockRejectedValueOnce(new WebSyncError("쿨다운 중입니다.", 429, 1234));
    const response = await POST(request({discordUserId}));

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({error: "쿨다운 중입니다.", retryAt: 1234});
  });

  it("maps Riot API failures to a safe web response", async () => {
    mocks.sync.mockRejectedValueOnce(new RiotApiError(429));
    const response = await POST(request({discordUserId}));

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({error: "Riot API 요청이 많습니다. 잠시 후 다시 시도해 주세요."});
  });
});

function request(body: Record<string, unknown>) {
  return new NextRequest(endpoint, {
    method: "POST",
    headers: {"content-type": "application/json", origin: "https://bibi.example"},
    body: JSON.stringify(body),
  });
}
