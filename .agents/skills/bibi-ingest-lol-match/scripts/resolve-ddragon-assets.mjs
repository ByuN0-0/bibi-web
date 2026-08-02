#!/usr/bin/env node
import {createHash} from "node:crypto";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {MATCH_ROLE_ORDER, selectTeamSpellQuestAssignments} from "./scoreboard-machine-core.mjs";

const ORIGIN = "https://ddragon.leagueoflegends.com";
const binaryCache = new Map();
const iconCache = new Map();
let normalizedScreenPromise;
let sharpPromise;
let cacheDir;
let offsetY;
let banOffsetY;
let itemGridLeft;
let itemSlotGap;
let allowAmbiguous;
let payload;
let version;
let catalogs;
let screenshot;
let unresolved;
let resolutions;
let candidatePools;
let resolutionByField;

export async function resolveDataDragonAssets(input, options = {}) {
  cacheDir = options.cacheDir ?? join(tmpdir(), "bibi-ddragon-cache");
  offsetY = options.offsetY ?? 0;
  banOffsetY = options.banOffsetY ?? offsetY;
  itemGridLeft = options.itemGridLeft ?? 281;
  itemSlotGap = options.itemSlotGap ?? 25;
  allowAmbiguous = options.allowAmbiguous ?? false;
  payload = structuredClone(input);
  screenshot = options.screenshot ?? null;
  normalizedScreenPromise = undefined;
  unresolved = [];
  resolutions = [];
  candidatePools = new Map();
  resolutionByField = new Map();
  await mkdir(cacheDir, {recursive: true});

  const versions = await cachedJson(`${ORIGIN}/api/versions.json`, join(cacheDir, "versions.json"));
  payload.ddragonVersion ||= versions[0];
  if (!versions.includes(payload.ddragonVersion)) fail(`Unknown Data Dragon version: ${payload.ddragonVersion}`);
  version = payload.ddragonVersion;
  const dataBase = `${ORIGIN}/cdn/${version}/data/ko_KR`;
  const [championData, itemData, spellData, runeTrees] = await Promise.all([
    cachedJson(`${dataBase}/champion.json`, join(cacheDir, `${version}-champion.json`)),
    cachedJson(`${dataBase}/item.json`, join(cacheDir, `${version}-item.json`)),
    cachedJson(`${dataBase}/summoner.json`, join(cacheDir, `${version}-summoner.json`)),
    cachedJson(`${dataBase}/runesReforged.json`, join(cacheDir, `${version}-runes.json`)),
  ]);
  const champions = Object.values(championData.data).filter((entry) => !entry.id.includes("_")).map((entry) => candidate(entry.id, entry.name, `img/champion/${entry.image.full}`, entry.image));
  const allItems = Object.entries(itemData.data)
    .filter(([, entry]) => !entry.name.includes("<") && !entry.name.includes("Placeholder"))
    .map(([id, entry]) => candidate(id, entry.name, `img/item/${entry.image.full}`, entry.image, questRoleForItem(id, entry)));
  const summonerRiftItems = uniqueCandidates(allItems.filter((entry) => /^\d{4}$/.test(entry.id) && itemData.data[entry.id]?.maps?.["11"] === true));
  const questItems = uniqueCandidates(allItems.filter((entry) => entry.questRole));
  const trinkets = uniqueCandidates(allItems.filter((entry) => ["3340", "3363", "3364"].includes(entry.id)));
  catalogs = {
    champion: champions,
    ban: champions,
    item: summonerRiftItems,
    quest: questItems,
    trinket: trinkets,
    spell: Object.values(spellData.data).filter((entry) => entry.modes?.includes("CLASSIC")).map((entry) => candidate(entry.id, entry.name, `img/spell/${entry.image.full}`, entry.image)),
    perk: runeTrees.flatMap((tree) => tree.slots[0]?.runes ?? []).map((entry) => candidate(String(entry.id), entry.name, entry.icon, null)),
  };
  if (!payload.ingestionId) {
    if (!screenshot) fail("ingestionId is required when --screenshot is omitted.");
    payload.ingestionId = `lol-scoreboard:${createHash("sha256").update(screenshot).digest("hex")}`;
  }

  for (const [teamIndex, team] of payload.teamStats.entries()) {
    team.bans = await resolveSlots(team.bans, "ban", `teamStats[${teamIndex}].bans`, banCoordinates(team.team), true);
  }
  const originalParticipants = [...payload.participants];
  const teamRowIndex = {BLUE: 0, RED: 0};
  for (const [index, participant] of payload.participants.entries()) {
    if (!(participant.team in teamRowIndex)) fail(`participants[${index}].team must be BLUE or RED.`);
    const teamOffset = teamRowIndex[participant.team]++;
    if (teamOffset > 4) fail(`${participant.team} contains more than five participant rows.`);
    const row = (participant.team === "BLUE" ? [207, 242, 277, 312, 347] : [422, 457, 492, 527, 562])[teamOffset] + offsetY;
    participant.champion = await resolveValue(participant.champion, "champion", `participants[${index}].champion`, {left: 89, top: row - 16, width: 32, height: 32});
    participant.primaryPerk = await resolveValue(participant.primaryPerk, "perk", `participants[${index}].primaryPerk`, {left: 18, top: row - 10, width: 20, height: 20});
    participant.summonerSpells = await resolveSlots(participant.summonerSpells, "spell", `participants[${index}].summonerSpells`, [{left: 43, top: row - 12, width: 11, height: 11}, {left: 43, top: row + 3, width: 11, height: 11}], false);
    const inventory = inventoryCoordinates(row);
    participant.items = await resolveSlots(participant.items, "item", `participants[${index}].items`, inventory.items, true);
    participant.trinket = await resolveNullable(participant.trinket, "trinket", `participants[${index}].trinket`, inventory.trinket);
    participant.questSlot = await resolveNullable(participant.questSlot, "quest", `participants[${index}].questSlot`, inventory.quest);
  }
  for (const team of ["BLUE", "RED"]) applyTeamSpellQuestConstraints(team);
  payload.participants.sort((left, right) => ["BLUE", "RED"].indexOf(left.team) - ["BLUE", "RED"].indexOf(right.team)
    || MATCH_ROLE_ORDER.indexOf(left.role) - MATCH_ROLE_ORDER.indexOf(right.role));
  const newIndexByParticipant = new Map(payload.participants.map((participant, index) => [participant, index]));
  const oldToNew = new Map(originalParticipants.map((participant, index) => [index, newIndexByParticipant.get(participant)]));
  for (const resolution of resolutions) {
    resolution.field = resolution.field.replace(/^participants\[(\d+)]/, (_, rawIndex) => `participants[${oldToNew.get(Number(rawIndex))}]`);
  }
  if (unresolved.length) fail(`Unresolved or ambiguous assets:\n${unresolved.map((entry) => `- ${entry}`).join("\n")}`);
  return {payload, assets: resolutions, version};
}

