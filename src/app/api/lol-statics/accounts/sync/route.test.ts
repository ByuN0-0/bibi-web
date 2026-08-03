import {beforeEach, describe, expect, it, vi} from "vitest";
import {NextRequest} from "next/server";

const mocks = vi.hoisted(() => ({hasSession: vi.fn(), hasOrigin: vi.fn(), dashboard: vi.fn(), sync: vi.fn()}));

vi.mock("@/lib/auth-server", () => ({hasApiSession: mocks.hasSession, hasSameOrigin: mocks.hasOrigin}));
vi.mock("@/lib/lol/account-sync-service", () => ({
  getAccountSyncDashboard: mocks.dashboard,
  syncRiotAccountFromWeb: mocks.sync,
  AccountSyncError: class AccountSyncError extends Error {
    constructor(message: string, readonly status: number, readonly retryAt?: number) { super(message); }
  },
}));
vi.mock("@/lib/lol/riot-client", () => ({
  RiotApiError: class RiotApiError extends Error {
    constructor(readonly status: number) { super(`Riot API request failed with HTTP ${status}`); }
  },
}));

import {AccountSyncError} from "@/lib/lol/account-sync-service";
import {GET, POST} from "@/app/api/lol-statics/accounts/sync/route";

const endpoint = "https://bibi.example/api/lol-statics/accounts/sync";

describe("account sync route", () => {
  beforeEach(() => {
    mocks.hasSession.mockReset().mockResolvedValue(true);
    mocks.hasOrigin.mockReset().mockReturnValue(true);
    mocks.dashboard.mockReset().mockResolvedValue({accounts: [], activeAccountId: null, nextAllowedAt: 0});
    mocks.sync.mockReset().mockResolvedValue({accountId: "account-1"});
  });

  it("returns the account dashboard and runs a selected account directly", async () => {
    expect(await (await GET(request())).json()).toEqual({accounts: [], activeAccountId: null, nextAllowedAt: 0});
    const response = await POST(request({accountId: "account-1"}));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({synced: true});
    expect(mocks.sync).toHaveBeenCalledWith("account-1");
  });

  it("requires authentication, same origin and an account id", async () => {
    mocks.hasSession.mockResolvedValueOnce(false);
    expect((await POST(request({accountId: "account-1"}))).status).toBe(401);
    mocks.hasOrigin.mockReturnValueOnce(false);
    expect((await POST(request({accountId: "account-1"}))).status).toBe(403);
    expect((await POST(request({accountId: ""}))).status).toBe(400);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("returns active conflicts and the global retry time", async () => {
    mocks.sync.mockRejectedValueOnce(new AccountSyncError("다른 계정을 갱신 중입니다.", 409));
    expect((await POST(request({accountId: "account-1"}))).status).toBe(409);
    mocks.sync.mockRejectedValueOnce(new AccountSyncError("2분 제한입니다.", 429, 1234));
    const cooldown = await POST(request({accountId: "account-1"}));
    expect(cooldown.status).toBe(429);
    expect(await cooldown.json()).toEqual({error: "2분 제한입니다.", retryAt: 1234});
  });
});

function request(body?: Record<string, unknown>) {
  return new NextRequest(endpoint, {
    method: body ? "POST" : "GET",
    headers: {"content-type": "application/json", origin: "https://bibi.example"},
    body: body ? JSON.stringify(body) : undefined,
  });
}
