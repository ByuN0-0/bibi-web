import {describe, expect, it} from "vitest";
import {
  CANVAS,
  detectScoreboardLayout,
  matchRegisteredPlayer,
  parseDate,
  parseDuration,
  parseInteger,
  participantRowOffsets,
  repairMissingParticipantTotals,
  roleFromQuest,
  selectSpellQuestCombination,
  selectTeamSpellQuestAssignments,
  validateMechanicalTotals,
} from "./scoreboard-machine-core.mjs";
import {isObtainableInventoryItem, isScoreboardKeystone, participantAssetCoordinates, participantInventoryCoordinates} from "./resolve-ddragon-assets.mjs";

describe("scoreboard machine parsing", () => {
  it("normalizes common OCR substitutions", () => {
    expect(parseInteger("1O,985")).toBe(10985);
    expect(parseDate("2026-07-30")).toBe("2026-07-30");
    expect(parseDuration("23-32")).toBe(23 * 60 + 32);
  });

  it("matches Korean, English and OCR-confusable alt account names", () => {
    const players = [{
      discordUserId: "player-1",
      displayName: "정욱",
      riotGameName: "PqppqPpqqP",
      accounts: [{riotGameName: "zszszszszszszszs"}],
    }];
    expect(matchRegisteredPlayer("Z8ZS2ZS2ZS52ZS82S", players)).toMatchObject({discordUserId: "player-1"});
  });

  it("rejects a mechanically inconsistent team total", () => {
    const participants = Array.from({length: 10}, (_, index) => ({
      team: index < 5 ? "BLUE" : "RED", kills: 1, deaths: 2, assists: 3, goldEarned: 1000,
    }));
    const teamStats = ["BLUE", "RED"].map((team) => ({team, kills: 5, deaths: 10, assists: 15, goldTotal: team === "BLUE" ? 5001 : 5000}));
    expect(validateMechanicalTotals(teamStats, participants)).toEqual(["BLUE goldTotal: team=5001 players=5000"]);
  });

  it("derives one missing player total from the visible team total", () => {
    const participants = Array.from({length: 5}, (_, index) => ({team: "RED", kills: index + 1, deaths: 2, assists: index ? index + 3 : null, goldEarned: 1000}));
    const teamStats = [{team: "RED", kills: 15, deaths: 10, assists: 30, goldTotal: 5000}];
    expect(repairMissingParticipantTotals(teamStats, participants)).toEqual([{team: "RED", participantIndex: 0, field: "assists", value: 8}]);
    expect(participants[0].assists).toBe(8);
    expect(validateMechanicalTotals(teamStats, participants)).toEqual([]);
  });
});