async function runCli() {
  const argv = process.argv.slice(2);
  const inputPath = argv[0];
  if (!inputPath || inputPath.startsWith("--")) fail("Usage: resolve-ddragon-assets.mjs <recognized.json> [--screenshot image.png] [--output resolved.json] [--cache directory] [--offset-y pixels] [--ban-offset-y pixels] [--item-grid-left pixels] [--item-slot-gap pixels] [--allow-ambiguous] [--confidence-output report.json]");
  const screenshotPath = option(argv, "--screenshot");
  const outputPath = option(argv, "--output") ?? "resolved-match.json";
  const diagnosticsOutput = option(argv, "--diagnostics-output");
  const confidenceOutput = option(argv, "--confidence-output");
  try {
    const result = await resolveDataDragonAssets(JSON.parse(await readFile(inputPath, "utf8")), {
      screenshot: screenshotPath ? await readFile(screenshotPath) : null,
      cacheDir: option(argv, "--cache") ?? join(tmpdir(), "bibi-ddragon-cache"),
      offsetY: numberOption(argv, "--offset-y", 0),
      banOffsetY: numberOption(argv, "--ban-offset-y", numberOption(argv, "--offset-y", 0)),
      itemGridLeft: numberOption(argv, "--item-grid-left", 281),
      itemSlotGap: numberOption(argv, "--item-slot-gap", 25),
      allowAmbiguous: argv.includes("--allow-ambiguous"),
    });
    await writeFile(outputPath, `${JSON.stringify(result.payload, null, 2)}\n`, {mode: 0o600});
    if (confidenceOutput) await writeFile(confidenceOutput, `${JSON.stringify({assets: result.assets}, null, 2)}\n`, {mode: 0o600});
    process.stdout.write(`Resolved Data Dragon ${result.version} assets into ${outputPath}\n`);
  } catch (error) {
    if (diagnosticsOutput && payload) await writeFile(diagnosticsOutput, `${JSON.stringify(payload, null, 2)}\n`, {mode: 0o600});
    throw error;
  }
}

