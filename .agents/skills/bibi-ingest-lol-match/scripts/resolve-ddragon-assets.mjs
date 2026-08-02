#!/usr/bin/env node
import {createHash} from "node:crypto";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";

const ORIGIN = "https://ddragon.leagueoflegends.com";
const argv = process.argv.slice(2);
const inputPath = argv[0];
const screenshotPath = option("--screenshot");
const outputPath = option("--output") ?? "resolved-match.json";
const cacheDir = option("--cache") ?? join(tmpdir(), "bibi-ddragon-cache");
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

const catalogs = {
  champion: Object.values(championData.data).filter((entry) => !entry.id.includes("_")).map((entry) => ({id: entry.id, name: entry.name, iconPath: `img/champion/${entry.image.full}`})),
  item: Object.entries(itemData.data).filter(([, entry]) => entry.maps?.["11"] !== false).map(([id, entry]) => ({id, name: entry.name, iconPath: `img/item/${entry.image.full}`})),
  spell: Object.values(spellData.data).filter((entry) => entry.modes?.includes("CLASSIC")).map((entry) => ({id: entry.id, name: entry.name, iconPath: `img/spell/${entry.image.full}`})),
  perk: runeTrees.flatMap((tree) => tree.slots.flatMap((slot) => slot.runes)).map((entry) => ({id: String(entry.id), name: entry.name, iconPath: entry.icon})),
};
const screenshot = screenshotPath ? await readFile(screenshotPath) : null;
if (!payload.ingestionId) {
  if (!screenshot) fail("ingestionId is required when --screenshot is omitted.");
  payload.ingestionId = `lol-scoreboard:${createHash("sha256").update(screenshot).digest("hex")}`;
}

const unresolved = [];
for (const [teamIndex, team] of payload.teamStats.entries()) {
  team.bans = await resolveSlots(team.bans, "champion", `teamStats[${teamIndex}].bans`, banCoordinates(team.team), true);
}
const teamRowIndex = {BLUE: 0, RED: 0};
for (const [index, participant] of payload.participants.entries()) {
  if (!(participant.team in teamRowIndex)) fail(`participants[${index}].team must be BLUE or RED.`);
  const teamOffset = teamRowIndex[participant.team]++;
  if (teamOffset > 4) fail(`${participant.team} contains more than five participant rows.`);
  const row = (participant.team === "BLUE" ? [207, 242, 277, 312, 347] : [422, 457, 492, 527, 562])[teamOffset];
  participant.champion = await resolveValue(participant.champion, "champion", `participants[${index}].champion`, {left: 94, top: row - 10, width: 24, height: 24});
  participant.primaryPerk = await resolveValue(participant.primaryPerk, "perk", `participants[${index}].primaryPerk`, {left: 18, top: row - 10, width: 20, height: 20});
  participant.summonerSpells = await resolveSlots(participant.summonerSpells, "spell", `participants[${index}].summonerSpells`, [{left: 43, top: row - 14, width: 14, height: 14}, {left: 43, top: row + 1, width: 14, height: 14}], false);
  participant.items = await resolveSlots(participant.items, "item", `participants[${index}].items`, [286, 311, 336, 361, 386, 411].map((left) => ({left, top: row - 11, width: 22, height: 22})), true);
  participant.trinket = await resolveNullable(participant.trinket, "item", `participants[${index}].trinket`, {left: 436, top: row - 11, width: 22, height: 22});
  participant.questSlot = await resolveNullable(participant.questSlot, "item", `participants[${index}].questSlot`, {left: 469, top: row - 11, width: 22, height: 22});
}

if (unresolved.length) fail(`Unresolved or ambiguous assets:\n${unresolved.map((entry) => `- ${entry}`).join("\n")}`);
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
    if (canonical && canonical.name === value.name && canonical.iconPath === value.iconPath) return canonical;
  }
  const name = typeof value === "string" ? normalize(value) : "";
  const exact = catalogs[kind].filter((candidate) => normalize(candidate.name) === name);
  if (exact.length === 1) return exact[0];
  if (!screenshot) { unresolved.push(`${field}: ${value ?? "missing"}`); return null; }
  const matched = await compareCrop(screenshot, coordinates, catalogs[kind], kind);
  if (!matched) unresolved.push(`${field}: ${value ?? "missing"}`);
  return matched;
}

