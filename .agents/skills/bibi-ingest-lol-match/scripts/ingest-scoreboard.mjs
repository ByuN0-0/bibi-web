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
  });

  const outputPath = options.outputPath ?? "resolved-match.json";
  await writeFile(outputPath, `${JSON.stringify(recognition.payload, null, 2)}\n`, {mode: 0o600});
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
    throw new Error("Usage: ingest-scoreboard.mjs <screenshot> [--output resolved.json] [--report-output report.json] [--players players.json] [--validate-only]");
  }
  const result = await ingestScoreboard(screenshotPath, {
    outputPath: option(argv, "--output"),
    reportPath: option(argv, "--report-output"),
    playersPath: option(argv, "--players"),
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
