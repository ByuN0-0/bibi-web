#!/usr/bin/env node
import {readFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";

export async function submitMatchResult(action, payload) {
  if (!(action === "players" || ["validate", "stage", "commit"].includes(action))) {
    throw new Error("action must be players, validate, stage, or commit.");
  }

  const baseUrl = process.env.BIBI_WEB_BASE_URL?.trim().replace(/\/$/, "");
  const token = process.env.BIBI_INGEST_TOKEN?.trim();
  if (!baseUrl || !token) throw new Error("BIBI_WEB_BASE_URL and BIBI_INGEST_TOKEN are required.");
  if (token.length < 32) throw new Error("BIBI_INGEST_TOKEN must contain at least 32 characters.");
  let parsedBase;
  try { parsedBase = new URL(baseUrl); } catch { throw new Error("BIBI_WEB_BASE_URL must be a valid URL."); }
  if (parsedBase.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(parsedBase.hostname)) {
    throw new Error("BIBI_WEB_BASE_URL must use HTTPS except on localhost.");
  }

  const requestPayload = action === "players" ? null : {...payload, action};
  let response;
  try {
    response = await fetch(`${baseUrl}/api/internal/lol-match-results`, {
      method: action === "players" ? "GET" : "POST",
      headers: {...(action === "players" ? {} : {"content-type": "application/json"}), authorization: `Bearer ${token}`},
      ...(action === "players" ? {} : {body: JSON.stringify(requestPayload)}),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new Error(`bibi-web request failed: ${error.message}`);
  }

  const text = await response.text();
  let result;
  try { result = JSON.parse(text); } catch { throw new Error(`bibi-web returned HTTP ${response.status} with invalid JSON.`); }
  if (!response.ok) throw new Error(`bibi-web rejected the ${action} request (${response.status} ${result.code ?? "ERROR"}): ${result.error ?? "Unknown error"}`);
  return result;
}

async function runCli() {
  const [action, inputPath] = process.argv.slice(2);
  if (!(action === "players" || (["validate", "stage", "commit"].includes(action) && inputPath))) {
    throw new Error("Usage: submit-match-result.mjs players | <validate|stage|commit> <payload.json>");
  }
  let payload;
  if (action !== "players") {
    try { payload = JSON.parse(await readFile(inputPath, "utf8")); } catch (error) { throw new Error(`Could not read payload JSON: ${error.message}`); }
  }
  process.stdout.write(`${JSON.stringify(await submitMatchResult(action, payload), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