describe("summoner spell and quest constraints", () => {
  const scored = (id, name, matchScore) => ({candidate: {id, name, iconPath: `img/${id}.png`}, matchScore});
  const flash = scored("SummonerFlash", "점멸", 10);
  const heal = scored("SummonerHeal", "회복", 12);
  const smite = scored("SummonerSmite", "강타", 20);
  const teleport = scored("SummonerTeleport", "순간이동", 8);
  const topQuest = scored("1200", "상단 공격로 퀘스트", 5);
  const jungleQuest = scored("1204", "정글 퀘스트", 8);

  it("rejects duplicate summoner spells", () => {
    const result = selectSpellQuestCombination([[flash, heal], [flash, heal]], [topQuest]);
    expect(result.spells.map((entry) => entry.candidate.id)).toEqual(["SummonerFlash", "SummonerHeal"]);
  });

  it("allows Smite only with a jungle quest", () => {
    const result = selectSpellQuestCombination([[smite], [flash, heal]], [topQuest, jungleQuest]);
    expect(result.spells.some((entry) => entry.candidate.id === "SummonerSmite")).toBe(true);
    expect(result.quest.candidate.id).toBe("1204");
  });

  it("forces Smite when the best quest candidate is a jungle quest", () => {
    const result = selectSpellQuestCombination([[flash, smite], [heal]], [jungleQuest]);
    expect(result.spells.map((entry) => entry.candidate.id)).toContain("SummonerSmite");
  });

  it("selects a non-jungle quest when neither spell is Smite", () => {
    const result = selectSpellQuestCombination([[flash], [heal]], [jungleQuest, topQuest]);
    expect(result.quest.candidate.id).toBe("1200");
  });

  it("uses teleport presence only to narrow the four top quest IDs", () => {
    const topCandidates = ["1200", "1220", "1221", "1222"].map((id, index) => scored(id, "상단 공격로 퀘스트", index));
    expect(selectSpellQuestCombination([[flash], [heal]], topCandidates, "TOP").quest.candidate.id).toBe("1200");
    expect(selectSpellQuestCombination([[flash], [teleport]], topCandidates, "TOP").quest.candidate.id).toBe("1221");
    expect(topCandidates.every((quest) => roleFromQuest(quest.candidate) === "TOP")).toBe(true);
  });

  it("maps boots and control wards in the quest slot to bottom and support", () => {
    expect(roleFromQuest({id: "3006", name: "광전사의 군화", questRole: "BOTTOM"})).toBe("BOTTOM");
    expect(roleFromQuest({id: "2055", name: "제어 와드"})).toBe("UTILITY");
    expect(roleFromQuest({id: "1205", name: "정글 퀘스트 보상"})).toBeNull();
  });

  it("forbids Smite when the quest slot is empty", () => {
    const emptyQuest = {candidate: null, matchScore: 0};
    const result = selectSpellQuestCombination([[smite, flash], [heal]], [emptyQuest]);
    expect(result.spells.map((entry) => entry.candidate.id)).toEqual(["SummonerFlash", "SummonerHeal"]);
    expect(result.quest.candidate).toBeNull();
  });

  it("assigns all five position quests once per team and maps their roles", () => {
    const midQuest = scored("1201", "중단 공격로 퀘스트", 5);
    const bottomQuest = scored("1202", "하단 공격로 퀘스트", 5);
    const supportQuest = scored("1203", "서포터 퀘스트", 5);
    const questByRole = [topQuest, jungleQuest, midQuest, bottomQuest, supportQuest];
    const participants = questByRole.map((preferred, index) => ({
      spellSlots: index === 1 ? [[smite, flash], [flash, heal]] : [[flash], [heal]],
      questCandidates: questByRole.map((quest) => ({...quest, matchScore: quest === preferred ? 1 : 30})),
    }));
    participants[4].questCandidates = questByRole.map((quest) => ({...quest, matchScore: quest === bottomQuest ? 0 : quest === supportQuest ? 2 : 30}));
    const result = selectTeamSpellQuestAssignments(participants);
    expect(result.assignments.map((assignment) => assignment.role).sort()).toEqual(["BOTTOM", "JUNGLE", "MIDDLE", "TOP", "UTILITY"].sort());
    expect(result.assignments.map((assignment) => roleFromQuest(assignment.quest.candidate))).toEqual(result.assignments.map((assignment) => assignment.role));
    expect(result.assignments[4].role).toBe("UTILITY");
  });
});

