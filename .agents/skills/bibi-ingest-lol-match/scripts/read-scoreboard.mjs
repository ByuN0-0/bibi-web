#!/usr/bin/env node
import {createHash} from "node:crypto";
import {mkdir, readFile, stat, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import sharp from "sharp";
import {createWorker, PSM} from "tesseract.js";
import kor from "@tesseract.js-data/kor";
import eng from "@tesseract.js-data/eng";
import {
  CANVAS,
  detectScoreboardLayout,
  matchRegisteredPlayer,
  parseDate,
  parseDuration,
  parseInteger,
  parseKda,
  REFERENCE_GRID,
  REFERENCE_ROWS,
  repairImplausibleParticipantTotals,
  repairMissingParticipantTotals,
  selectLevelReading,
  validateMechanicalTotals,
} from "./scoreboard-machine-core.mjs";
import {participantInventoryCoordinates, resolveDataDragonAssets} from "./resolve-ddragon-assets.mjs";

let aligned;
let worker;
let englishWorker;
let ocrLog;
let ocrQueue;
let players;
let sharedWorkersPromise;
let recognitionIssues;

export async function readScoreboardImage(original, options = {}) {
  const startedAt = performance.now();
  players = options.players ?? [];
  const cacheRoot = options.cacheRoot ?? tmpdir();
  const {data: sourceRaw, info: sourceInfo} = await sharp(original).removeAlpha().raw().toBuffer({resolveWithObject: true});
  const layout = detectScoreboardLayout(sourceRaw, sourceInfo);
  if (layout.confidence < 0.42) fail(`점수판 아이템 슬롯 앵커를 찾지 못했습니다. confidence=${layout.confidence.toFixed(2)}`);
  // Preserve every source pixel. The download-button anchor supplies one dx/dy
  // translation for the whole screenshot; every OCR and asset crop then uses
  // the same canonical coordinates without reusing detected row/grid offsets.
  aligned = await alignToCanvas(original, sourceInfo, layout.transform);
  const assetAligned = aligned;
  const ocrCachePath = join(cacheRoot, "bibi-tesseract-cache");
  await mkdir(ocrCachePath, {recursive: true});
  const workers = await getWorkers(ocrCachePath, options.reuseWorkers ?? false);
  worker = workers.worker;
  englishWorker = workers.englishWorker;
  ocrLog = [];
  recognitionIssues = [];
  ocrQueue = Promise.resolve();
  let recognizedPayload;
  try {
    recognizedPayload = await recognizeScoreboard(original, {
      inventoryImage: assetAligned,
      itemGridLeft: REFERENCE_GRID.ITEM_LEFT,
      itemSlotGap: REFERENCE_GRID.ITEM_GAP,
    });
  } finally {
    if (!(options.reuseWorkers ?? false)) await Promise.all([worker.terminate(), englishWorker.terminate()]);
  }
  const report = {layout, ocr: ocrLog, assets: [], elapsedMs: Math.round(performance.now() - startedAt)};
  let resolvedPayload = recognizedPayload;
  if (options.resolveAssets !== false) {
    const resolved = await resolveDataDragonAssets(recognizedPayload, {
      screenshot: assetAligned,
      cacheDir: join(cacheRoot, "bibi-ddragon-cache"),
      allowAmbiguous: options.allowAmbiguous ?? true,
      itemGridLeft: REFERENCE_GRID.ITEM_LEFT,
      itemSlotGap: REFERENCE_GRID.ITEM_GAP,
    });
    resolvedPayload = resolved.payload;
    report.assets = resolved.assets;
  }
  resolvedPayload.reviewIssues = buildReviewIssues(resolvedPayload, resolvedPayload.reviewIssues ?? recognitionIssues, report.assets);
  report.reviewIssues = resolvedPayload.reviewIssues;
  report.elapsedMs = Math.round(performance.now() - startedAt);
  return {payload: resolvedPayload, recognizedPayload, report, aligned};
}

async function getWorkers(cachePath, reuse) {
  if (!reuse) {
    return {
      worker: await createWorker("kor", 1, {langPath: kor.langPath, gzip: kor.gzip, cachePath}),
      englishWorker: await createWorker("eng", 1, {langPath: eng.langPath, gzip: eng.gzip, cachePath}),
    };
  }
  sharedWorkersPromise ??= Promise.all([
    createWorker("kor", 1, {langPath: kor.langPath, gzip: kor.gzip, cachePath}),
    createWorker("eng", 1, {langPath: eng.langPath, gzip: eng.gzip, cachePath}),
  ]).then(([sharedWorker, sharedEnglishWorker]) => ({worker: sharedWorker, englishWorker: sharedEnglishWorker}));
  return sharedWorkersPromise;
}

function textField(field, rectangle, type = "text") {
  const pending = ocrQueue.then(() => recognizeField(field, rectangle, type));
  ocrQueue = pending.catch(() => undefined);
  return pending;
}
async function recognizeField(field, rectangle, type) {
  const numericType = type === "number" || type === "number-high";
  const image = await prepareOcrCrop(aligned, rectangle, numericType ? "number" : type, type === "number-high");
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_LINE,
    tessedit_char_whitelist: numericType ? "0123456789" : ["time", "kda"].includes(type) ? "0123456789:/.-" : "",
    preserve_interword_spaces: "1",
    user_defined_dpi: "300",
  });
  let result = await worker.recognize(image);
  if (type === "number" && (parseInteger(result.data.text) === null || result.data.confidence < 40)) {
    const fallbackImage = await prepareOcrCrop(aligned, rectangle, "number", true);
    const fallback = await worker.recognize(fallbackImage);
    if (parseInteger(fallback.data.text) !== null && (parseInteger(result.data.text) === null || fallback.data.confidence > result.data.confidence)) result = fallback;
  }
  const entry = {field, text: result.data.text.trim(), confidence: result.data.confidence};
  ocrLog.push(entry);
  return entry;
}

