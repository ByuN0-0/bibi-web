import {describe, expect, it} from "vitest";
import {bearerTokenMatches, createMatchResult, matchResultSourceHash, parseAdminMatchResultUpdate, parseMatchResultInput, prepareMatchResult} from "@/lib/lol/match-result";
import {fixtureNow, makeMatchInput, makePlayers, makeStoredResult} from "@/lib/lol/match-result-test-fixtures";

describe("match result ingestion", () => {
  it("stores all fixed fields and permits empty item, trinket, quest and ban slots", () => {
    const players = makePlayers();
    const parsed = parseMatchResultInput(makeMatchInput(players));
    const prepared = prepareMatchResult(parsed, players);
    const result = createMatchResult(prepared, fixtureNow);
    expect(result).toMatchObject({schemaVersion: 3, playedOn: "2026-08-02", durationSeconds: 1800, ddragonVersion: "16.15.1"});
    expect(result).not.toHaveProperty("sessionId");
    expect(result.participants[0]).toMatchObject({guest: false, trinket: null, questSlot: null});
    expect(result.participants[0].items).toHaveLength(6);
    expect(result.teamStats[0].bans).toHaveLength(5);
  });

  it("maps registered players and keeps unmatched names as guests without a team session", () => {
    const players = makePlayers();
    const body = makeMatchInput(players);
    body.participants[8].observedName = "대타 한 명";
    body.participants[9].observedName = "대타 두 명";
    const prepared = prepareMatchResult(parseMatchResultInput(body), players);
    expect(prepared.guestCount).toBe(2);
    expect(prepared.participants.slice(8)).toEqual(expect.arrayContaining([
      expect.objectContaining({guest: true, discordUserId: null}),
    ]));
  });

  it("accepts an explicit registered player selected from the ingest catalog", () => {
    const players = makePlayers();
    const body = makeMatchInput(players);
    body.participants[0].observedName = "화면에서 읽은 별명";
    body.participants[0].discordUserId = players[0].discordUserId;
    const prepared = prepareMatchResult(parseMatchResultInput(body), players);
    expect(prepared.participants[0]).toEqual(expect.objectContaining({discordUserId: "player-1", guest: false}));

    body.participants[1].discordUserId = players[0].discordUserId;
    expect(() => prepareMatchResult(parseMatchResultInput(body), players)).toThrow("같은 등록 선수가 결과표에서 두 번 인식되었습니다.");
  });

  it("maps a linked alt Riot ID to the owning player", () => {
    const players = makePlayers();
    const body = makeMatchInput(players);
    body.participants[0].observedName = "숨겨둔부계정#KR2";
    const prepared = prepareMatchResult(parseMatchResultInput(body), players, [{
      schemaVersion: 1, accountId: "alt-1", discordUserId: "player-1", isPrimary: false,
      riotGameName: "숨겨둔부계정", riotTagLine: "KR2", puuid: "alt-puuid",
      soloRank: players[0].soloRank, flexRank: players[0].flexRank,
      recentRoleMatches: [], syncErrorCode: null, revision: 1, createdAt: fixtureNow, updatedAt: fixtureNow,
    }]);
    expect(prepared.participants[0]).toEqual(expect.objectContaining({discordUserId: "player-1", guest: false}));
  });

  it("rejects team size, fixed slots, objectives, negative values and total mismatches", () => {
    const wrongTeam = makeMatchInput();
    wrongTeam.participants[0].team = "RED";
    expect(() => parseMatchResultInput(wrongTeam)).toThrow("BLUE 팀 참가자는 정확히 5명이어야 합니다.");

    const wrongSlots = makeMatchInput();
    wrongSlots.participants[0].items.pop();
    expect(() => parseMatchResultInput(wrongSlots)).toThrow("items는 정확히 6칸이어야 합니다.");

    const negative = makeMatchInput();
    negative.teamStats[0].objectives.dragonKills = -1;
    expect(() => parseMatchResultInput(negative)).toThrow("dragonKills 값은 음수가 아닌 정수여야 합니다.");

    const mismatch = makeMatchInput();
    mismatch.teamStats[0].goldTotal += 1;
    expect(() => parseMatchResultInput(mismatch)).toThrow("BLUE 팀 goldTotal 합계가 개인 합계와 일치하지 않습니다.");
  });

  it("creates stable hashes and validates bearer tokens", () => {
    const input = parseMatchResultInput(makeMatchInput());
    expect(matchResultSourceHash(input)).toBe(matchResultSourceHash(input));
    expect(bearerTokenMatches("Bearer top-secret", "top-secret")).toBe(true);
    expect(bearerTokenMatches("Bearer wrong", "top-secret")).toBe(false);
  });
});

describe("admin correction", () => {
  it("keeps selected player snapshots and supports guests", () => {
    const players = makePlayers();
    const result = makeStoredResult();
    const body = {...result, revision: 2, participants: result.participants.map((participant, index) => ({...participant, discordUserId: index === 9 ? null : participant.discordUserId}))};
    const update = parseAdminMatchResultUpdate(body, players);
    expect(update.participants[0].guest).toBe(false);
    expect(update.participants[9].guest).toBe(true);
  });
});
