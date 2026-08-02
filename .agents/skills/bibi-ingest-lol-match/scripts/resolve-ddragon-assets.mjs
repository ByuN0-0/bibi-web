#!/usr/bin/env node
import {createHash} from "node:crypto";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";

const ORIGIN = "https://ddragon.leagueoflegends.com";
const binaryCache = new Map();
const iconCache = new Map();
let normalizedScreenPromise;
let sharpPromise;
const argv = process.argv.slice(2);
const inputPath = argv[0];
const screenshotPath = option("--screenshot");
const outputPath = option("--output") ?? "resolved-match.json";
const diagnosticsOutput = option("--diagnostics-output");
const cacheDir = option("--cache") ?? join(tmpdir(), "bibi-ddragon-cache");
const offsetY = numberOption("--offset-y", 0);
if (!inputPath || inputPath.startsWith("--")) fail("Usage: resolve-ddragon-assets.mjs <recognized.json> [--screenshot image.png] [--output resolved.json] [--cache directory]");

await mkdir(cacheDir, {recursive: true});
const payload = JSON.parse(await readFile(inputPath, "utf8"));
const versions = await cachedJson(`${ORIGIN}/api/versions.json`, join(cacheDir, "versions.json"));
payload.ddragonVersion ||= versions[0];
if (!versions.includes(payload.ddragonVersion)) fail(`Unknown Data Dragon version: ${payload.ddragonVersion}`);
const version = payload.ddragonVersion;
const dataBase = `${ORIGIN}/cdn/${version}/data/ko_KR`;
const [championData, itemData, spellData, runeTrees] = await Promise.all([
  cachedJson(`${dataBase}/champion.json`, join(cacheDir, `${version}-champion.json`)),
  cachedJson(`${dataBase}/item.json`, join(cacheDir, `${version}-item.json`)),
  cachedJson(`${dataBase}/summoner.json`, join(cacheDir, `${version}-summoner.json`)),
  cachedJson(`${dataBase}/runesReforged.json`, join(cacheDir, `${version}-runes.json`)),
]);

const champions = Object.values(championData.data).filter((entry) => !entry.id.includes("_")).map((entry) => candidate(entry.id, entry.name, `img/champion/${entry.image.full}`, entry.image));
const allItems = Object.entries(itemData.data)
  .filter(([, entry]) => !entry.name.includes("<"))
  .map(([id, entry]) => candidate(id, entry.name, `img/item/${entry.image.full}`, entry.image));
const catalogs = {
  champion: champions,
  ban: champions,
  item: allItems.filter((entry) => itemData.data[entry.id]?.maps?.["11"] === true),
  quest: allItems,
  spell: Object.values(spellData.data).filter((entry) => entry.modes?.includes("CLASSIC")).map((entry) => candidate(entry.id, entry.name, `img/spell/${entry.image.full}`, entry.image)),
  perk: runeTrees.flatMap((tree) => tree.slots.flatMap((slot) => slot.runes)).map((entry) => candidate(String(entry.id), entry.name, entry.icon, null)),
};
const screenshot = screenshotPath ? await readFile(screenshotPath) : null;
if (!payload.ingestionId) {
  if (!screenshot) fail("ingestionId is required when --screenshot is omitted.");
  payload.ingestionId = `lol-scoreboard:${createHash("sha256").update(screenshot).digest("hex")}`;
}

const unresolved = [];
for (const [teamIndex, team] of payload.teamStats.entries()) {
  team.bans = await resolveSlots(team.bans, "ban", `teamStats[${teamIndex}].bans`, banCoordinates(team.team), true);
}
const teamRowIndex = {BLUE: 0, RED: 0};
for (const [index, participant] of payload.participants.entries()) {
  if (!(participant.team in teamRowIndex)) fail(`participants[${index}].team must be BLUE or RED.`);
  const teamOffset = teamRowIndex[participant.team]++;
  if (teamOffset > 4) fail(`${participant.team} contains more than five participant rows.`);
  const row = (participant.team === "BLUE" ? [207, 242, 277, 312, 347] : [422, 457, 492, 527, 562])[teamOffset] + offsetY;
  participant.champion = await resolveValue(participant.champion, "champion", `participants[${index}].champion`, {left: 94, top: row - 10, width: 24, height: 24});
  participant.primaryPerk = await resolveValue(participant.primaryPerk, "perk", `participants[${index}].primaryPerk`, {left: 18, top: row - 10, width: 20, height: 20});
  participant.summonerSpells = await resolveSlots(participant.summonerSpells, "spell", `participants[${index}].summonerSpells`, [{left: 44, top: row - 13, width: 12, height: 12}, {left: 44, top: row + 2, width: 12, height: 12}], false);
  participant.items = await resolveSlots(participant.items, "item", `participants[${index}].items`, [288, 313, 338, 363, 388, 413].map((left) => ({left, top: row - 9, width: 20, height: 20})), true);
  participant.trinket = await resolveNullable(participant.trinket, "item", `participants[${index}].trinket`, {left: 438, top: row - 9, width: 20, height: 20});
  participant.questSlot = await resolveNullable(participant.questSlot, "quest", `participants[${index}].questSlot`, {left: 472, top: row - 9, width: 20, height: 20});
}

if (unresolved.length) {
  if (diagnosticsOutput) await writeFile(diagnosticsOutput, `${JSON.stringify(payload, null, 2)}\n`, {mode: 0o600});
  fail(`Unresolved or ambiguous assets:\n${unresolved.map((entry) => `- ${entry}`).join("\n")}`);
}
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, {mode: 0o600});
process.stdout.write(`Resolved Data Dragon ${version} assets into ${outputPath}\n`);

