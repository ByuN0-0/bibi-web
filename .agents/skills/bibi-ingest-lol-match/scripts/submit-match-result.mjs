#!/usr/bin/env node
import {readFile} from "node:fs/promises";

const [action, inputPath] = process.argv.slice(2);
if (!(action === "players" || (["validate", "commit"].includes(action) && inputPath))) {
  fail("Usage: submit-match-result.mjs players | <validate|commit> <payload.json>");
}

const baseUrl = process.env.BIBI_WEB_BASE_URL?.trim().replace(/\/$/, "");
const token = process.env.BIBI_INGEST_TOKEN?.trim();
if (!baseUrl || !token) fail("BIBI_WEB_BASE_URL and BIBI_INGEST_TOKEN are required.");
if (token.length < 32) fail("BIBI_INGEST_TOKEN must contain at least 32 characters.");
let parsedBase;
try { parsedBase = new URL(baseUrl); } catch { fail("BIBI_WEB_BASE_URL must be a valid URL."); }
if (parsedBase.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(parsedBase.hostname)) {
  fail("BIBI_WEB_BASE_URL must use HTTPS except on localhost.");
}

let payload;
if (action !== "players") {
  try { payload = JSON.parse(await readFile(inputPath, "utf8")); } catch (error) { fail(`Could not read payload JSON: ${error.message}`); }
  payload.action = action;
}

let response;
try {
  response = await fetch(`${baseUrl}/api/internal/lol-match-results`, {
    method: action === "players" ? "GET" : "POST",
    headers: {...(action === "players" ? {} : {"content-type": "application/json"}), authorization: `Bearer ${token}`},
    ...(action === "players" ? {} : {body: JSON.stringify(payload)}),
    signal: AbortSignal.timeout(15_000),
  });
} catch (error) {
  fail(`bibi-web request failed: ${error.message}`);
}

const text = await response.text();
let result;
try { result = JSON.parse(text); } catch { fail(`bibi-web returned HTTP ${response.status} with invalid JSON.`); }
if (!response.ok) fail(`bibi-web rejected the ${action} request (${response.status} ${result.code ?? "ERROR"}): ${result.error ?? "Unknown error"}`);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
