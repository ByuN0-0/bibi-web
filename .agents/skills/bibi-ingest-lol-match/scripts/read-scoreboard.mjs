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
  participantRowOffsets,
  REFERENCE_ROWS,
  repairMissingParticipantTotals,
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

export async function readScoreboardImage(original, options = {}) {
  const startedAt = performance.now();
  players = options.players ?? [];
  const cacheRoot = options.cacheRoot ?? tmpdir();
  const normalized = await sharp(original).resize({width: CANVAS.width}).png().toBuffer();
  const {data: normalizedRaw, info: normalizedInfo} = await sharp(normalized).removeAlpha().raw().toBuffer({resolveWithObject: true});
  const layout = detectScoreboardLayout(normalizedRaw, normalizedInfo);
  if (layout.confidence < 0.42) fail(`점수판 아이템 슬롯 앵커를 찾지 못했습니다. confidence=${layout.confidence.toFixed(2)}`);
  // Screenshots retain their native pixel scale. Use the fixed top-right UI
  // anchor to translate the whole scoreboard without resampling it.
  aligned = await alignToCanvas(normalized, normalizedInfo, layout.transform);
  const assetAligned = aligned;
  const rowOffsets = participantRowOffsets(layout);
  const ocrCachePath = join(cacheRoot, "bibi-tesseract-cache");
  await mkdir(ocrCachePath, {recursive: true});
  const workers = await getWorkers(ocrCachePath, options.reuseWorkers ?? false);
  worker = workers.worker;
  englishWorker = workers.englishWorker;
  ocrLog = [];
  ocrQueue = Promise.resolve();
  let recognizedPayload;
  try {
    recognizedPayload = await recognizeScoreboard(original, {
      inventoryImage: assetAligned,
      itemGridLeft: layout.source.itemGridLeft + layout.transform.xOffset,
      itemSlotGap: layout.source.itemSlotGap,
      rowOffsets,
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
      itemGridLeft: layout.source.itemGridLeft + layout.transform.xOffset,
      itemSlotGap: layout.source.itemSlotGap,
      rowOffsets,
    });
    resolvedPayload = resolved.payload;
    report.assets = resolved.assets;
  }
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
  const image = await prepareOcrCrop(aligned, rectangle, type);
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_LINE,
    tessedit_char_whitelist: type === "number" ? "0123456789" : type === "time" ? "0123456789:/.-" : "",
    preserve_interword_spaces: "1",
    user_defined_dpi: "300",
  });
  let result = await worker.recognize(image);
  if (type === "number" && (parseInteger(result.data.text) === null || result.data.confidence < 40)) {
    const fallbackImage = await prepareOcrCrop(aligned, rectangle, type, true);
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
  for (const [team, centerY] of [["BLUE", 169], ["RED", 384]]) {
    const [kills, deaths, assists, goldTotal] = await Promise.all([
      numberField(`${team}.kills`, 143, centerY, 32),
      numberField(`${team}.deaths`, 189, centerY, 32),
      numberField(`${team}.assists`, 234, centerY, 32),
      numberField(`${team}.gold`, 380, centerY, 70),
    ]);
    const objectiveY = team === "BLUE" ? 314 : 529;
    const objectiveXs = [849, 878, 907, 936, 965, 994];
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
  for (const team of ["BLUE", "RED"]) {
    for (let rowIndex = 0; rowIndex < 5; rowIndex += 1) {
      const row = REFERENCE_ROWS[team][rowIndex];
      const index = participants.length;
      const nameRectangle = {left: 124, top: row - 13, width: 154, height: 26};
      const [nameResult, englishNameResult, level, kills, deaths, assists, cs, goldEarned] = await Promise.all([
        textField(`participants.${index}.name`, nameRectangle),
        englishNameField(`participants.${index}.nameEnglish`, nameRectangle),
        numberField(`participants.${index}.level`, 72, row, 28),
        numberField(`participants.${index}.kills`, 516, row, 22, {narrowRetry: true, allowMissing: true}),
        numberField(`participants.${index}.deaths`, 551, row, 22, {narrowRetry: true, allowMissing: true}),
        numberField(`participants.${index}.assists`, 594, row, 22, {narrowRetry: true, allowMissing: true}),
        numberField(`participants.${index}.cs`, 661, row, 48),
        numberField(`participants.${index}.gold`, 740, row, 64, {allowMissing: true}),
      ]);
      const combinedName = `${englishNameResult.text.replace(/[^0-9a-z]/gi, "")}${nameResult.text.replace(/[^가-힣]/g, "")}`;
      const matches = [nameResult.text, englishNameResult.text, combinedName].map((name) => matchRegisteredPlayer(name, players)).filter(Boolean);
      const matched = matches.sort((left, right) => right.confidence - left.confidence)[0] ?? null;
      const detectedName = matched ? matched.observedName : englishNameResult.confidence > nameResult.confidence ? englishNameResult.text : nameResult.text;
      const assetRow = row + (assetLayout.rowOffsets[team]?.[rowIndex] ?? 0);
      const inventory = participantInventoryCoordinates(assetRow, assetLayout.itemGridLeft, assetLayout.itemSlotGap);
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
      ocrLog.push({field: `participants.${index}.mapping`, text: matched ? `${matched.displayName}:${matched.observedName}` : "guest", confidence: matched?.confidence ? matched.confidence * 100 : 0});
    }
  }

  for (const repair of repairMissingParticipantTotals(teamStats, participants)) {
    ocrLog.push({field: `participants.${repair.participantIndex}.${repair.field}.derived`, text: String(repair.value), confidence: 100});
  }
  ensureNumbers(teamStats, participants);
  const totalErrors = validateMechanicalTotals(teamStats, participants);
  if (totalErrors.length) fail(`OCR 합계 검증에 실패했습니다:\n${totalErrors.map((error) => `- ${error}`).join("\n")}`);
  return {
    action: "validate",
    ingestionId: `lol-scoreboard:${createHash("sha256").update(original).digest("hex")}`,
    playedOn, winner, durationSeconds,
    teamStats, participants,
  };
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
  if (reviewCount) process.stdout.write(`Review required for ${reviewCount} low-confidence assets before validation or commit.\n`);
  process.stdout.write(`Mechanical scoreboard read completed in ${result.report.elapsedMs}ms (alignment confidence ${(result.report.layout.confidence * 100).toFixed(0)}%).\n`);
}

async function numberField(field, centerX, centerY, width, {blankIsZero = false, narrowRetry = false, allowMissing = false} = {}) {
  let result = await textField(field, {left: Math.round(centerX - width / 2), top: centerY - 13, width, height: 26}, "number");
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
  const width = Math.max(1, Math.round(info.width * transform.xScale));
  const height = Math.max(1, Math.round(info.height * transform.yScale));
  const resized = await sharp(buffer).resize({width, height, fit: "fill"}).png().toBuffer();
  const left = Math.round(transform.xOffset); const top = Math.round(transform.yOffset);
  const sourceLeft = Math.max(0, -left); const sourceTop = Math.max(0, -top);
  const destinationLeft = Math.max(0, left); const destinationTop = Math.max(0, top);
  const copyWidth = Math.min(width - sourceLeft, CANVAS.width - destinationLeft);
  const copyHeight = Math.min(height - sourceTop, CANVAS.height - destinationTop);
  if (copyWidth <= 0 || copyHeight <= 0) fail("정렬 변환 결과가 캔버스를 벗어났습니다.");
  const visible = await sharp(resized).extract({left: sourceLeft, top: sourceTop, width: copyWidth, height: copyHeight}).png().toBuffer();
  return sharp({create: {width: CANVAS.width, height: CANVAS.height, channels: 3, background: "#001018"}})
    .composite([{input: visible, left: destinationLeft, top: destinationTop}]).png().toBuffer();
}

async function prepareOcrCrop(buffer, rectangle, type, highContrast = false) {
  const scale = type === "number" ? 5 : 4;
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