async function compareCrop(buffer, crop, candidates, kind) {
  let sharp;
  try { ({default: sharp} = await import("sharp")); } catch { fail("Image fallback requires the project sharp dependency."); }
  const normalizedScreen = await sharp(buffer).resize({width: 1028}).png().toBuffer();
  const normalized = await sharp(normalizedScreen).extract(crop).resize(32, 32).removeAlpha().grayscale().raw().toBuffer();
  const targetHash = differenceHash(normalized, 32, 32);
  const scored = [];
  for (const candidate of candidates) {
    const cachePath = join(cacheDir, version, kind, `${candidate.id}-${kind === "champion" ? "center-v2" : "v1"}.raw`);
    let icon;
    try { icon = await readFile(cachePath); } catch {
      const relative = candidate.iconPath.startsWith("perk-images/") ? `/cdn/img/${candidate.iconPath}` : `/cdn/${version}/${candidate.iconPath}`;
      const response = await fetch(`${ORIGIN}${relative}`, {signal: AbortSignal.timeout(10_000)});
      if (!response.ok) continue;
      const pipeline = sharp(Buffer.from(await response.arrayBuffer())).removeAlpha().grayscale();
      icon = kind === "champion"
        ? await pipeline.resize(40, 40).extract({left: 4, top: 4, width: 32, height: 32}).raw().toBuffer()
        : await pipeline.resize(32, 32).raw().toBuffer();
      await mkdir(join(cacheDir, version, kind), {recursive: true});
      await writeFile(cachePath, icon);
    }
    scored.push({candidate, icon, hashDistance: hamming(targetHash, differenceHash(icon, 32, 32))});
  }
  const shortlist = scored.sort((a, b) => a.hashDistance - b.hashDistance).slice(0, 5).map((entry) => ({...entry, pixelError: meanError(normalized, entry.icon, kind)})).sort((a, b) => a.pixelError - b.pixelError);
  if (process.env.BIBI_DDRAGON_DEBUG === "1") process.stderr.write(`${kind} candidates: ${shortlist.map((entry) => `${entry.candidate.name}:${entry.hashDistance}/${Math.round(entry.pixelError)}`).join(", ")}\n`);
  if (!shortlist[0] || shortlist[0].pixelError > 4200 || (shortlist[1] && Math.abs(shortlist[1].pixelError - shortlist[0].pixelError) < 35)) return null;
  return shortlist[0].candidate;
}

function differenceHash(raw, width, height) {
  let hash = 0n;
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) {
    const left = raw[Math.floor(y * height / 8) * width + Math.floor(x * width / 9)];
    const right = raw[Math.floor(y * height / 8) * width + Math.floor((x + 1) * width / 9)];
    hash = (hash << 1n) | (left > right ? 1n : 0n);
  }
  return hash;
}
function hamming(left, right) { let value = left ^ right; let count = 0; while (value) { count += Number(value & 1n); value >>= 1n; } return count; }
function meanError(left, right, kind) {
  let total = 0; let count = 0;
  for (let index = 0; index < left.length; index += 1) {
    const x = index % 32; const y = Math.floor(index / 32);
    if ((kind === "champion" || kind === "perk") && ((x - 15.5) ** 2 + (y - 15.5) ** 2 > 210)) continue;
    if (kind === "champion" && Math.abs(x - y) < 2) continue;
    const delta = left[index] - right[index]; total += delta * delta; count += 1;
  }
  return total / Math.max(1, count);
}
function banCoordinates(team) { const top = team === "BLUE" ? 190 : 405; return [[846, top], [911, top], [976, top], [846, top + 35], [911, top + 35]].map(([left, y]) => ({left, top: y, width: 25, height: 25})); }
function normalize(value) { return String(value).normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR"); }
function option(name) { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : undefined; }
async function cachedJson(url, path) { try { return JSON.parse(await readFile(path, "utf8")); } catch { const response = await fetch(url, {signal: AbortSignal.timeout(10_000)}); if (!response.ok) fail(`Data Dragon request failed (${response.status}): ${url}`); const json = await response.json(); await writeFile(path, JSON.stringify(json)); return json; } }
function fail(message) { process.stderr.write(`${message}\n`); process.exit(1); }
