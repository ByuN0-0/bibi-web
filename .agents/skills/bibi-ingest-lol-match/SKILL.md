---
name: bibi-ingest-lol-match
description: Load bibi-web's registered-player catalog, mechanically read a Korean League of Legends post-game scoreboard screenshot, resolve Data Dragon assets, stage the result for private web review, and return the admin review link. Use when a user attaches the standard LoL score tab screenshot and asks to save, validate, summarize, remap, or submit an internal match record to bibi-web.
---

# Bibi LoL Match Ingestion

Mechanically extract one standard Korean LoL post-game scoreboard and stage it for review. Never upload or store the screenshot itself.

## Required workflow

1. Read `references/payload-schema.md`.
2. For an upload request, run the reader without staging:

   ```bash
   node --env-file=.env .agents/skills/bibi-ingest-lol-match/scripts/read-scoreboard.mjs scoreboard.png \
     --output resolved.json --report-output report.json
   ```

   The command loads the cached player catalog, aligns the screenshot, runs local OCR, resolves Data Dragon assets, and verifies team totals and roles without an API write.
3. Inspect the original attached screenshot and `resolved.json` before any API call. Correct only visibly wrong OCR-derived identity strings:
   - Replace a garbled, truncated, duplicated, or neighboring-row `participants[].observedName` with the exact visible scoreboard name.
   - Set `participants[].discordUserId` only when that corrected visible name uniquely matches the loaded registered-player catalog; otherwise leave it `null`.
   - Do not change numeric stats, roles, objectives, champions, perks, spells, items, trinkets, quests, or bans by visual judgment. Keep their mechanically generated review issues unchanged.
4. Validate and immediately stage the same corrected payload without asking for another confirmation:

   ```bash
   node --env-file=.env .agents/skills/bibi-ingest-lol-match/scripts/submit-match-result.mjs validate resolved.json
   node --env-file=.env .agents/skills/bibi-ingest-lol-match/scripts/submit-match-result.mjs stage resolved.json
   ```

5. Return only `${BIBI_WEB_BASE_URL}${reviewPath}` from the stage response. Do not print a chat review table.
6. The administrator reviews every `OPEN` issue in bibi-web. A value change resolves it as `CORRECTED`; a correct-as-is value must be marked `CONFIRMED`. Only the web UI publishes the match.
7. Stop after validation when the user requested analysis or validation without a database write.

## Mechanical recognition rules

- Map `1번 팀` to `BLUE` and `2번 팀` to `RED`.
- Determine the winner from the selected player's team and the visible victory/defeat label; fail when they conflict.
- Require two teams, ten participants, all team totals, six objective counters, five ban slots, and one TOP/JUNGLE/MIDDLE/BOTTOM/UTILITY quest per team.
- Accept participant levels only from 1 through 18. Retry multiple crops mechanically. If none is valid, stage level `1` with a `LEVEL_UNRESOLVED` review issue containing the raw OCR text.
- Use deterministic Data Dragon matching only. Apply confidence rules by asset type: decisive pixel matching may accept champions, decisive overlay matching may accept bans, perks retain method-agreement review, and method-disagreeing items require a strict absolute score and candidate gap. Low-margin and constraint-overridden selections remain review issues; ignored method disagreement stays in diagnostics only.
- A complete lack of a canonical candidate, invalid totals, invalid roles, or failed server validation stops staging.

## Manual commands

Read without staging:

```bash
node --env-file=.env .agents/skills/bibi-ingest-lol-match/scripts/read-scoreboard.mjs scoreboard.png \
  --output resolved.json --recognized-output recognized.json \
  --aligned-output aligned.png --report-output report.json
```

Validate or stage an existing resolved payload:

```bash
node --env-file=.env .agents/skills/bibi-ingest-lol-match/scripts/submit-match-result.mjs validate resolved.json
node --env-file=.env .agents/skills/bibi-ingest-lol-match/scripts/submit-match-result.mjs stage resolved.json
```

`commit` remains a compatibility alias for `stage` and never publishes directly.

## Safety rules

- Read credentials only from `BIBI_WEB_BASE_URL` and `BIBI_INGEST_TOKEN`.
- Never print, persist, pass as a CLI argument, or include the token in an error.
- Never store the screenshot in bibi-web or Oracle SODA.
- Staged matches remain `PENDING_REVIEW`, are hidden from public history, and do not affect Elo.
- Treat the API response as authoritative for registered-player and guest mapping.
- Refresh the player catalog after its ten-minute cache expires; never persist it in the repository.
- Reusing an `ingestionId` returns the existing review link and never resets administrator review work.