async function englishNameField(field, rectangle) {
  const image = await prepareOcrCrop(aligned, rectangle, "text");
  await englishWorker.setParameters({tessedit_pageseg_mode: PSM.SINGLE_LINE, preserve_interword_spaces: "1", user_defined_dpi: "300"});
  const result = await englishWorker.recognize(image);
  const entry = {field, text: result.data.text.trim(), confidence: result.data.confidence};
  ocrLog.push(entry);
  return entry;
}

async function kdaField(field, centerY) {
  const result = await textField(field, {left: 510, top: centerY - 13, width: 112, height: 26}, "kda");
  return parseKda(result.text);
}

async function recognizeScoreboard(original, assetLayout) {
  const [resultText, durationText, dateText] = await Promise.all([
    textField("result", {left: 66, top: 12, width: 86, height: 32}),
    textField("duration", {left: 242, top: 43, width: 54, height: 22}, "time"),
    textField("date", {left: 304, top: 43, width: 100, height: 22}, "time"),
  ]);
  const playedOn = parseDate(dateText.text);
  const durationSeconds = parseDuration(durationText.text);
  const winner = resultText.text.includes("패") ? "RED" : resultText.text.includes("리") ? "BLUE" : null;
  if (!playedOn) fail(`경기 날짜를 읽지 못했습니다: ${dateText.text || "(empty)"}`);
  if (!durationSeconds) fail(`경기 시간을 읽지 못했습니다: ${durationText.text || "(empty)"}`);
  if (!winner) fail(`승패를 읽지 못했습니다: ${resultText.text || "(empty)"}`);

  const teamStats = [];
  for (const [team, centerY] of [["BLUE", 164], ["RED", 379]]) {
    const [teamKda, fallbackKills, fallbackDeaths, fallbackAssists, goldTotal] = await Promise.all([
      textField(`${team}.kda`, {left: 124, top: centerY - 13, width: 126, height: 26}, "kda").then((result) => parseKda(result.text)),
      numberField(`${team}.kills`, 143, centerY, 32, {allowMissing: true}),
      numberField(`${team}.deaths`, 189, centerY, 32, {allowMissing: true}),
      numberField(`${team}.assists`, 234, centerY, 32, {allowMissing: true}),
      numberField(`${team}.gold`, 380, centerY, 70),
    ]);
    const [kills, deaths, assists] = teamKda ?? [fallbackKills, fallbackDeaths, fallbackAssists];
    const objectiveY = team === "BLUE" ? 306 : 521;
    const objectiveXs = [861, 890, 919, 948, 977, 1006];
    const objectiveValues = await Promise.all(objectiveXs.map((x, index) => numberField(`${team}.objective.${index}`, x, objectiveY, 24, {blankIsZero: true})));
    teamStats.push({
      team, kills, deaths, assists, goldTotal,
      bans: ["?", "?", "?", "?", "?"],
      objectives: {
        turretsDestroyed: objectiveValues[0], inhibitorsDestroyed: objectiveValues[1], baronKills: objectiveValues[2],
        dragonKills: objectiveValues[3], riftHeraldKills: objectiveValues[4], voidGrubKills: objectiveValues[5],
      },
    });
  }

  const participants = [];
  const numericAlternatives = [];
  for (const team of ["BLUE", "RED"]) {
    for (let rowIndex = 0; rowIndex < 5; rowIndex += 1) {
      const row = REFERENCE_ROWS[team][rowIndex];
      const index = participants.length;
      const nameRectangle = {left: 124, top: row - 13, width: 154, height: 26};
      const [nameResult, englishNameResult, level, combinedKda, fallbackKills, fallbackDeaths, fallbackAssists, cs, goldEarned, wideGold] = await Promise.all([
        textField(`participants.${index}.name`, nameRectangle),
        englishNameField(`participants.${index}.nameEnglish`, nameRectangle),
        levelField(`participants.${index}.level`, 72, row),
        kdaField(`participants.${index}.kda`, row),
        numberField(`participants.${index}.kills`, 526, row, 24, {narrowRetry: true, allowMissing: true}),
        numberField(`participants.${index}.deaths`, 561, row, 24, {narrowRetry: true, allowMissing: true}),
        numberField(`participants.${index}.assists`, 604, row, 24, {narrowRetry: true, allowMissing: true}),
        numberField(`participants.${index}.cs`, 661, row, 48),
        numberField(`participants.${index}.gold`, 740, row, 64, {allowMissing: true}),
        numberField(`participants.${index}.goldWide`, 746, row, 76, {allowMissing: true, highContrast: true}),
      ]);
      const fallbackKda = [fallbackKills, fallbackDeaths, fallbackAssists];
      const [kills, deaths, assists] = combinedKda ?? fallbackKda;
      const combinedName = `${englishNameResult.text.replace(/[^0-9a-z]/gi, "")}${nameResult.text.replace(/[^가-힣]/g, "")}`;
      const matches = [nameResult.text, englishNameResult.text, combinedName].map((name) => matchRegisteredPlayer(name, players)).filter(Boolean);
      const matched = matches.sort((left, right) => right.confidence - left.confidence)[0] ?? null;
      const detectedName = matched ? matched.observedName : englishNameResult.confidence > nameResult.confidence ? englishNameResult.text : nameResult.text;
      const inventory = participantInventoryCoordinates(row, assetLayout.itemGridLeft, assetLayout.itemSlotGap);
      const items = await Promise.all(inventory.items.map(async (rectangle) => (
        await occupied(assetLayout.inventoryImage, rectangle) ? "?" : null
      )));
      participants.push({
        team,
        observedName: compactOcrName(detectedName),
        discordUserId: matched?.discordUserId ?? null,
        champion: "?",
        primaryPerk: "?",
        summonerSpells: ["?", "?"],
        level, kills, deaths, assists, cs, goldEarned,
        items,
        trinket: "?",
        questSlot: "?",
      });
      numericAlternatives.push({
        kills: [kills, fallbackKills], deaths: [deaths, fallbackDeaths], assists: [assists, fallbackAssists],
        goldEarned: [goldEarned, wideGold],
      });
      ocrLog.push({field: `participants.${index}.mapping`, text: matched ? `${matched.displayName}:${matched.observedName}` : "guest", confidence: matched?.confidence ? matched.confidence * 100 : 0});
    }
  }

  reconcileNumericAlternatives(teamStats, participants, numericAlternatives);
  for (const repair of repairMissingParticipantTotals(teamStats, participants)) {
    ocrLog.push({field: `participants.${repair.participantIndex}.${repair.field}.derived`, text: String(repair.value), confidence: 100});
  }
  for (const repair of repairImplausibleParticipantTotals(teamStats, participants)) {
    ocrLog.push({field: `participants.${repair.participantIndex}.${repair.field}.derived`, text: String(repair.value), confidence: 100});
  }
  ensureNumbers(teamStats, participants);
  const totalErrors = validateMechanicalTotals(teamStats, participants);
  if (totalErrors.length) {
    const kdaRows = participants.map(({team, kills, deaths, assists}) => `${team}:${kills}/${deaths}/${assists}`).join(", ");
    fail(`OCR 합계 검증에 실패했습니다:\n${totalErrors.map((error) => `- ${error}`).join("\n")}\n- rows: ${kdaRows}`);
  }
  return {
    action: "validate",
    ingestionId: `lol-scoreboard:${createHash("sha256").update(original).digest("hex")}`,
    playedOn, winner, durationSeconds,
    teamStats, participants, reviewIssues: recognitionIssues,
  };
}

