import {beforeEach, describe, expect, it, vi} from "vitest";
import {NextRequest} from "next/server";
import {makeMatchInput, makePlayers} from "@/lib/lol/match-result-test-fixtures";

vi.mock("@/lib/auth-server", () => ({hasApiSession: vi.fn(), hasSameOrigin: vi.fn()}));
vi.mock("@/lib/lol/repository", () => ({listPlayers: vi.fn(), listPlayerAccounts: vi.fn()}));
vi.mock("@/lib/lol/scoreboard-recognition.server", () => ({recognizeScoreboard: vi.fn()}));
vi.mock("@/lib/lol/match-recognition-receipt", () => ({createReviewReceipt: vi.fn(() => "signed-review") }));

import {hasApiSession, hasSameOrigin} from "@/lib/auth-server";
import {listPlayerAccounts, listPlayers} from "@/lib/lol/repository";
import {recognizeScoreboard} from "@/lib/lol/scoreboard-recognition.server";
import {POST} from "@/app/api/lol-statics/match-results/recognize/route";

const session = vi.mocked(hasApiSession);
const sameOrigin = vi.mocked(hasSameOrigin);
const recognize = vi.mocked(recognizeScoreboard);

describe("admin scoreboard recognition API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.mockResolvedValue(true);
    sameOrigin.mockReturnValue(true);
    vi.mocked(listPlayers).mockResolvedValue(makePlayers());
    vi.mocked(listPlayerAccounts).mockResolvedValue([]);
  });

  it("requires an authenticated same-origin request", async () => {
    session.mockResolvedValue(false);
    const response = await POST(new NextRequest("https://bibi.example/api/lol-statics/match-results/recognize", {method: "POST"}));
    expect(response.status).toBe(401);
    expect(recognize).not.toHaveBeenCalled();
  });

  it("rejects unsupported image types before recognition", async () => {
    const form = new FormData();
    form.set("image", new File(["not image"], "score.txt", {type: "text/plain"}));
    const response = await POST(new NextRequest("https://bibi.example/api/lol-statics/match-results/recognize", {method: "POST", headers: {origin: "https://bibi.example"}, body: form}));
    expect(response.status).toBe(415);
    expect(recognize).not.toHaveBeenCalled();
  });

  it("rejects images larger than four megabytes", async () => {
    const form = new FormData();
    form.set("image", new File([new Uint8Array(4 * 1024 * 1024 + 1)], "large.png", {type: "image/png"}));
    const response = await POST(new NextRequest("https://bibi.example/api/lol-statics/match-results/recognize", {method: "POST", headers: {origin: "https://bibi.example"}, body: form}));
    expect(response.status).toBe(413);
    expect(recognize).not.toHaveBeenCalled();
  });

  it("returns a preview and signed review receipt without saving", async () => {
    const input = makeMatchInput();
    const players = makePlayers();
    recognize.mockResolvedValue({
      draft: {...input, participants: input.participants.map((participant, index) => ({...participant, guest: false, discordUserId: players[index].discordUserId}))},
      report: {elapsedMs: 3200, layoutConfidence: 1, reviews: []},
    });
    const form = new FormData();
    form.set("image", new File([new Uint8Array([137, 80, 78, 71])], "score.png", {type: "image/png"}));
    const response = await POST(new NextRequest("https://bibi.example/api/lol-statics/match-results/recognize", {method: "POST", headers: {origin: "https://bibi.example"}, body: form}));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.reviewReceipt).toBe("signed-review");
    expect(body.draft.ingestionId).toBe(input.ingestionId);
    expect(recognize).toHaveBeenCalledOnce();
  });
});
