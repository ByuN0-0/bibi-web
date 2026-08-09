---
name: bibi-ingest-lol-match
description: Mechanically read a Korean League of Legends post-game scoreboard screenshot, resolve players and Data Dragon assets, immediately stage the result for private bibi-web review, and return the admin review link. Use when a user attaches the standard LoL score tab screenshot and asks to save, ingest, submit, or validate an internal match record.
---

# Bibi LoL Match Ingestion

Use the bundled end-to-end command. Do not upload or store the screenshot.

## Save or submit

Run exactly one command from the `bibi-web` repository:

```bash
node --env-file=.env .agents/skills/bibi-ingest-lol-match/scripts/ingest-scoreboard.mjs <attached-screenshot-path>
```

The command loads the registered-player catalog, performs OCR and image recognition, builds the payload in memory, validates it server-side, stages it as `PENDING_REVIEW`, and prints the full admin review URL.

- Run it immediately without inspecting the screenshot, reading the generated payload, manually correcting values, querying players separately, or asking for confirmation.
- Do not run separate `read-scoreboard.mjs`, `validate`, or `stage` commands before or after the fast path.
- Return only the URL printed by the command. Do not print a review table or summary.
- If the command fails, return its concise error and stop. Diagnose or use manual tools only when the user explicitly asks.

## Validate without saving

When the user explicitly requests validation or analysis without a database write, run:

```bash
node --env-file=.env .agents/skills/bibi-ingest-lol-match/scripts/ingest-scoreboard.mjs <attached-screenshot-path> --validate-only
```

Return the command result without staging.

## Explicit diagnostics only

Read `references/payload-schema.md` only when debugging a failed ingestion or when the user explicitly requests payload-level inspection. Diagnostic commands may add `--output`, `--report-output`, or invoke the lower-level scripts.

## Safety

- Read credentials only from `BIBI_WEB_BASE_URL` and `BIBI_INGEST_TOKEN`.
- Never print, persist, pass as a CLI argument, or include the token in an error.
- Never store the screenshot in bibi-web or Oracle SODA.
- Staged matches remain `PENDING_REVIEW`, hidden from public history, and excluded from Elo until published in the web UI.
- Reusing an `ingestionId` returns the existing review link and never resets administrator review work.