async function levelField(field, centerX, centerY) {
  const variants = [
    {left: Math.round(centerX - 14), top: centerY - 13, width: 28, height: 26, type: "number"},
    {left: Math.round(centerX - 11), top: centerY - 13, width: 22, height: 26, type: "number"},
    {left: Math.round(centerX - 12), top: centerY - 13, width: 23, height: 26, type: "number-high"},
  ];
  const readings = [];
  for (let index = 0; index < variants.length; index += 1) {
    const variant = variants[index];
    readings.push(await textField(index === 0 ? field : `${field}.retry${index}`, variant, variant.type));
  }
  const selected = selectLevelReading(readings);
  if (selected.reviewIssue) recognitionIssues.push({field, ...selected.reviewIssue});
  return selected.value;
}

export function buildReviewIssues(payload, numericIssues = [], assets = []) {
  const entries = [
    ...numericIssues,
    ...assets.filter((asset) => !asset.accepted).map((asset) => ({
      field: asset.field,
      reasons: assetReasons(asset),
      selectedAssetId: asset.selected?.id,
      score: asset.score,
      runnerUpGap: asset.runnerUpGap,
    })),
  ];
  const issues = new Map();
  for (const entry of entries) {
    const target = reviewTarget(payload, entry.field);
    if (!target) continue;
    const key = reviewTargetKey(target);
    const existing = issues.get(key);
    issues.set(key, {
      key,
      target,
      reasons: [...new Set([...(existing?.reasons ?? []), ...entry.reasons])],
      ...(entry.detectedText ? {detectedText: entry.detectedText} : {}),
      ...(entry.selectedAssetId ? {selectedAssetId: entry.selectedAssetId} : {}),
      ...(Number.isFinite(entry.score) ? {score: entry.score} : {}),
      ...(entry.runnerUpGap === null || Number.isFinite(entry.runnerUpGap) ? {runnerUpGap: entry.runnerUpGap} : {}),
      status: "OPEN",
      resolvedAt: null,
    });
  }
  return [...issues.values()];
}