async function resolveSlots(values, kind, field, coordinates, nullable) {
  if (!Array.isArray(values) || values.length !== coordinates.length) fail(`${field} must contain exactly ${coordinates.length} slots.`);
  return Promise.all(values.map((value, index) => nullable && value === null ? null : resolveValue(value, kind, `${field}[${index}]`, coordinates[index])));
}
async function resolveNullable(value, kind, field, coordinates) { return value === null ? null : resolveValue(value, kind, field, coordinates); }
async function resolveValue(value, kind, field, coordinates) {
  if (value && typeof value === "object" && value.id && value.name && value.iconPath) {
    const canonical = catalogs[kind].find((candidate) => candidate.id === String(value.id));
    if (canonical && canonical.name === value.name && canonical.iconPath === value.iconPath) return assetRef(canonical);
  }
  const name = typeof value === "string" ? normalize(value) : "";
  const exact = catalogs[kind].filter((candidate) => normalize(candidate.name) === name);
  if (exact.length === 1) return assetRef(exact[0]);
  const standardIdMatch = exact.filter((candidate) => /^\d{4}$/.test(candidate.id));
  if (standardIdMatch.length === 1) return assetRef(standardIdMatch[0]);
  if (!screenshot) { unresolved.push(`${field}: ${value ?? "missing"}`); return null; }
  const matched = await compareCrop(screenshot, coordinates, catalogs[kind], kind);
  if (!matched) unresolved.push(`${field}: ${value ?? "missing"}`);
  return matched ? assetRef(matched) : null;
}

async function compareCrop(buffer, crop, candidates, kind) {
  const sharp = await getSharp();
  normalizedScreenPromise ??= sharp(buffer).resize({width: 1028}).png().toBuffer();
  const normalizedScreen = await normalizedScreenPromise;
  const normalized = await sharp(normalizedScreen).extract(crop).resize(32, 32).removeAlpha().raw().toBuffer();
  const targetHash = differenceHash(normalized, 32, 32, 3);
  const scored = [];
  for (const candidate of candidates) {
    const icon = await cachedCandidateIcon(candidate, kind);
    if (!icon) continue;
    scored.push({candidate, icon, hashDistance: hamming(targetHash, differenceHash(icon, 32, 32, 3))});
  }
  const hashShortlist = scored.sort((a, b) => a.hashDistance - b.hashDistance).slice(0, 5)
    .map((entry) => ({...entry, pixelError: meanError(normalized, entry.icon, kind)}))
    .sort((a, b) => a.pixelError - b.pixelError);
  const hashConfident = isUniqueMatch(hashShortlist, 260, 25);
  const precisionPool = hashConfident
    ? hashShortlist
    : scored.map((entry) => ({...entry, pixelError: meanError(normalized, entry.icon, kind)}))
      .sort((a, b) => a.pixelError - b.pixelError)
      .slice(0, 5);
  if (process.env.BIBI_DDRAGON_DEBUG === "1") process.stderr.write(`${kind} candidates${hashConfident ? "" : " (full scan)"}: ${precisionPool.map((entry) => `${entry.candidate.name}:${entry.hashDistance}/${Math.round(entry.pixelError)}`).join(", ")}\n`);
  return isUniqueMatch(precisionPool, 480, 18) ? precisionPool[0].candidate : null;
}

async function cachedCandidateIcon(entry, kind) {
  const key = `${version}:${kind}:${entry.id}`;
  let pending = iconCache.get(key);
  if (!pending) {
    pending = (async () => {
      const cachePath = join(cacheDir, version, kind, `${entry.id}-color-v3.raw`);
      try { return await readFile(cachePath); } catch {}
      const source = await candidateImage(entry);
      if (!source) return null;
      const sharp = await getSharp();
      const pipeline = sharp(source).removeAlpha();
      const icon = kind === "champion"
        ? await pipeline.resize(40, 40).extract({left: 4, top: 4, width: 32, height: 32}).raw().toBuffer()
        : await pipeline.resize(32, 32).raw().toBuffer();
      await mkdir(join(cacheDir, version, kind), {recursive: true});
      await writeFile(cachePath, icon);
      return icon;
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
    && (!candidates[1] || Math.abs(candidates[1].pixelError - candidates[0].pixelError) >= margin));
}

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
    if ((kind === "champion" || kind === "perk" || kind === "ban") && ((x - 15.5) ** 2 + (y - 15.5) ** 2 > 210)) continue;
    if (kind === "ban" && Math.abs(x - y) < 3) continue;
    pixels.push(pixel);
  }
  const correlations = [0, 1, 2].map((channel) => correlation(left, right, pixels, channel));
  const luminanceCorrelation = correlation(left, right, pixels, -1);
  const colorCorrelation = correlations.reduce((sum, value) => sum + value, 0) / correlations.length;
  return (1 - (luminanceCorrelation * 0.65 + colorCorrelation * 0.35)) * 1000;
}
function banCoordinates(team) { const top = (team === "BLUE" ? 190 : 405) + offsetY; return [[846, top], [911, top], [976, top], [846, top + 35], [911, top + 35]].map(([left, y]) => ({left, top: y, width: 25, height: 25})); }
function normalize(value) { return String(value).normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR"); }
function candidate(id, name, iconPath, image) { return {id: String(id), name, iconPath, image}; }
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
function option(name) { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : undefined; }
function numberOption(name, fallback) { const value = option(name); if (value === undefined) return fallback; const parsed = Number(value); if (!Number.isFinite(parsed) || Math.abs(parsed) > 100) fail(`${name} must be a number between -100 and 100.`); return Math.round(parsed); }
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
function fail(message) { process.stderr.write(`${message}\n`); process.exit(1); }