async function resolveSlots(values, kind, field, coordinates, nullable) {
  if (!Array.isArray(values) || values.length !== coordinates.length) fail(`${field} must contain exactly ${coordinates.length} slots.`);
  return Promise.all(values.map((value, index) => nullable && value === null ? null : resolveValue(value, kind, `${field}[${index}]`, coordinates[index])));
}
async function resolveNullable(value, kind, field, coordinates) { return value === null ? null : resolveValue(value, kind, field, coordinates); }
async function resolveValue(value, kind, field, coordinates) {
  if (value && typeof value === "object" && value.id && value.name && value.iconPath) {
    const canonical = catalogs[kind].find((candidate) => candidate.id === String(value.id));
    if (canonical && canonical.name === value.name && canonical.iconPath === value.iconPath) return exactAsset(canonical, field);
  }
  const name = typeof value === "string" ? normalize(value) : "";
  const exact = catalogs[kind].filter((candidate) => normalize(candidate.name) === name);
  if (exact.length === 1) return exactAsset(exact[0], field);
  const standardIdMatch = exact.filter((candidate) => /^\d{4}$/.test(candidate.id));
  if (standardIdMatch.length === 1) return exactAsset(standardIdMatch[0], field);
  if (!screenshot) { unresolved.push(`${field}: ${value ?? "missing"}`); return null; }
  const matched = await compareCrop(screenshot, coordinates, catalogs[kind], kind, field);
  if (!matched) unresolved.push(`${field}: ${value ?? "missing"}`);
  return matched ? assetRef(matched) : null;
}
function exactAsset(matched, field) {
  candidatePools.set(field, [{candidate: matched, hashDistance: 0, pixelError: 0, matchScore: 0}]);
  return assetRef(matched);
}

async function compareCrop(buffer, crop, candidates, kind, field) {
  const sharp = await getSharp();
  normalizedScreenPromise ??= sharp(buffer).resize({width: 1028}).png().toBuffer();
  const normalizedScreen = await normalizedScreenPromise;
  const normalized = await sharp(normalizedScreen).extract(crop).resize(32, 32).removeAlpha().raw().toBuffer();
  const targetHash = differenceHash(normalized, 32, 32, 3);
  const scored = [];
  for (const candidate of candidates) {
    const icons = await cachedCandidateIcons(candidate, kind);
    for (const icon of icons) scored.push({candidate, icon, hashDistance: hamming(targetHash, differenceHash(icon, 32, 32, 3))});
  }
  const candidateLimit = kind === "quest" ? catalogs.quest.length : 5;
  const precisionPool = bestCandidateVariants(scored.sort((a, b) => a.hashDistance - b.hashDistance).slice(0, 150), normalized, kind).slice(0, candidateLimit);
  candidatePools.set(field, precisionPool);
  if (process.env.BIBI_DDRAGON_DEBUG === "1") process.stderr.write(`${field} ${kind} candidates: ${precisionPool.map((entry) => `${entry.candidate.name}:${entry.hashDistance}/${Math.round(entry.pixelError)}`).join(", ")}\n`);
  const normalMatch = isUniqueMatch(precisionPool, acceptanceThreshold(kind), acceptanceMargin(kind));
  const clearChampionHash = kind === "champion" && precisionPool[0]?.hashDistance <= 20
    && precisionPool[0].pixelError <= 650 && scoreGap(precisionPool) >= 35;
  const clearPerk = kind === "perk" && precisionPool[0]?.pixelError <= 750 && scoreGap(precisionPool) >= 60;
  const selected = precisionPool[0];
  const accepted = normalMatch || clearChampionHash || clearPerk;
  if (selected) {
    const resolution = {field, kind, selected: assetRef(selected.candidate), accepted, score: Math.round(selected.matchScore), runnerUpGap: Math.round(scoreGap(precisionPool))};
    resolutions.push(resolution);
    resolutionByField.set(field, resolution);
  }
  return accepted || (allowAmbiguous && selected) ? selected.candidate : null;
}

