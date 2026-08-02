import {beforeEach, describe, expect, it, vi} from "vitest";
import {NextRequest} from "next/server";

vi.mock("@/lib/auth-server", () => ({hasApiSession: vi.fn()}));
vi.mock("@/lib/lol/data-dragon", () => ({listDataDragonAssets: vi.fn()}));

import {hasApiSession} from "@/lib/auth-server";
import {listDataDragonAssets} from "@/lib/lol/data-dragon";
import {GET} from "@/app/api/lol-statics/data-dragon/catalog/route";

describe("admin Data Dragon catalog API", () => {
  beforeEach(() => {vi.mocked(hasApiSession).mockReset(); vi.mocked(listDataDragonAssets).mockReset();});

  it("requires an admin session", async () => {
    vi.mocked(hasApiSession).mockResolvedValue(false);
    const response = await GET(request("version=16.15.1&type=champions"));
    expect(response.status).toBe(401);
  });

  it("returns the requested catalog", async () => {
    vi.mocked(hasApiSession).mockResolvedValue(true);
    vi.mocked(listDataDragonAssets).mockResolvedValue([{id: "Ahri", name: "아리", iconPath: "img/champion/Ahri.png"}]);
    const response = await GET(request("version=16.15.1&type=champions"));
    expect(response.status).toBe(200);
    expect(vi.mocked(listDataDragonAssets)).toHaveBeenCalledWith("16.15.1", "champions");
  });

  it("rejects unknown asset kinds", async () => {
    vi.mocked(hasApiSession).mockResolvedValue(true);
    const response = await GET(request("version=16.15.1&type=skins"));
    expect(response.status).toBe(400);
  });
});

const request = (query: string) => new NextRequest(`https://bibi.example/api/lol-statics/data-dragon/catalog?${query}`);