function assetReasons(asset) {
  const reasons = [];
  if (asset.methodAgreed === false || asset.overlayAgreed === false) reasons.push("METHOD_DISAGREEMENT");
  if (String(asset.reason).includes("constraint")) reasons.push("CONSTRAINT_OVERRIDE");
  const minimumGap = asset.kind === "ban" ? 12 : ["spell", "item", "trinket", "quest"].includes(asset.kind) ? 10 : 18;
  if (!reasons.length || String(asset.reason).includes("low-confidence") || Number(asset.runnerUpGap) < minimumGap) reasons.push("LOW_MARGIN");
  return [...new Set(reasons)];
}

function reviewTarget(payload, field) {
  let match = field.match(/^teamStats\[(\d+)]\.bans\[(\d+)]$/);
  if (match) return {scope: "TEAM", team: payload.teamStats[Number(match[1])]?.team, field: "ban", slot: Number(match[2])};
  match = field.match(/^participants\[(\d+)]\.(level|champion|primaryPerk|summonerSpells\[(\d+)]|items\[(\d+)]|trinket|questSlot)$/);
  if (!match) return null;
  const participant = payload.participants[Number(match[1])];
  if (!participant?.role) return null;
  if (match[2].startsWith("summonerSpells")) return {scope: "PARTICIPANT", team: participant.team, role: participant.role, field: "summonerSpell", slot: Number(match[3])};
  if (match[2].startsWith("items")) return {scope: "PARTICIPANT", team: participant.team, role: participant.role, field: "item", slot: Number(match[4])};
  return {scope: "PARTICIPANT", team: participant.team, role: participant.role, field: match[2]};
}

function reviewTargetKey(target) {
  return target.scope === "TEAM"
    ? `team:${target.team}:ban:${target.slot}`
    : `participant:${target.team}:${target.role}:${target.field}:${target.slot ?? ""}`;
}

function reconcileNumericAlternatives(teamStats, participants, alternatives) {
  const fields = [["kills", "kills"], ["deaths", "deaths"], ["assists", "assists"], ["goldTotal", "goldEarned"]];
  for (const stats of teamStats) {
    const memberIndexes = participants.map((participant, index) => ({participant, index})).filter(({participant}) => participant.team === stats.team).map(({index}) => index);
    for (const [teamField, participantField] of fields) {
      const pools = memberIndexes.map((index) => [...new Set(alternatives[index][participantField].filter(Number.isInteger))]);
      let selected = null;
      const visit = (memberIndex, values, sum) => {
        if (selected || sum > stats[teamField]) return;
        if (memberIndex === pools.length) {
          if (sum === stats[teamField]) selected = [...values];
          return;
        }
        for (const value of pools[memberIndex]) {
          values.push(value); visit(memberIndex + 1, values, sum + value); values.pop();
        }
      };
      visit(0, [], 0);
      if (!selected) continue;
      memberIndexes.forEach((participantIndex, memberIndex) => {
        participants[participantIndex][participantField] = selected[memberIndex];
      });
    }
  }
}