describe("scoreboard anchor detection", () => {
  it("keeps purchasable and evolved Rift items while excluding hidden or unobtainable entries", () => {
    const riftItem = {maps: {"11": true}, gold: {purchasable: true}};
    expect(isObtainableInventoryItem("6690", riftItem)).toBe(true);
    expect(isObtainableInventoryItem("3040", {maps: {"11": true}, gold: {purchasable: false}, from: ["3003"]})).toBe(true);
    expect(isObtainableInventoryItem("1515", {maps: {"11": true}, gold: {purchasable: false}})).toBe(false);
    expect(isObtainableInventoryItem("3400", {...riftItem, hideFromAll: true})).toBe(false);
    expect(isObtainableInventoryItem("6690", {...riftItem, maps: {"11": false}})).toBe(false);
  });

  it("restricts rune matching to the scoreboard keystone set", () => {
    expect(isScoreboardKeystone("봉인 풀린 주문서")).toBe(true);
    expect(isScoreboardKeystone("폭풍전사의 포효")).toBe(true);
    expect(isScoreboardKeystone("난입")).toBe(false);
    expect(isScoreboardKeystone("마나순환 팔찌")).toBe(false);
  });

  it("crops the portrait center and both spell interiors without their gold frame", () => {
    expect(participantAssetCoordinates(207)).toEqual({
      champion: {left: 92, top: 191, width: 32, height: 32},
      perk: {left: 18, top: 197, width: 20, height: 20},
      spells: [
        {left: 43, top: 195, width: 11, height: 11},
        {left: 43, top: 208, width: 11, height: 11},
      ],
    });
  });

  it("uses the detected item grid for both empty-slot checks and asset matching", () => {
    expect(participantInventoryCoordinates(276, 288, 25).items).toEqual([
      {left: 291, top: 266, width: 22, height: 22},
      {left: 316, top: 266, width: 22, height: 22},
      {left: 341, top: 266, width: 22, height: 22},
      {left: 366, top: 266, width: 22, height: 22},
      {left: 391, top: 266, width: 22, height: 22},
      {left: 416, top: 266, width: 22, height: 22},
    ]);
  });

  it("finds the canonical row and item grid from fixed gold borders", () => {
    const channels = 3;
    const data = new Uint8Array(CANVAS.width * CANVAS.height * channels);
    const paint = (x, y) => {
      const index = (y * CANVAS.width + x) * channels;
      data[index] = 120; data[index + 1] = 90; data[index + 2] = 10;
    };
    const rowTops = [...Array.from({length: 5}, (_, index) => 195 + index * 35), ...Array.from({length: 5}, (_, index) => 410 + index * 35)];
    for (const top of rowTops) {
      for (let x = 245; x < 525; x += 1) { paint(x, top); paint(x, top + 24); }
      for (let boundary = 0; boundary <= 7; boundary += 1) {
        const x = 281 + boundary * 25;
        for (let y = top + 2; y < top + 23; y += 1) paint(x, y);
      }
      for (const x of [465, 490]) for (let y = top + 2; y < top + 23; y += 1) paint(x, y);
    }
    const layout = detectScoreboardLayout(data, {width: CANVAS.width, height: CANVAS.height, channels});
    expect(layout.source).toMatchObject({blueTop: 195, redTop: 410, rowGap: 35, cellHeight: 24, itemGridLeft: 281, itemSlotGap: 25});
    expect(layout.transform).toEqual({xScale: 1, xOffset: 0, yScale: 1, yOffset: 0});
    expect(layout.confidence).toBeGreaterThan(0.8);
  });

  it("independently corrects noncanonical horizontal and vertical scale", () => {
    const channels = 3;
    const data = new Uint8Array(CANVAS.width * CANVAS.height * channels);
    const paint = (x, y) => {
      const index = (y * CANVAS.width + x) * channels;
      data[index] = 120; data[index + 1] = 90; data[index + 2] = 10;
    };
    const gap = 40; const height = 27; const start = 230; const slotGap = 20;
    const rowTops = [...Array.from({length: 5}, (_, index) => 170 + index * gap), ...Array.from({length: 5}, (_, index) => 416 + index * gap)];
    for (const top of rowTops) {
      for (let x = 225; x < 505; x += 1) { paint(x, top); paint(x, top + height); }
      for (let boundary = 0; boundary <= 7; boundary += 1) {
        const x = start + boundary * slotGap;
        for (let y = top + 2; y < top + height - 1; y += 1) paint(x, y);
      }
      for (const x of [start + slotGap * 7 + 7, start + slotGap * 8 + 7]) {
        for (let y = top + 2; y < top + height - 1; y += 1) paint(x, y);
      }
    }
    const layout = detectScoreboardLayout(data, {width: CANVAS.width, height: CANVAS.height, channels});
    const sourceBlueCenter = layout.source.blueTop + layout.source.cellHeight / 2;
    const sourceRedCenter = layout.source.redTop + layout.source.cellHeight / 2;
    expect(layout.source).toMatchObject({blueTop: 170, redTop: 416, rowGap: 40, itemGridLeft: 230, itemSlotGap: 20});
    expect(sourceBlueCenter * layout.transform.yScale + layout.transform.yOffset).toBeCloseTo(207, 5);
    expect(sourceRedCenter * layout.transform.yScale + layout.transform.yOffset).toBeCloseTo(422, 5);
    expect(layout.source.itemGridLeft * layout.transform.xScale + layout.transform.xOffset).toBeCloseTo(281, 5);
    expect(participantRowOffsets(layout)).toEqual({
      BLUE: [0, 0, 0, 0, 0],
      RED: [0, 0, 0, 0, 0],
    });
  });

  it("corrects per-row rounding drift after global scoreboard alignment", () => {
    const layout = {
      source: {blueTop: 190, redTop: 407, rowGap: 35, cellHeight: 24},
      transform: {yScale: 215 / 217, yOffset: 207 - 202 * (215 / 217)},
    };
    expect(participantRowOffsets(layout)).toEqual({
      BLUE: [0, 0, -1, -1, -1],
      RED: [0, 0, -1, -1, -1],
    });
  });
});
