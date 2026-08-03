import {beforeEach, describe, expect, it, vi} from "vitest";
import {NextRequest} from "next/server";
import {makeMatchInput} from "@/lib/lol/match-result-test-fixtures";
import type {MatchResult} from "@/lib/lol/types";

vi.mock("@/lib/lol/repository", () => ({listPublishedMatchResultsPage: vi.fn()}));

import {listPublishedMatchResultsPage} from "@/lib/lol/repository";
import {GET} from "@/app/api/lol-member/history/route";

const mockedList = vi.mocked(listPublishedMatchResultsPage);

describe("public match history API", () => {
  beforeEach(() => mockedList.mockReset());

  it("returns ten sanitized results at the requested offset", async () => {
    const input = makeMatchInput();
    mockedList.mockResolvedValue({
      results: [{
        ...input,
        schemaVersion: 3,
        matchResultId: "match-1",
        source: "CHAT_SCREENSHOT",
        sourceHash: "secret-hash",
        participants: input.participants.map((participant) => ({...participant, guest: false, discordUserId: "123456"})),
        revision: 1,
        correctedBy: "ingest-api",
        corrections: [],
        createdAt: 1,
        updatedAt: 1,
      } as MatchResult],
      nextOffset: 20,
    });
    const response = await GET(new NextRequest("https://bibi.example/api/lol-member/history?offset=10"));
    const body = await response.json();
    expect(mockedList).toHaveBeenCalledWith(10, 10);
    expect(body.nextOffset).toBe(20);
    expect(body.results[0]).not.toHaveProperty("sourceHash");
    expect(body.results[0].participants[0]).not.toHaveProperty("discordUserId");
  });

  it("rejects invalid offsets", async () => {
    const response = await GET(new NextRequest("https://bibi.example/api/lol-member/history?offset=-1"));
    expect(response.status).toBe(400);
    expect(mockedList).not.toHaveBeenCalled();
  });
});
