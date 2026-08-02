import {describe, expect, it} from "vitest";
import {bearerTokenMatches, createMatchResult, matchResultSourceHash, parseAdminMatchResultUpdate, parseMatchResultInput, prepareMatchResult} from "@/lib/lol/match-result";
import {fixtureNow, makeMatchInput, makePlayers, makeSession, makeStoredResult} from "@/lib/lol/match-result-test-fixtures";

describe("match result ingestion", () => {
  it("stores all fixed fields and permits empty item, trinket, quest and ban slots", () => {
    const players = makePlayers();
    const parsed = parseMatchResultInput(makeMatchInput(players));
    const prepared = prepareMatchResult(parsed, players, [makeSession(players)], [], fixtureNow);
    const result = createMatchResult(prepared, fixtureNow);
    expect(result).toMatchObject({schemaVersion: 2, playedOn: "2026-08-02", durationSeconds: 1800, ddragonVersion: "16.15.1"});
    expect(result.participants[0]).toMatchObject({guest: false, trinket: null, questSlot: null});
    expect(result.participants[0].items).toHaveLength(6);
    expect(result.teamStats[0].bans).toHaveLength(5);
  });

  it("links a unique session with eight registered players and two guests", () => {
    const players = makePlayers();
    const body = makeMatchInput(players);
    body.participants[8].observedName = "대타 한 명";
    body.participants[9].observedName = "대타 두 명";
    const prepared = prepareMatchResult(parseMatchResultInput(body), players, [makeSession(players)], [], fixtureNow);
    expect(prepared.guestCount).toBe(2);
  });

  it("rejects seven matches, tied candidates and sessions with an existing result", () => {
    const players = makePlayers(20);
    const seven = makeMatchInput(players);
    for (let index = 7; index < 10; index += 1) seven.participants[index].observedName = `게스트 ${index}`;
    expect(() => prepareMatchResult(parseMatchResultInput(seven), players, [makeSession(players)], [], fixtureNow)).toThrowError(expect.objectContaining({code: "MATCH_SESSION_NOT_FOUND"}));

    const tiePlayers = [...players.slice(0, 8), ...players.slice(16, 18)];
    expect(() => prepareMatchResult(parseMatchResultInput(makeMatchInput(tiePlayers)), players, [makeSession([...players.slice(0, 10)], "a"), makeSession([...players.slice(0, 8), ...players.slice(10, 12)], "b")], [], fixtureNow)).toThrowError(expect.objectContaining({code: "MATCH_SESSION_AMBIGUOUS"}));

    expect(() => prepareMatchResult(parseMatchResultInput(makeMatchInput()), makePlayers(), [makeSession()], [makeStoredResult()], fixtureNow)).toThrowError(expect.objectContaining({code: "MATCH_SESSION_ALREADY_RECORDED"}));
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
