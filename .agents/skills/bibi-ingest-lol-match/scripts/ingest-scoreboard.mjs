#!/usr/bin/env node
import {readFile, writeFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";
import {loadRegisteredPlayers, readScoreboardImage} from "./read-scoreboard.mjs";
import {submitMatchResult} from "./submit-match-result.mjs";

export async function ingestScoreboard(screenshotPath, options = {}) {
  const startedAt = performance.now();
  const original = await readFile(screenshotPath);
  const players = await loadRegisteredPlayers(options.playersPath);
  const recognition = await readScoreboardImage(original, {
    players,
    allowAmbiguous: true,
    durationSeconds: options.durationSeconds,
    teamStatOverrides: options.teamStatOverrides,
    participantStatOverrides: options.participantStatOverrides,
  });

  const outputPath = options.outputPath ?? null;
  if (outputPath) {
    await writeFile(outputPath, `${JSON.stringify(recognition.payload, null, 2)}\n`, {mode: 0o600});
  }
  if (options.reportPath) {
    await writeFile(options.reportPath, `${JSON.stringify(recognition.report, null, 2)}\n`, {mode: 0o600});
  }

  const uploadStartedAt = performance.now();
  const response = await submitMatchResult(options.validateOnly ? "validate" : "stage", recognition.payload);
  const uploadMs = Math.round(performance.now() - uploadStartedAt);
  return {
    outputPath,
    reportPath: options.reportPath ?? null,
    lowConfidenceAssets: recognition.report.assets.filter((asset) => !asset.accepted).length,
    recognitionMs: recognition.report.elapsedMs,
    uploadMs,
    totalMs: Math.round(performance.now() - startedAt),
    response,
  };
}

async function runCli() {
  const argv = process.argv.slice(2);
  const screenshotPath = argv[0];
  if (!screenshotPath || screenshotPath.startsWith("--")) {
    throw new Error("Usage: ingest-scoreboard.mjs <screenshot> [--duration-seconds seconds] [--team-stat TEAM.field=value] [--participant-stat INDEX.cs=value] [--output resolved.json] [--report-output report.json] [--players players.json] [--validate-only]");
  }
  const result = await ingestScoreboard(screenshotPath, {
    outputPath: option(argv, "--output"),
    reportPath: option(argv, "--report-output"),
    playersPath: option(argv, "--players"),
    durationSeconds: positiveIntegerOption(argv, "--duration-seconds"),
    teamStatOverrides: teamStatOverrides(argv),
    participantStatOverrides: participantStatOverrides(argv),
    validateOnly: argv.includes("--validate-only"),
  });
  if (result.response.reviewPath) {
    const baseUrl = process.env.BIBI_WEB_BASE_URL?.trim().replace(/\/$/, "");
    process.stdout.write(`${baseUrl}${result.response.reviewPath}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify({status: result.response.status, reviewIssues: result.response.reviewIssues ?? []}, null, 2)}\n`);
}

function option(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function positiveIntegerOption(argv, name) {
  const raw = option(argv, name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function teamStatOverrides(argv) {
  const overrides = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--team-stat") continue;
    const match = argv[index + 1]?.match(/^(BLUE|RED)\.(kills|deaths|assists|goldTotal)=(\d+)$/);
    if (!match) throw new Error("--team-stat must be TEAM.field=value");
    const [, team, field, rawValue] = match;
    const value = Number(rawValue);
    if (!Number.isSafeInteger(value)) throw new Error("--team-stat value must be a safe integer");
    overrides[team] ??= {};
    overrides[team][field] = value;
  }
  return overrides;
}

function participantStatOverrides(argv) {
  const overrides = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--participant-stat") continue;
    const match = argv[index + 1]?.match(/^([0-9])\.(cs)=(\d+)$/);
    if (!match) throw new Error("--participant-stat must be INDEX.cs=value");
    const [, participantIndex, field, rawValue] = match;
    const value = Number(rawValue);
    if (!Number.isSafeInteger(value)) throw new Error("--participant-stat value must be a safe integer");
    overrides[participantIndex] ??= {};
    overrides[participantIndex][field] = value;
  }
  return overrides;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