function bestCandidateVariants(entries, normalized, kind) {
  const best = new Map();
  for (const entry of entries) {
    const scored = scorePixels(entry, normalized, kind);
    const previous = best.get(entry.candidate.id);
    if (!previous || scored.matchScore < previous.matchScore) best.set(entry.candidate.id, scored);
  }
  return [...best.values()].sort((left, right) => left.matchScore - right.matchScore);
}

function scorePixels(entry, normalized, kind) {
  const rectangular = ["spell", "item", "trinket", "quest"].includes(kind);
  const pixelError = rectangular ? meanAbsoluteError(normalized, entry.icon) : meanError(normalized, entry.icon, kind);
  return {...entry, pixelError, matchScore: pixelError + entry.hashDistance * (rectangular ? 1 : 6)};
}

async function cachedCandidateIcons(entry, kind) {
  const key = `${version}:${kind}:${entry.id}`;
  let pending = iconCache.get(key);
  if (!pending) {
    pending = (async () => {
      const cachePaths = [0, 1, 2].map((variant) => join(cacheDir, version, kind, `${entry.id}-color-v9-${variant}.raw`));
      try { return await Promise.all(cachePaths.map((path) => readFile(path))); } catch {}
      const source = await candidateImage(entry);
      if (!source) return [];
      const sharp = await getSharp();
      const nativeSize = nativeIconSize(kind);
      const icons = await Promise.all([nativeSize - 1, nativeSize, nativeSize + 1].map(async (size) => {
        const rendered = await sharp(source).removeAlpha().resize(size, size).png().toBuffer();
        return sharp(rendered).resize(32, 32).removeAlpha().raw().toBuffer();
      }));
      await mkdir(join(cacheDir, version, kind), {recursive: true});
      await Promise.all(cachePaths.map((path, index) => writeFile(path, icons[index])));
      return icons;
    })();
    iconCache.set(key, pending);
  }
  return pending;
}

async function candidateImage(entry) {
  const sharp = await getSharp();
  if (entry.image?.sprite) {
    const spritePath = join(cacheDir, version, "sprites", entry.image.sprite);
    const sprite = await cachedBinary(`${ORIGIN}/cdn/${version}/img/sprite/${entry.image.sprite}`, spritePath);
    if (!sprite) return null;
    return sharp(sprite).extract({left: entry.image.x, top: entry.image.y, width: entry.image.w, height: entry.image.h}).png().toBuffer();
  }
  const relative = entry.iconPath.startsWith("perk-images/") ? `/cdn/img/${entry.iconPath}` : `/cdn/${version}/${entry.iconPath}`;
  const response = await fetch(`${ORIGIN}${relative}`, {signal: AbortSignal.timeout(10_000)});
  return response.ok ? Buffer.from(await response.arrayBuffer()) : null;
}

async function getSharp() {
  sharpPromise ??= import("sharp").then(({default: sharp}) => sharp).catch(() => null);
  const sharp = await sharpPromise;
  if (!sharp) fail("Image fallback requires the project sharp dependency.");
  return sharp;
}

function isUniqueMatch(candidates, threshold, margin) {
  return Boolean(candidates[0]
    && candidates[0].pixelError <= threshold
    && scoreGap(candidates) >= margin);
}
function scoreGap(candidates) { return candidates[1] ? candidates[1].matchScore - candidates[0].matchScore : Number.POSITIVE_INFINITY; }
function acceptanceThreshold(kind) { return ["spell", "item", "trinket", "quest"].includes(kind) ? 260 : 480; }
function acceptanceMargin(kind) { return ["spell", "item", "trinket", "quest"].includes(kind) ? 10 : 18; }

