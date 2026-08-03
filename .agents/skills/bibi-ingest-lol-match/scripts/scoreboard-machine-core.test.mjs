import {describe, expect, it} from "vitest";
import {
  CANVAS,
  detectScoreboardLayout,
  matchRegisteredPlayer,
  parseDate,
  parseDuration,
  parseInteger,
  parseKda,
  repairImplausibleParticipantTotals,
  repairMissingParticipantTotals,
  roleFromQuest,
  selectSpellQuestCombination,
  selectLevelReading,
  selectTeamSpellQuestAssignments,
  selectUniqueAssetAssignments,
  validateMechanicalTotals,
} from "./scoreboard-machine-core.mjs";
import {applyBanOverlayModel, assetDifferenceHash, banCropLooksUnselected, extractBanOverlayModel, isAcceptedAssetMatch, isDecisiveBanOverlay, isObtainableInventoryItem, isScoreboardKeystone, participantAssetCoordinates, participantInventoryCoordinates} from "./resolve-ddragon-assets.mjs";

describe("scoreboard machine parsing", () => {
  it("normalizes common OCR substitutions", () => {
    expect(parseInteger("1O,985")).toBe(10985);
    expect(parseDate("2026-07-30")).toBe("2026-07-30");
    expect(parseDuration("23-32")).toBe(23 * 60 + 32);
    expect(parseDuration("34:-09")).toBe(34 * 60 + 9);
    expect(parseKda("11 / 3 / 13")).toEqual([11, 3, 13]);
  });

  it("selects a valid level retry and falls back to a flagged level 1", () => {
    expect(selectLevelReading([{text: "114", confidence: 90}, {text: "14", confidence: 70}])).toEqual({value: 14, reviewIssue: null});
    expect(selectLevelReading([{text: "115", confidence: 90}, {text: "", confidence: 0}])).toEqual({value: 15, reviewIssue: null});
    expect(selectLevelReading([{text: "999", confidence: 90}, {text: "", confidence: 0}])).toEqual({
      value: 1,
      reviewIssue: {reasons: ["LEVEL_UNRESOLVED"], detectedText: "999"},
    });
  });

  it("uses asset-specific confidence rules", () => {
    expect(isAcceptedAssetMatch({kind: "perk", methodAgreed: false, uniqueMatch: true, clearPerk: true})).toBe(false);
    expect(isAcceptedAssetMatch({kind: "perk", methodAgreed: true, uniqueMatch: true})).toBe(true);
    expect(isAcceptedAssetMatch({kind: "champion", methodAgreed: false, uniqueMatch: true})).toBe(true);
    expect(isAcceptedAssetMatch({kind: "ban", methodAgreed: false, overlayAgreed: false, overlayDecisive: true})).toBe(true);
    expect(isAcceptedAssetMatch({kind: "ban", methodAgreed: true, overlayAgreed: true, overlayDecisive: false})).toBe(false);
    expect(isAcceptedAssetMatch({kind: "item", methodAgreed: false, uniqueMatch: true, clearItem: false})).toBe(false);
    expect(isAcceptedAssetMatch({kind: "item", methodAgreed: false, uniqueMatch: true, clearItem: true})).toBe(true);
  });

  it("uses the same circular portrait area for champion hash matching", () => {
    const clean = Buffer.alloc(32 * 32 * 3);
    const framed = Buffer.from(clean);
    for (let y = 0; y < 32; y += 1) for (let x = 0; x < 32; x += 1) {
      if ((x - 15.5) ** 2 + (y - 15.5) ** 2 <= 145) continue;
      const index = (y * 32 + x) * 3;
      framed[index] = x % 2 ? 255 : 0;
      framed[index + 1] = y % 2 ? 180 : 0;
      framed[index + 2] = (x + y) % 2 ? 90 : 0;
    }
    expect(assetDifferenceHash(framed, "champion")).toBe(assetDifferenceHash(clean, "champion"));
    expect(assetDifferenceHash(framed, "item")).not.toBe(assetDifferenceHash(clean, "item"));
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

  it("replaces one impossible OCR value from the visible team total", () => {
    const participants = [79, 3, 11, 10, 17].map((assists) => ({team: "BLUE", kills: 1, deaths: 1, assists, goldEarned: 1000}));
    const teamStats = [{team: "BLUE", kills: 5, deaths: 5, assists: 54, goldTotal: 5000}];
    expect(repairImplausibleParticipantTotals(teamStats, participants)).toEqual([{team: "BLUE", participantIndex: 0, field: "assists", value: 13}]);
    expect(participants[0].assists).toBe(13);
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

describe("ban assignment constraints", () => {
  it("extracts repeated diagonal pixels from all ban slots and composites them onto candidates", () => {
    const crops = Array.from({length: 10}, (_, cropIndex) => {
      const crop = Buffer.alloc(32 * 32 * 3);
      for (let y = 0; y < 32; y += 1) for (let x = 0; x < 32; x += 1) {
        const index = (y * 32 + x) * 3;
        const line = Math.abs(x + y - 25) <= 1 || Math.abs(x + y - 35) <= 1;
        crop[index] = line ? 90 : (x * 17 + cropIndex * 31) % 255;
        crop[index + 1] = line ? 90 : (y * 23 + cropIndex * 19) % 255;
        crop[index + 2] = line ? 90 : (x * 11 + y * 7 + cropIndex * 29) % 255;
      }
      return crop;
    });
    const model = extractBanOverlayModel(crops);
    expect(model.alpha[12 * 32 + 13]).toBeGreaterThan(0.3);
    expect(model.alpha[0]).toBe(0);
    const icon = Buffer.alloc(32 * 32 * 3, 200);
    const overlaid = applyBanOverlayModel(icon, model);
    expect(overlaid[(12 * 32 + 13) * 3]).toBeLessThan(200);
    expect(overlaid[0]).toBe(200);
    expect(overlaid[(20 * 32 + 20) * 3]).toBe(200);
  });

  it("detects an unselected ban slot before champion matching", () => {
    const empty = Buffer.alloc(24 * 24 * 3, 12);
    const occupied = Buffer.alloc(24 * 24 * 3);
    for (let index = 0; index < occupied.length; index += 3) {
      occupied[index] = index % 251;
      occupied[index + 1] = (index * 3) % 241;
      occupied[index + 2] = (index * 7) % 239;
    }
    expect(banCropLooksUnselected(empty)).toBe(false);
    expect(banCropLooksUnselected(occupied)).toBe(false);
  });

  it("uses the extracted overlay only when its match is decisive", () => {
    expect(isDecisiveBanOverlay([
      {pixelError: 200, matchScore: 200},
      {pixelError: 220, matchScore: 220},
    ])).toBe(true);
    expect(isDecisiveBanOverlay([
      {pixelError: 200, matchScore: 200},
      {pixelError: 210, matchScore: 210},
    ])).toBe(false);
    expect(isDecisiveBanOverlay([
      {pixelError: 251, matchScore: 251},
      {pixelError: 300, matchScore: 300},
    ])).toBe(false);
  });

  it("selects the lowest-scoring unique champion assignment for one team", () => {
    const scored = (id, matchScore) => ({candidate: {id}, matchScore});
    const result = selectUniqueAssetAssignments([
      [scored("Locke", 1), scored("Twitch", 3)],
      [scored("Locke", 1), scored("Fiddlesticks", 2)],
      [scored("Teemo", 1)],
      [scored("Khazix", 1)],
      [scored("Locke", 1), scored("Urgot", 10)],
    ]);
    expect(result.assignments.map((entry) => entry.candidate.id)).toEqual(["Twitch", "Fiddlesticks", "Teemo", "Khazix", "Locke"]);
  });
});

describe("scoreboard anchor detection", () => {
  const paintDownloadAnchor = (paint, centerX, centerY) => {
    for (let degrees = 0; degrees < 360; degrees += 5) {
      const radians = degrees * Math.PI / 180;
      for (const radius of [14, 15, 16]) {
        paint(Math.round(centerX + Math.cos(radians) * radius), Math.round(centerY + Math.sin(radians) * radius));
      }
    }
  };

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
    expect(participantAssetCoordinates(202)).toEqual({
      champion: {left: 97, top: 186, width: 32, height: 32},
      perk: {left: 23, top: 192, width: 20, height: 20},
      spells: [
        {left: 49, top: 190, width: 11, height: 11},
        {left: 49, top: 203, width: 11, height: 11},
      ],
    });
  });

  it("uses the fixed item grid for both empty-slot checks and asset matching", () => {
    expect(participantInventoryCoordinates(202, 290, 25).items).toEqual([
      {left: 293, top: 190, width: 22, height: 22},
      {left: 318, top: 190, width: 22, height: 22},
      {left: 343, top: 190, width: 22, height: 22},
      {left: 368, top: 190, width: 22, height: 22},
      {left: 393, top: 190, width: 22, height: 22},
      {left: 418, top: 190, width: 22, height: 22},
    ]);
  });

  it("finds the canonical row and item grid from fixed gold borders", () => {
    const channels = 3;
    const data = new Uint8Array(CANVAS.width * CANVAS.height * channels);
    const paint = (x, y) => {
      const index = (y * CANVAS.width + x) * channels;
      data[index] = 120; data[index + 1] = 90; data[index + 2] = 10;
    };
    const rowTops = [...Array.from({length: 5}, (_, index) => 189 + index * 35), ...Array.from({length: 5}, (_, index) => 405 + index * 35)];
    for (const top of rowTops) {
      for (let x = 245; x < 525; x += 1) { paint(x, top); paint(x, top + 24); }
      for (let boundary = 0; boundary <= 7; boundary += 1) {
        const x = 290 + boundary * 25;
        for (let y = top + 2; y < top + 23; y += 1) paint(x, y);
      }
      for (const x of [472, 497]) for (let y = top + 2; y < top + 23; y += 1) paint(x, y);
    }
    paintDownloadAnchor(paint, 942, 36);
    const layout = detectScoreboardLayout(data, {width: CANVAS.width, height: CANVAS.height, channels});
    expect(layout.source).toMatchObject({blueTop: 189, redTop: 405, rowGap: 35, cellHeight: 24, itemGridLeft: 290, itemSlotGap: 25});
    expect(layout.transform).toEqual({xScale: 1, xOffset: 0, yScale: 1, yOffset: 0});
    expect(layout.confidence).toBeGreaterThan(0.8);
  });

  it("translates a shifted fixed-size scoreboard without scaling it", () => {
    const channels = 3;
    const data = new Uint8Array(CANVAS.width * CANVAS.height * channels);
    const paint = (x, y) => {
      const index = (y * CANVAS.width + x) * channels;
      data[index] = 120; data[index + 1] = 90; data[index + 2] = 10;
    };
    const gap = 35; const height = 24; const start = 297; const slotGap = 25;
    const rowTops = [...Array.from({length: 5}, (_, index) => 194 + index * gap), ...Array.from({length: 5}, (_, index) => 410 + index * gap)];
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
    paintDownloadAnchor(paint, 949, 41);
    const layout = detectScoreboardLayout(data, {width: CANVAS.width, height: CANVAS.height, channels});
    expect(layout.source).toMatchObject({blueTop: 194, redTop: 410, rowGap: 35, itemGridLeft: 297, itemSlotGap: 25});
    expect(layout.transform).toEqual({xScale: 1, xOffset: -7, yScale: 1, yOffset: -5});
    expect(layout.source.blueTop + layout.transform.yOffset).toBe(189);
    expect(layout.source.redTop + layout.transform.yOffset).toBe(405);
    expect(layout.source.itemGridLeft + layout.transform.xOffset).toBe(290);
  });

  it("aligns a cropped screenshot by translation without resizing its pixels", () => {
    const width = 1017; const height = 599; const channels = 3;
    const data = new Uint8Array(width * height * channels);
    const paint = (x, y) => {
      const index = (y * width + x) * channels;
      data[index] = 120; data[index + 1] = 90; data[index + 2] = 10;
    };
    const rowTops = [...Array.from({length: 5}, (_, index) => 187 + index * 35), ...Array.from({length: 5}, (_, index) => 403 + index * 35)];
    for (const top of rowTops) {
      for (let x = 245; x < 525; x += 1) { paint(x, top); paint(x, top + 24); }
      for (let boundary = 0; boundary <= 7; boundary += 1) {
        const x = 281 + boundary * 25;
        for (let y = top + 2; y < top + 23; y += 1) paint(x, y);
      }
      for (const x of [465, 490]) for (let y = top + 2; y < top + 23; y += 1) paint(x, y);
    }
    paintDownloadAnchor(paint, 933, 34);
    const layout = detectScoreboardLayout(data, {width, height, channels});
    expect(layout.transform).toEqual({xScale: 1, xOffset: 9, yScale: 1, yOffset: 2});
    expect(layout.source.blueTop + layout.transform.yOffset).toBe(189);
    expect(layout.source.redTop + layout.transform.yOffset).toBe(405);
    expect(layout.source.itemGridLeft + layout.transform.xOffset).toBe(290);
  });
});