async function runCli() {
  const argv = process.argv.slice(2);
  const screenshotPath = argv[0];
  if (!screenshotPath || screenshotPath.startsWith("--")) usage();
  const original = await readFile(screenshotPath);
  const result = await readScoreboardImage(original, {
    players: await loadRegisteredPlayers(option(argv, "--players")),
    resolveAssets: !argv.includes("--no-resolve"),
    allowAmbiguous: !argv.includes("--strict-assets"),
  });
  const outputPath = option(argv, "--output") ?? "resolved-match.json";
  await writeFile(outputPath, `${JSON.stringify(result.payload, null, 2)}\n`, {mode: 0o600});
  const recognizedOutput = option(argv, "--recognized-output");
  const alignedOutput = option(argv, "--aligned-output");
  const reportOutput = option(argv, "--report-output");
  if (recognizedOutput) await writeFile(recognizedOutput, `${JSON.stringify(result.recognizedPayload, null, 2)}\n`, {mode: 0o600});
  if (alignedOutput) await writeFile(alignedOutput, result.aligned, {mode: 0o600});
  if (reportOutput) await writeFile(reportOutput, `${JSON.stringify(result.report, null, 2)}\n`, {mode: 0o600});
  const reviewCount = result.report.assets.filter((asset) => !asset.accepted).length;
  if (reviewCount) process.stdout.write(`Staged web review will include ${reviewCount} low-confidence assets.\n`);
  process.stdout.write(`Mechanical scoreboard read completed in ${result.report.elapsedMs}ms (alignment confidence ${(result.report.layout.confidence * 100).toFixed(0)}%).\n`);
}

async function numberField(field, centerX, centerY, width, {blankIsZero = false, narrowRetry = false, allowMissing = false, highContrast = false} = {}) {
  let result = await textField(field, {left: Math.round(centerX - width / 2), top: centerY - 13, width, height: 26}, highContrast ? "number-high" : "number");
  let value = parseInteger(result.text);
  if (value === null && narrowRetry) {
    result = await textField(`${field}.narrow`, {left: Math.round(centerX - 12), top: centerY - 13, width: 18, height: 26}, "number");
    value = parseInteger(result.text);
  }
  if (value === null && blankIsZero && result.text.trim() === "") return 0;
  if (value === null && allowMissing) return null;
  if (value === null) fail(`${field} 숫자를 읽지 못했습니다.`);
  return value;
}

async function alignToCanvas(buffer, info, transform) {
  if (transform.xScale !== 1 || transform.yScale !== 1) fail("점수판 정렬은 리사이즈를 허용하지 않습니다.");
  const width = info.width;
  const height = info.height;
  const left = Math.round(transform.xOffset); const top = Math.round(transform.yOffset);
  const sourceLeft = Math.max(0, -left); const sourceTop = Math.max(0, -top);
  const destinationLeft = Math.max(0, left); const destinationTop = Math.max(0, top);
  const copyWidth = Math.min(width - sourceLeft, CANVAS.width - destinationLeft);
  const copyHeight = Math.min(height - sourceTop, CANVAS.height - destinationTop);
  if (copyWidth <= 0 || copyHeight <= 0) fail("정렬 변환 결과가 캔버스를 벗어났습니다.");
  const visible = await sharp(buffer).extract({left: sourceLeft, top: sourceTop, width: copyWidth, height: copyHeight}).removeAlpha().png().toBuffer();
  return sharp({create: {width: CANVAS.width, height: CANVAS.height, channels: 3, background: "#001018"}})
    .composite([{input: visible, left: destinationLeft, top: destinationTop}]).png().toBuffer();
}

async function prepareOcrCrop(buffer, rectangle, type, highContrast = false) {
  const scale = ["number", "kda"].includes(type) ? 5 : 4;
  let pipeline = sharp(buffer)
    .extract(clampRectangle(rectangle))
    .resize({width: rectangle.width * scale, height: rectangle.height * scale, kernel: "lanczos3"})
    .sharpen({sigma: 0.7});
  if (highContrast) pipeline = pipeline.grayscale().normalize().threshold(90);
  return pipeline.extend({top: 18, bottom: 18, left: 22, right: 22, background: "#001018"}).png().toBuffer();
}