function differenceHash(raw, width, height, channels) {
  let hash = 0n;
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) {
    const left = luminance(raw, (Math.floor(y * height / 8) * width + Math.floor(x * width / 9)) * channels);
    const right = luminance(raw, (Math.floor(y * height / 8) * width + Math.floor((x + 1) * width / 9)) * channels);
    hash = (hash << 1n) | (left > right ? 1n : 0n);
  }
  return hash;
}
function hamming(left, right) { let value = left ^ right; let count = 0; while (value) { count += Number(value & 1n); value >>= 1n; } return count; }
function meanError(left, right, kind) {
  const pixels = [];
  for (let pixel = 0; pixel < 32 * 32; pixel += 1) {
    const x = pixel % 32; const y = Math.floor(pixel / 32);
    if ((kind === "champion" || kind === "perk" || kind === "ban") && ((x - 15.5) ** 2 + (y - 15.5) ** 2 > (kind === "champion" ? 145 : 210))) continue;
    if (kind === "ban" && Math.abs((x + y) - 31) < 4) continue;
    pixels.push(pixel);
  }
  const correlations = [0, 1, 2].map((channel) => correlation(left, right, pixels, channel));
  const luminanceCorrelation = correlation(left, right, pixels, -1);
  const averageColorCorrelation = correlations.reduce((sum, value) => sum + value, 0) / correlations.length;
  const strongestColorCorrelation = Math.max(...correlations);
  return (1 - (luminanceCorrelation * 0.25 + strongestColorCorrelation * 0.55 + averageColorCorrelation * 0.2)) * 1000;
}
function meanAbsoluteError(left, right) {
  let error = 0;
  for (let index = 0; index < left.length; index += 1) error += Math.abs(left[index] - right[index]);
  return error / (left.length * 255) * 1000;
}
function applyTeamSpellQuestConstraints(team) {
  const members = payload.participants.map((participant, index) => ({participant, index})).filter(({participant}) => participant.team === team);
  const fields = members.map(({index}) => [
    `participants[${index}].summonerSpells[0]`,
    `participants[${index}].summonerSpells[1]`,
    `participants[${index}].questSlot`,
  ]);
  const result = selectTeamSpellQuestAssignments(fields.map((participantFields) => ({
    spellSlots: participantFields.slice(0, 2).map((field) => candidatePools.get(field)),
    questCandidates: candidatePools.get(participantFields[2]),
  })));
  if (!result) {
    unresolved.push(`${team}: five unique position quests could not be resolved`);
    return;
  }
  for (let memberIndex = 0; memberIndex < members.length; memberIndex += 1) {
    const participant = members[memberIndex].participant;
    const assignment = result.assignments[memberIndex];
    participant.role = assignment.role;
    participant.summonerSpells = assignment.spells.map((entry) => assetRef(entry.candidate));
    participant.questSlot = assetRef(assignment.quest.candidate);
    const selected = [...assignment.spells, assignment.quest];
    for (let fieldIndex = 0; fieldIndex < fields[memberIndex].length; fieldIndex += 1) {
      const resolution = resolutionByField.get(fields[memberIndex][fieldIndex]);
      if (!resolution) continue;
      const fieldGap = result.fieldGaps[memberIndex][fieldIndex];
      resolution.selected = assetRef(selected[fieldIndex].candidate);
      resolution.score = Math.round(selected[fieldIndex].matchScore);
      resolution.runnerUpGap = Number.isFinite(fieldGap) ? Math.round(fieldGap) : null;
      resolution.accepted ||= selected[fieldIndex].pixelError <= 260 && fieldGap >= 10;
      resolution.reason = "team-role-spell-quest-constraint";
    }
  }
}
function banCoordinates(team) { const top = (team === "BLUE" ? 198 : 413) + banOffsetY; return [[845, top], [910, top], [975, top], [845, top + 35], [910, top + 35]].map(([left, y]) => ({left, top: y, width: 24, height: 24})); }
function inventoryCoordinates(row) {
  const standardInset = Math.max(2, Math.round(itemSlotGap * 3 / 25));
  const questInset = Math.round(itemSlotGap * 9 / 25) + 2;
  return {
    items: Array.from({length: 6}, (_, index) => ({left: itemGridLeft + index * itemSlotGap + standardInset, top: row - 10, width: 22, height: 22})),
    trinket: {left: itemGridLeft + 6 * itemSlotGap + standardInset, top: row - 10, width: 22, height: 22},
    quest: {left: itemGridLeft + 7 * itemSlotGap + questInset, top: row - 10, width: 22, height: 22},
  };
}
function normalize(value) { return String(value).normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR"); }
function candidate(id, name, iconPath, image, questRole = null) { return {id: String(id), name, iconPath, image, questRole}; }
function questRoleForItem(id, entry) {
  if (["1200", "1220", "1221", "1222"].includes(id)) return "TOP";
  if (["1204", "1209", "1210", "1211"].includes(id)) return "JUNGLE";
  if (["1201", "1206"].includes(id)) return "MIDDLE";
  if (["1202", "1207"].includes(id) || (entry.tags?.includes("Boots") && entry.maps?.["11"] === true)) return "BOTTOM";
  if (["1203", "1208", "2055"].includes(id)) return "UTILITY";
  return null;
}
function uniqueCandidates(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = entry.image?.full ?? entry.iconPath;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
function nativeIconSize(kind) {
  if (kind === "spell") return 11;
  if (kind === "perk") return 20;
  if (kind === "champion") return 32;
  return 22;
}
function assetRef({id, name, iconPath}) { return {id, name, iconPath}; }
function luminance(raw, index) { return raw[index] * 0.2126 + raw[index + 1] * 0.7152 + raw[index + 2] * 0.0722; }
function correlation(left, right, pixels, channel) {
  const sample = (raw, pixel) => channel < 0 ? luminance(raw, pixel * 3) : raw[pixel * 3 + channel];
  const leftMean = pixels.reduce((sum, pixel) => sum + sample(left, pixel), 0) / pixels.length;
  const rightMean = pixels.reduce((sum, pixel) => sum + sample(right, pixel), 0) / pixels.length;
  let covariance = 0; let leftVariance = 0; let rightVariance = 0;
  for (const pixel of pixels) {
    const leftDelta = sample(left, pixel) - leftMean;
    const rightDelta = sample(right, pixel) - rightMean;
    covariance += leftDelta * rightDelta;
    leftVariance += leftDelta * leftDelta;
    rightVariance += rightDelta * rightDelta;
  }
  const denominator = Math.sqrt(leftVariance * rightVariance);
  return denominator ? covariance / denominator : 0;
}
function option(argv, name) { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : undefined; }
function numberOption(argv, name, fallback) { const value = option(argv, name); if (value === undefined) return fallback; const parsed = Number(value); if (!Number.isFinite(parsed) || Math.abs(parsed) > 100) fail(`${name} must be a number between -100 and 100.`); return Math.round(parsed); }
async function cachedJson(url, path) { try { return JSON.parse(await readFile(path, "utf8")); } catch { const response = await fetch(url, {signal: AbortSignal.timeout(10_000)}); if (!response.ok) fail(`Data Dragon request failed (${response.status}): ${url}`); const json = await response.json(); await writeFile(path, JSON.stringify(json)); return json; } }
async function cachedBinary(url, path) {
  let pending = binaryCache.get(path);
  if (!pending) {
    pending = (async () => {
      try { const existing = await readFile(path); if (existing.length) return existing; } catch {}
      const response = await fetch(url, {signal: AbortSignal.timeout(10_000)});
      if (!response.ok) return null;
      const data = Buffer.from(await response.arrayBuffer());
      if (!data.length) return null;
      await mkdir(join(cacheDir, version, "sprites"), {recursive: true});
      await writeFile(path, data);
      return data;
    })().finally(() => binaryCache.delete(path));
    binaryCache.set(path, pending);
  }
  return pending;
}
function fail(message) { throw new Error(message); }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
