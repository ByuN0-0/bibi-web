#!/usr/bin/env node
import {createHash} from "node:crypto";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {MATCH_ROLE_ORDER, REFERENCE_ROWS, selectTeamSpellQuestAssignments, selectUniqueAssetAssignments} from "./scoreboard-machine-core.mjs";

const ORIGIN = "https://ddragon.leagueoflegends.com";
const SCOREBOARD_KEYSTONE_NAMES = new Set([
  "폭풍전사의포효", "콩콩이소환", "죽음불꽃손길", "신비로운유성", "어둠의수확", "감전", "칼날비",
  "기민한발놀림", "치명적속도", "집중공격", "정복자", "수호자", "여진", "착취의손아귀",
  "빙결강화", "선제공격", "봉인풀린주문서",
]);
const UNSELECTED_BAN_SHAPE_HASH = 0x8143444f572e58a0n;
const binaryCache = new Map();
const iconCache = new Map();
const iconHashCache = new WeakMap();
let normalizedScreenPromise;
let banOverlayModelPromise;
let banComparisonIconCache = new WeakMap();
let sharpPromise;
let cacheDir;
let offsetY;
let banOffsetY;
let itemGridLeft;
let itemSlotGap;
let rowOffsets;
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
  itemGridLeft = options.itemGridLeft ?? 290;
  itemSlotGap = options.itemSlotGap ?? 25;
  rowOffsets = options.rowOffsets ?? {};
  allowAmbiguous = options.allowAmbiguous ?? false;
  payload = structuredClone(input);
  screenshot = options.screenshot ?? null;
  normalizedScreenPromise = undefined;
  banOverlayModelPromise = undefined;
  banComparisonIconCache = new WeakMap();
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
    .map(([id, entry]) => candidate(id, entry.name, `img/item/${entry.image.full}`, entry.image, questRoleForItem(id, entry), {
      inventoryEligible: isObtainableInventoryItem(id, entry),
      requiredChampion: entry.requiredChampion ?? null,
    }));
  const summonerRiftItems = uniqueCandidates(allItems.filter((entry) => entry.inventoryEligible));
  const questItems = uniqueCandidates(allItems.filter((entry) => entry.questRole));
  const trinkets = uniqueCandidates(allItems.filter((entry) => ["3340", "3363", "3364"].includes(entry.id)));
  catalogs = {
    champion: champions,
    ban: champions,
    item: summonerRiftItems,
    quest: questItems,
    trinket: trinkets,
    spell: Object.values(spellData.data).filter((entry) => entry.modes?.includes("CLASSIC")).map((entry) => candidate(entry.id, entry.name, `img/spell/${entry.image.full}`, entry.image)),
    perk: runeTrees.flatMap((tree) => tree.slots[0]?.runes ?? [])
      .filter((entry) => isScoreboardKeystone(entry.name))
      .map((entry) => candidate(String(entry.id), entry.name, entry.icon, null)),
  };
  if (!payload.ingestionId) {
    if (!screenshot) fail("ingestionId is required when --screenshot is omitted.");
    payload.ingestionId = `lol-scoreboard:${createHash("sha256").update(screenshot).digest("hex")}`;
  }

  for (const [teamIndex, team] of payload.teamStats.entries()) {
    team.bans = await resolveSlots(team.bans, "ban", `teamStats[${teamIndex}].bans`, banCoordinates(team.team), true);
  }
  for (const teamIndex of payload.teamStats.keys()) applyUniqueTeamBans(teamIndex);
  const originalParticipants = [...payload.participants];
  const teamRowIndex = {BLUE: 0, RED: 0};
  for (const [index, participant] of payload.participants.entries()) {
    if (!(participant.team in teamRowIndex)) fail(`participants[${index}].team must be BLUE or RED.`);
    const teamOffset = teamRowIndex[participant.team]++;
    if (teamOffset > 4) fail(`${participant.team} contains more than five participant rows.`);
    const referenceRow = REFERENCE_ROWS[participant.team][teamOffset];
    const row = referenceRow + offsetY + (rowOffsets[participant.team]?.[teamOffset] ?? 0);
    const assetCoordinates = participantAssetCoordinates(row);
    participant.champion = await resolveValue(participant.champion, "champion", `participants[${index}].champion`, assetCoordinates.champion);
    participant.primaryPerk = await resolveValue(participant.primaryPerk, "perk", `participants[${index}].primaryPerk`, assetCoordinates.perk);
    participant.summonerSpells = await resolveSlots(participant.summonerSpells, "spell", `participants[${index}].summonerSpells`, assetCoordinates.spells, false);
    const inventory = participantInventoryCoordinates(row);
    const inventoryCandidates = catalogs.item.filter((candidate) => !candidate.requiredChampion || candidate.requiredChampion === participant.champion.id);
    participant.items = await resolveSlots(participant.items, "item", `participants[${index}].items`, inventory.items, true, inventoryCandidates);
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
  if (Array.isArray(payload.reviewIssues)) {
    for (const issue of payload.reviewIssues) {
      issue.field = String(issue.field).replace(/^participants\[(\d+)]/, (_, rawIndex) => `participants[${oldToNew.get(Number(rawIndex))}]`);
    }
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
      itemGridLeft: numberOption(argv, "--item-grid-left", 290),
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

async function resolveSlots(values, kind, field, coordinates, nullable, candidates = catalogs[kind]) {
  if (!Array.isArray(values) || values.length !== coordinates.length) fail(`${field} must contain exactly ${coordinates.length} slots.`);
  return Promise.all(values.map((value, index) => nullable && value === null ? null : resolveValue(value, kind, `${field}[${index}]`, coordinates[index], candidates)));
}
async function resolveNullable(value, kind, field, coordinates) { return value === null ? null : resolveValue(value, kind, field, coordinates); }
async function resolveValue(value, kind, field, coordinates, candidates = catalogs[kind]) {
  if (kind === "ban" && screenshot && await isUnselectedBan(screenshot, coordinates)) {
    const empty = {candidate: null, hashDistance: 0, pixelError: 0, matchScore: 0};
    candidatePools.set(field, [empty]);
    const resolution = {field, kind, selected: null, accepted: true, score: 0, runnerUpGap: 0, cropOffset: {x: 0, y: 0}, reason: "unselected-ban"};
    resolutions.push(resolution);
    resolutionByField.set(field, resolution);
    return null;
  }
  if (value && typeof value === "object" && value.id && value.name && value.iconPath) {
    const canonical = candidates.find((candidate) => candidate.id === String(value.id));
    if (canonical && canonical.name === value.name && canonical.iconPath === value.iconPath) return exactAsset(canonical, field);
  }
  const name = typeof value === "string" ? normalize(value) : "";
  const exact = candidates.filter((candidate) => normalize(candidate.name) === name);
  if (exact.length === 1) return exactAsset(exact[0], field);
  const standardIdMatch = exact.filter((candidate) => /^\d{4}$/.test(candidate.id));
  if (standardIdMatch.length === 1) return exactAsset(standardIdMatch[0], field);
  if (!screenshot) { unresolved.push(`${field}: ${value ?? "missing"}`); return null; }
  const matched = await compareCrop(screenshot, coordinates, candidates, kind, field);
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
  const banOverlayModel = kind === "ban" ? await getBanOverlayModel(sharp, normalizedScreen) : null;
  const targets = await normalizedCropTargets(sharp, normalizedScreen, crop, kind);
  const evaluated = [];
  for (const target of targets) {
    const targetHash = assetDifferenceHash(target.normalized, kind);
    const scored = [];
    for (const candidate of candidates) {
      const icons = await cachedCandidateIcons(candidate, kind);
      for (const icon of icons) scored.push({candidate, icon, hashDistance: hamming(targetHash, cachedIconHash(icon, kind))});
    }
    const candidateLimit = kind === "quest" ? catalogs.quest.length : 5;
    const hashShortlist = scored.sort((a, b) => a.hashDistance - b.hashDistance).slice(0, kind === "ban" ? scored.length : 150);
    const precisionPool = bestCandidateVariants(hashShortlist, target.normalized, kind).slice(0, candidateLimit);
    if (!precisionPool[0]) continue;
    evaluated.push({
      target,
      precisionPool,
      hashSelected: hashShortlist[0]?.candidate ?? null,
      quality: cropQuality(precisionPool, target),
    });
  }
  const chosen = evaluated.sort((left, right) => left.quality - right.quality)[0];
  if (kind === "ban" && chosen) {
    const overlayMatch = await compareBanOverlayAtOffsets(sharp, normalizedScreen, crop, candidates, banOverlayModel);
    chosen.overlayPool = overlayMatch.pool;
    chosen.overlayOffset = overlayMatch.offset;
  }
  const cleanPool = chosen?.precisionPool ?? [];
  const overlayDecisive = kind === "ban" && isDecisiveBanOverlay(chosen.overlayPool);
  const precisionPool = kind === "ban" && chosen.overlayPool?.length ? chosen.overlayPool : cleanPool;
  const methodAgreed = Boolean(chosen?.hashSelected && cleanPool[0]?.candidate.id === chosen.hashSelected.id);
  const overlayAgreed = kind !== "ban" || Boolean(cleanPool[0] && chosen.overlayPool?.[0]?.candidate.id === cleanPool[0].candidate.id);
  candidatePools.set(field, precisionPool);
  if (process.env.BIBI_DDRAGON_DEBUG === "1") {
    process.stderr.write(`${field} ${kind} crop=${chosen?.target.dx ?? 0},${chosen?.target.dy ?? 0} candidates: ${cleanPool.map((entry) => `${entry.candidate.name}:${entry.hashDistance}/${Math.round(entry.pixelError)}`).join(", ")}\n`);
    if (kind === "ban") process.stderr.write(`${field} ban-overlay candidates: ${chosen.overlayPool.map((entry) => `${entry.candidate.name}:${entry.hashDistance}/${Math.round(entry.pixelError)}`).join(", ")}\n`);
  }
  const uniqueMatch = isUniqueMatch(precisionPool, acceptanceThreshold(kind), acceptanceMargin(kind));
  const clearChampionHash = kind === "champion" && precisionPool[0]?.hashDistance <= 20
    && precisionPool[0].pixelError <= 650 && scoreGap(precisionPool) >= 35;
  const clearPerk = kind === "perk" && precisionPool[0]?.pixelError <= 750 && scoreGap(precisionPool) >= 60;
  const clearItem = (kind === "item" || kind === "trinket")
    && precisionPool[0]?.matchScore <= 160 && scoreGap(precisionPool) >= 60;
  const selected = precisionPool[0];
  const accepted = isAcceptedAssetMatch({kind, methodAgreed, overlayAgreed, overlayDecisive, uniqueMatch, clearChampionHash, clearPerk, clearItem});
  if (selected) {
    const overlaySelected = chosen.overlayPool?.[0];
    const selectedOffset = kind === "ban" ? chosen.overlayOffset : chosen.target;
    const resolution = {field, kind, selected: assetRef(selected.candidate), accepted, methodAgreed, score: Math.round(selected.matchScore), runnerUpGap: Math.round(scoreGap(precisionPool)), cropOffset: {x: selectedOffset.dx, y: selectedOffset.dy}};
    if (kind === "ban") {
      resolution.cleanCropOffset = {x: chosen.target.dx, y: chosen.target.dy};
      resolution.cleanSelected = cleanPool[0] ? assetRef(cleanPool[0].candidate) : null;
      resolution.overlaySelected = overlaySelected ? assetRef(overlaySelected.candidate) : null;
      resolution.overlayAgreed = overlayAgreed;
      resolution.overlayDecisive = overlayDecisive;
      resolution.overlayRunnerUpGap = overlaySelected ? Math.round(scoreGap(chosen.overlayPool)) : null;
      resolution.reason = !methodAgreed || !overlayAgreed
        ? "extracted-ban-method-disagreement"
        : overlayDecisive
        ? "extracted-ban-overlay-decisive"
        : "extracted-ban-overlay-low-confidence";
    } else if (!methodAgreed) {
      resolution.reason = "extracted-method-disagreement";
    }
    resolutions.push(resolution);
    resolutionByField.set(field, resolution);
  }
  return accepted || (allowAmbiguous && selected) ? selected.candidate : null;
}

async function compareBanOverlayAtOffsets(sharp, normalizedScreen, crop, candidates, model) {
  const verticalOffsets = crop.top < 350 ? [-1, 0] : [-1, 0, 1];
  const offsets = verticalOffsets.flatMap((dy) => [-1, 0, 1].map((dx) => ({dx, dy})));
  const evaluated = [];
  for (const offset of offsets) {
    const target = await normalizedBanOverlayTarget(sharp, normalizedScreen, crop, offset);
    const pool = await compareBanOverlayCandidates(candidates, target, model);
    if (pool[0]) evaluated.push({offset, pool, quality: cropQuality(pool, offset)});
  }
  return evaluated.sort((left, right) => left.quality - right.quality)[0] ?? {offset: {dx: 0, dy: 0}, pool: []};
}

export function isDecisiveBanOverlay(pool) {
  return Boolean(pool?.[0]
    && pool[0].pixelError <= 250
    && scoreGap(pool) >= 10);
}

export function isAcceptedAssetMatch({kind, overlayDecisive = false, uniqueMatch = false, clearChampionHash = false, clearPerk = false, clearItem = false}) {
  if (kind === "ban") return overlayDecisive;
  if (uniqueMatch) return true;
  if (kind === "champion") return clearChampionHash;
  if (kind === "item" || kind === "trinket") return clearItem;
  return clearPerk;
}

async function normalizedBanOverlayTarget(sharp, normalizedScreen, crop, offset) {
  const artwork = banArtworkCoordinates(crop, offset);
  return sharp(normalizedScreen)
    .extract(artwork)
    .resize(32, 32)
    .removeAlpha()
    .raw()
    .toBuffer();
}

async function compareBanOverlayCandidates(candidates, target, model) {
  const targetHash = differenceHash(target, 32, 32, 3);
  const entries = [];
  for (const candidate of candidates) {
    const icons = await cachedCandidateIcons(candidate, "ban-overlay");
    for (const icon of icons) {
      const comparisonIcon = applyBanOverlayModel(icon, model);
      const pixelError = meanBanExtractedOverlayError(target, icon, comparisonIcon, model);
      const hashDistance = hamming(targetHash, cachedIconHash(comparisonIcon, "ban-overlay"));
      entries.push({candidate, icon, comparisonIcon, pixelError, hashDistance, matchScore: pixelError});
    }
  }
  const best = new Map();
  for (const entry of entries) {
    const previous = best.get(entry.candidate.id);
    if (!previous || entry.matchScore < previous.matchScore) best.set(entry.candidate.id, entry);
  }
  return [...best.values()].sort((left, right) => left.matchScore - right.matchScore).slice(0, 5);
}

async function normalizedCropTargets(sharp, normalizedScreen, crop, kind) {
  const offsets = assetCropOffsets(kind);
  return Promise.all(offsets.map(async ({dx, dy}) => ({
    dx,
    dy,
    normalized: await sharp(normalizedScreen)
      .extract(kind === "ban"
        ? banArtworkCoordinates(crop, {dx, dy})
        : {...crop, left: crop.left + dx, top: crop.top + dy})
      .resize(32, 32)
      .removeAlpha()
      .raw()
      .toBuffer(),
  })));
}

export function assetCropOffsets(kind) {
  const radius = kind === "champion" ? 2
    : ["ban", "spell", "perk", "item", "trinket", "quest"].includes(kind) ? 1
    : 0;
  const values = Array.from({length: radius * 2 + 1}, (_, index) => index - radius);
  return values.flatMap((dy) => values.map((dx) => ({dx, dy})));
}

export function banArtworkCoordinates(crop, offset = {dx: 0, dy: 0}) {
  return {
    left: crop.left + 10 + offset.dx,
    top: crop.top + (crop.top < 350 ? -7 : -6) + offset.dy,
    width: 26,
    height: 26,
  };
}

function cropQuality(pool, target) {
  const confidenceBonus = Math.min(scoreGap(pool), 150) * 0.35;
  const movementPenalty = (Math.abs(target.dx) + Math.abs(target.dy)) * 2;
  return pool[0].matchScore - confidenceBonus + movementPenalty;
}

function cachedIconHash(icon, kind) {
  let hash = iconHashCache.get(icon);
  if (hash === undefined) {
    hash = assetDifferenceHash(icon, kind);
    iconHashCache.set(icon, hash);
  }
  return hash;
}

async function getBanOverlayModel(sharp, normalizedScreen) {
  banOverlayModelPromise ??= Promise.all(banOverlayExtractionCoordinates().map((rectangle) => (
    sharp(normalizedScreen).extract(rectangle).resize(32, 32).removeAlpha().raw().toBuffer()
  ))).then(extractBanOverlayModel);
  return banOverlayModelPromise;
}

function banOverlayExtractionCoordinates() {
  return ["BLUE", "RED"].flatMap((team) => banCoordinates(team).map((crop) => banArtworkCoordinates(crop)));
}

export function extractBanOverlayModel(crops) {
  if (!Array.isArray(crops) || crops.length < 2) throw new Error("At least two ban crops are required.");
  const colors = Buffer.alloc(32 * 32 * 3);
  const alpha = new Float32Array(32 * 32);
  for (let pixel = 0; pixel < 32 * 32; pixel += 1) {
    const x = pixel % 32; const y = Math.floor(pixel / 32);
    const channels = [0, 1, 2].map((channel) => crops.map((crop) => crop[pixel * 3 + channel]).sort((left, right) => left - right));
    const medians = channels.map((values) => values[Math.floor(values.length / 2)]);
    for (let channel = 0; channel < 3; channel += 1) colors[pixel * 3 + channel] = medians[channel];
    const diagonalDistance = Math.min(Math.abs(x + y - 25), Math.abs(x + y - 35));
    if (diagonalDistance > 3) continue;
    const variance = channels.reduce((sum, values) => {
      const mean = values.reduce((total, value) => total + value, 0) / values.length;
      return sum + values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
    }, 0) / 3;
    const saturation = Math.max(...medians) - Math.min(...medians);
    if (variance >= 1600 || saturation >= 18) continue;
    alpha[pixel] = Math.max(0.35, Math.min(0.92, (1 - variance / 1800) * (1 - saturation / 35)));
  }
  return {colors, alpha};
}

export function applyBanOverlayModel(icon, model) {
  let overlaid = banComparisonIconCache.get(icon);
  if (overlaid) return overlaid;
  overlaid = Buffer.from(icon);
  for (let pixel = 0; pixel < 32 * 32; pixel += 1) {
    const opacity = model.alpha[pixel];
    if (!opacity) continue;
    for (let channel = 0; channel < 3; channel += 1) {
      const index = pixel * 3 + channel;
      overlaid[index] = Math.round(overlaid[index] * (1 - opacity) + model.colors[index] * opacity);
    }
  }
  banComparisonIconCache.set(icon, overlaid);
  return overlaid;
}

async function isUnselectedBan(buffer, crop) {
  const sharp = await getSharp();
  normalizedScreenPromise ??= sharp(buffer).resize({width: 1028}).png().toBuffer();
  const normalizedScreen = await normalizedScreenPromise;
  const fullInterior = {
    left: crop.left + 5,
    top: crop.top + (crop.top < 350 ? -2 : -1),
    width: 24,
    height: 24,
  };
  const raw = await sharp(normalizedScreen).extract(fullInterior).resize(24, 24).removeAlpha().raw().toBuffer();
  return banCropLooksUnselected(raw);
}

export function banCropLooksUnselected(raw) {
  const luminances = [];
  let saturation = 0;
  for (let y = 1; y < 23; y += 1) {
    for (let x = 1; x < 23; x += 1) {
      const diagonal = x + y;
      if (Math.abs(diagonal - 20) <= 2 || Math.abs(diagonal - 28) <= 2) continue;
      const index = (y * 24 + x) * 3;
      const red = raw[index]; const green = raw[index + 1]; const blue = raw[index + 2];
      saturation += Math.max(red, green, blue) - Math.min(red, green, blue);
      luminances.push((red + green + blue) / 3);
    }
  }
  const meanSaturation = saturation / luminances.length;
  const meanLuminance = luminances.reduce((sum, value) => sum + value, 0) / luminances.length;
  const deviation = Math.sqrt(luminances.reduce((sum, value) => sum + (value - meanLuminance) ** 2, 0) / luminances.length);
  const shapeDistance = hamming(UNSELECTED_BAN_SHAPE_HASH, differenceHash(raw, 24, 24, 3));
  return shapeDistance <= 12 && meanSaturation < 18 && meanLuminance < 40 && deviation < 28;
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
      const cacheRevision = kind === "ban-overlay" ? "v13" : "v9";
      const cachePaths = [0, 1, 2].map((variant) => join(cacheDir, version, kind, `${entry.id}-color-${cacheRevision}-${variant}.raw`));
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

export function assetDifferenceHash(raw, kind) {
  return differenceHash(raw, 32, 32, 3, circularMaskRadiusSquared(kind));
}

function circularMaskRadiusSquared(kind) {
  if (kind === "champion") return 145;
  if (kind === "perk" || kind === "ban") return 210;
  return null;
}

function differenceHash(raw, width, height, channels, maskRadiusSquared = null) {
  let hash = 0n;
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) {
    const sampleY = Math.floor(y * height / 8);
    const leftX = Math.floor(x * width / 9);
    const rightX = Math.floor((x + 1) * width / 9);
    const sample = (sampleX) => maskRadiusSquared !== null
      && (sampleX - (width - 1) / 2) ** 2 + (sampleY - (height - 1) / 2) ** 2 > maskRadiusSquared
      ? 0
      : luminance(raw, (sampleY * width + sampleX) * channels);
    const left = sample(leftX);
    const right = sample(rightX);
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
    if (kind === "ban" && Math.abs((x + y) - 31) < 7) continue;
    pixels.push(pixel);
  }
  const correlations = [0, 1, 2].map((channel) => correlation(left, right, pixels, channel));
  const luminanceCorrelation = correlation(left, right, pixels, -1);
  if (kind === "ban") return (1 - luminanceCorrelation) * 1000;
  const averageColorCorrelation = correlations.reduce((sum, value) => sum + value, 0) / correlations.length;
  const strongestColorCorrelation = Math.max(...correlations);
  return (1 - (luminanceCorrelation * 0.25 + strongestColorCorrelation * 0.55 + averageColorCorrelation * 0.2)) * 1000;
}
function meanBanExtractedOverlayError(left, clean, overlaid, model) {
  const allPixels = [];
  const contentPixels = [];
  for (let y = 1; y < 31; y += 1) {
    for (let x = 1; x < 31; x += 1) {
      const pixel = y * 32 + x;
      allPixels.push(pixel);
      if (model.alpha[pixel] < 0.2) contentPixels.push(pixel);
    }
  }
  const overlayError = meanAbsoluteErrorAtPixels(left, overlaid, allPixels);
  const contentError = meanAbsoluteErrorAtPixels(left, clean, contentPixels);
  return overlayError * 0.7 + contentError * 0.3;
}
function meanAbsoluteErrorAtPixels(left, right, pixels) {
  let error = 0;
  for (const pixel of pixels) {
    for (let channel = 0; channel < 3; channel += 1) {
      const index = pixel * 3 + channel;
      error += Math.abs(left[index] - right[index]);
    }
  }
  return error / (pixels.length * 3 * 255) * 1000;
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
function applyUniqueTeamBans(teamIndex) {
  const fields = Array.from({length: 5}, (_, banIndex) => `teamStats[${teamIndex}].bans[${banIndex}]`);
  const result = selectUniqueAssetAssignments(fields.map((field) => candidatePools.get(field)));
  if (!result) {
    unresolved.push(`teamStats[${teamIndex}].bans: five unique champions could not be resolved`);
    return;
  }
  payload.teamStats[teamIndex].bans = result.assignments.map((entry) => assetRef(entry.candidate));
  for (let index = 0; index < fields.length; index += 1) {
    const resolution = resolutionByField.get(fields[index]);
    const selected = result.assignments[index];
    if (resolution?.kind === "ban" && resolution.overlaySelected) {
      resolution.overlayAgreed = resolution.overlayAgreed && resolution.overlaySelected.id === selected.candidate?.id;
    }
    if (!resolution || resolution.selected?.id === selected.candidate?.id) continue;
    resolution.selected = assetRef(selected.candidate);
    resolution.accepted = false;
    resolution.score = Math.round(selected.matchScore);
    resolution.reason = "team-unique-ban-constraint";
  }
}
function banCoordinates(team) { const top = (team === "BLUE" ? 198 : 413) + banOffsetY; return [[845, top], [910, top], [975, top], [845, top + 35], [910, top + 35]].map(([left, y]) => ({left, top: y, width: 24, height: 24})); }
export function participantAssetCoordinates(row) {
  return {
    champion: {left: 97, top: row - 16, width: 32, height: 32},
    perk: {left: 24, top: row - 10, width: 20, height: 20},
    // Each spell's 11px artwork sits inside a shared gold frame. The second
    // icon starts at row+1; row+3 included its lower frame and page background.
    spells: [
      {left: 50, top: row - 12, width: 11, height: 11},
      {left: 50, top: row + 1, width: 11, height: 11},
    ],
  };
}
export function participantInventoryCoordinates(row, gridLeft = itemGridLeft ?? 290, slotGap = itemSlotGap ?? 25) {
  const standardInset = Math.max(2, Math.round(slotGap * 3 / 25));
  const questInset = Math.round(slotGap * 9 / 25) + 2;
  return {
    items: Array.from({length: 6}, (_, index) => ({left: gridLeft + index * slotGap + standardInset, top: row - 12, width: 22, height: 22})),
    trinket: {left: gridLeft + 6 * slotGap + standardInset, top: row - 12, width: 22, height: 22},
    quest: {left: gridLeft + 7 * slotGap + questInset, top: row - 12, width: 22, height: 22},
  };
}
function normalize(value) { return String(value).normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR"); }
function candidate(id, name, iconPath, image, questRole = null, metadata = {}) { return {id: String(id), name, iconPath, image, questRole, ...metadata}; }
export function isObtainableInventoryItem(id, entry) {
  if (!/^\d{4}$/.test(id) || entry.maps?.["11"] !== true || entry.hideFromAll === true) return false;
  return entry.gold?.purchasable === true || (Array.isArray(entry.from) && entry.from.length > 0);
}
export function isScoreboardKeystone(name) { return SCOREBOARD_KEYSTONE_NAMES.has(String(name).replace(/\s+/g, "")); }
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
  if (kind === "ban-overlay") return 32;
  return 22;
}
function assetRef(entry) { return entry ? {id: entry.id, name: entry.name, iconPath: entry.iconPath} : null; }
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
