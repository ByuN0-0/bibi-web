import {describe, expect, it} from "vitest";
import {bearerTokenMatches, createMatchResult, matchResultSourceHash, parseAdminMatchResultUpdate, parseMatchResultInput, parseMatchReviewIssues, prepareMatchResult} from "@/lib/lol/match-result";
import {fixtureNow, makeMatchInput, makePlayers, makeStoredResult, teleport} from "@/lib/lol/match-result-test-fixtures";

describe("match result ingestion", () => {
  it("stores all fixed fields and permits empty item, trinket and ban slots", () => {
    const players = makePlayers();
    const parsed = parseMatchResultInput(makeMatchInput(players));
    const prepared = prepareMatchResult(parsed, players);
    const result = createMatchResult(prepared, fixtureNow);
    expect(result).toMatchObject({schemaVersion: 5, reviewStatus: "PENDING_REVIEW", reviewIssues: [], playedOn: "2026-08-02", durationSeconds: 1800, ddragonVersion: "16.15.1"});
    expect(result).not.toHaveProperty("sessionId");
    expect(result.participants[0]).toMatchObject({guest: false, trinket: null, questSlot: {id: "1200"}});
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
      recentMatches: [], recentRoleMatches: [], syncStatus: "READY", lastSyncStartedAt: fixtureNow,
      lastSyncedAt: fixtureNow, syncErrorCode: null, revision: 1, createdAt: fixtureNow, updatedAt: fixtureNow,
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

  it("accepts level 20 for top only during ingestion and admin edits", () => {
    const top = makeMatchInput();
    top.participants[0].level = 20;
    expect(parseMatchResultInput(top).participants[0].level).toBe(20);
    const storedTop = makeStoredResult();
    storedTop.participants[0].level = 20;
    expect(parseAdminMatchResultUpdate(storedTop, makePlayers()).participants[0].level).toBe(20);

    for (const level of [0, 21, 114]) {
      const body = makeMatchInput();
      body.participants[0].level = level;
      expect(() => parseMatchResultInput(body)).toThrow("1~20");
      const stored = makeStoredResult();
      stored.participants[0].level = level;
      expect(() => parseAdminMatchResultUpdate(stored, makePlayers())).toThrow("1~20");
    }

    const jungle = makeMatchInput();
    jungle.participants[1].level = 19;
    expect(() => parseMatchResultInput(jungle)).toThrow("1~18");
    const storedJungle = makeStoredResult();
    storedJungle.participants[1].level = 19;
    expect(() => parseAdminMatchResultUpdate(storedJungle, makePlayers())).toThrow("1~18");
  });

  it("parses stable review targets and forces new issues open", () => {
    const body = makeMatchInput();
    Object.assign(body, {reviewIssues: [{
      key: "ignored-client-key",
      target: {scope: "PARTICIPANT", team: "BLUE", role: "TOP", field: "level"},
      reasons: ["LEVEL_UNRESOLVED"], detectedText: "114", status: "CONFIRMED",
    }]});
    const parsed = parseMatchResultInput(body);
    expect(parseMatchReviewIssues(body, parsed)).toEqual([expect.objectContaining({
      key: "participant:BLUE:TOP:level:", status: "OPEN", detectedText: "114",
    })]);
  });

  it("maps position quests to roles, rejects duplicates, and stores canonical role order", () => {
    const body = makeMatchInput();
    const questIds = ["1200", "1204", "1201", "1202", "1203"];
    const questNames = ["상단 공격로 퀘스트", "정글 퀘스트", "중단 공격로 퀘스트", "하단 공격로 퀘스트", "서포터 퀘스트"];
    body.participants.forEach((participant, index) => {
      const id = questIds[index % 5];
      participant.questSlot = {id, name: questNames[index % 5], iconPath: `img/item/${id}.png`};
    });
    body.participants = [body.participants[3], body.participants[1], body.participants[4], body.participants[0], body.participants[2], ...body.participants.slice(5)];
    const parsed = parseMatchResultInput(body);
    expect(parsed.participants.map((participant) => `${participant.team}:${participant.role}`)).toEqual([
      "BLUE:TOP", "BLUE:JUNGLE", "BLUE:MIDDLE", "BLUE:BOTTOM", "BLUE:UTILITY",
      "RED:TOP", "RED:JUNGLE", "RED:MIDDLE", "RED:BOTTOM", "RED:UTILITY",
    ]);

    const duplicate = makeMatchInput();
    duplicate.participants[4].role = "BOTTOM";
    duplicate.participants[4].questSlot = {id: "1202", name: "하단 공격로 퀘스트", iconPath: "img/item/1202.png"};
    expect(() => parseMatchResultInput(duplicate)).toThrow("각각 한 명씩 포함");

    const duplicateQuest = makeMatchInput();
    delete (duplicateQuest.participants[4] as Partial<typeof duplicateQuest.participants[number]>).role;
    duplicateQuest.participants[4].questSlot = {id: "1202", name: "하단 공격로 퀘스트", iconPath: "img/item/1202.png"};
    expect(() => parseMatchResultInput(duplicateQuest)).toThrow("각각 한 명씩 포함");
  });

  it("applies exact role quest rules including teleport, boots and control wards", () => {
    const withTeleport = makeMatchInput();
    withTeleport.participants[0].summonerSpells = [{...teleport}, withTeleport.participants[0].summonerSpells[1]];
    expect(() => parseMatchResultInput(withTeleport)).toThrow("포지션과 퀘스트 슬롯이 일치하지 않습니다");
    withTeleport.participants[0].questSlot = {id: "1221", name: "상단 공격로 퀘스트 보상", iconPath: "img/item/1221.png"};
    expect(parseMatchResultInput(withTeleport).participants[0].role).toBe("TOP");

    const alternatives = makeMatchInput();
    alternatives.participants[3].questSlot = {id: "3006", name: "광전사의 군화", iconPath: "img/item/3006.png"};
    alternatives.participants[4].questSlot = {id: "2055", name: "제어 와드", iconPath: "img/item/2055.png"};
    expect(parseMatchResultInput(alternatives).participants.slice(3, 5).map((participant) => participant.role)).toEqual(["BOTTOM", "UTILITY"]);

    const invalidJungle = makeMatchInput();
    invalidJungle.participants[1].questSlot = {id: "1205", name: "정글 퀘스트 보상", iconPath: "img/item/1205.png"};
    expect(() => parseMatchResultInput(invalidJungle)).toThrow("포지션 퀘스트가 아닙니다");
  });

  it("accepts only the three scoreboard trinkets", () => {
    const body = makeMatchInput();
    body.participants[0].trinket = {id: "3340", name: "투명 와드", iconPath: "img/item/3340.png"};
    expect(parseMatchResultInput(body).participants[0].trinket?.id).toBe("3340");
    body.participants[0].trinket = {id: "2055", name: "제어 와드", iconPath: "img/item/2055.png"};
    expect(() => parseMatchResultInput(body)).toThrow("장신구 슬롯에는");
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