async function occupied(buffer, rectangle) {
  const inset = 2;
  const interior = {
    left: rectangle.left + inset,
    top: rectangle.top + inset,
    width: rectangle.width - inset * 2,
    height: rectangle.height - inset * 2,
  };
  const {data, info} = await sharp(buffer).extract(clampRectangle(interior)).removeAlpha().raw().toBuffer({resolveWithObject: true});
  const pixels = info.width * info.height;
  const sums = [0, 0, 0]; const squared = [0, 0, 0];
  for (let index = 0; index < data.length; index += info.channels) {
    for (let channel = 0; channel < 3; channel += 1) {
      sums[channel] += data[index + channel]; squared[channel] += data[index + channel] ** 2;
    }
  }
  const means = sums.map((sum) => sum / pixels);
  const deviations = squared.map((sum, channel) => Math.sqrt(Math.max(0, sum / pixels - means[channel] ** 2)));
  return Math.max(...deviations) >= 12 || Math.max(...means) >= 32;
}

export async function loadRegisteredPlayers(path) {
  if (path) {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return Array.isArray(parsed) ? parsed : parsed.players ?? [];
  }
  const baseUrl = process.env.BIBI_WEB_BASE_URL?.replace(/\/$/, "");
  const token = process.env.BIBI_INGEST_TOKEN;
  if (!baseUrl || !token) return [];
  const cacheKey = createHash("sha256").update(baseUrl).digest("hex").slice(0, 12);
  const cachePath = join(tmpdir(), `bibi-player-catalog-${cacheKey}.json`);
  let stalePlayers = null;
  try {
    const cacheStat = await stat(cachePath);
    stalePlayers = JSON.parse(await readFile(cachePath, "utf8")).players ?? [];
    if (Date.now() - cacheStat.mtimeMs < 10 * 60 * 1000) return stalePlayers;
  } catch {}
  try {
    const response = await fetch(`${baseUrl}/api/internal/lol-match-results`, {headers: {authorization: `Bearer ${token}`}, signal: AbortSignal.timeout(15_000)});
    if (!response.ok) fail(`등록 선수 목록 요청 실패 (${response.status})`);
    const payload = await response.json();
    await writeFile(cachePath, JSON.stringify(payload), {mode: 0o600});
    return payload.players ?? [];
  } catch (error) {
    if (stalePlayers) return stalePlayers;
    throw error;
  }
}

function ensureNumbers(teamStats, participants) {
  const values = [
    ...teamStats.flatMap((stats) => [[`${stats.team}.kills`, stats.kills], [`${stats.team}.deaths`, stats.deaths], [`${stats.team}.assists`, stats.assists], [`${stats.team}.goldTotal`, stats.goldTotal], ...Object.entries(stats.objectives).map(([field, value]) => [`${stats.team}.objectives.${field}`, value])]),
    ...participants.flatMap((participant, index) => ["level", "kills", "deaths", "assists", "cs", "goldEarned"].map((field) => [`participants.${index}.${field}`, participant[field]])),
  ];
  const invalid = values.filter(([, value]) => !Number.isInteger(value) || value < 0).map(([field]) => field);
  if (invalid.length) fail(`OCR 결과에 올바르지 않은 숫자가 있습니다: ${invalid.join(", ")}`);
}

function compactOcrName(value) {
  const compact = String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
  return compact || "확인 필요";
}

function clampRectangle(rectangle) {
  const left = Math.max(0, Math.min(CANVAS.width - 1, Math.round(rectangle.left)));
  const top = Math.max(0, Math.min(CANVAS.height - 1, Math.round(rectangle.top)));
  return {left, top, width: Math.min(Math.round(rectangle.width), CANVAS.width - left), height: Math.min(Math.round(rectangle.height), CANVAS.height - top)};
}

function option(argv, name) { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : undefined; }
function usage() {
  process.stderr.write("Usage: read-scoreboard.mjs <screenshot> [--output resolved.json] [--players players.json] [--recognized-output draft.json] [--aligned-output aligned.png] [--report-output report.json] [--strict-assets] [--no-resolve]\n");
  process.exitCode = 2;
  throw new Error("점수판 이미지 경로가 필요합니다.");
}
function fail(message) { throw new Error(message); }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
