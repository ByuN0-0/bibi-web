---
name: bibi-ingest-lol-match
description: Load bibi-web's registered-player catalog, analyze a Korean League of Legends post-game scoreboard screenshot, map visible nicknames, resolve champions, bans, keystone runes, summoner spells, items, trinkets, and quest slots through Data Dragon, validate the ten-player result, show the complete extraction for confirmation, and commit only after explicit user approval. Use when a user attaches the standard LoL score tab screenshot and asks to save, validate, summarize, remap, or submit an internal match record to bibi-web.
---

# Bibi LoL Match Ingestion

Store one standard Korean LoL post-game scoreboard screenshot as structured match data without uploading the image itself.

## Fast local upload

When the user explicitly asks to accept deterministic low-confidence suggestions and correct mistakes later in the admin web UI, run the local reader and commit in one command:

```bash
npm run lol:ingest-scoreboard -- scoreboard.png --output resolved.json --report-output report.json
```

This command loads the cached player catalog, performs mechanical OCR and asset matching locally, writes the resolved JSON, and sends one `commit` request. The commit endpoint performs the same schema, totals, role, and Data Dragon validation before any database write. Low-confidence suggestions are reported but do not block this explicitly requested fast path. Use `--validate-only` when a database write is not authorized.

## Required workflow

1. Read `references/payload-schema.md` before extracting values.
2. Run the mechanical reader first. It uses the top-right download button as a fixed anchor, translates the unscaled screenshot into the canonical canvas, runs local Korean/English OCR, verifies team totals, maps registered main/alt Riot IDs, and resolves Data Dragon assets:

   ```bash
   node --env-file=.env .agents/skills/bibi-ingest-lol-match/scripts/read-scoreboard.mjs scoreboard.png \
     --output resolved.json --recognized-output recognized.json \
     --aligned-output aligned.png --report-output report.json
   ```

   The player catalog is cached for at most ten minutes. Pass `--players players.json` for an offline catalog. Use `--strict-assets` to stop instead of writing deterministic suggestions for low-confidence icons.
3. Check `report.json`. Layout confidence, OCR readings, player mappings, and all asset matches are recorded. Every asset with `accepted: false` requires visual review and correction in `resolved.json` before API validation. Never validate or commit a review draft merely because the command exited successfully.
4. Map `1번 팀` to `BLUE` and `2번 팀` to `RED`.
5. Determine the winner from the selected player's team plus the visible `승리` or `패배` label. Stop and ask if those signals conflict.
6. Confirm that date, duration, team totals, six objective counters, five ban slots, and all ten participant rows are present. Confirm that each team has exactly one top, jungle, middle, bottom, and support position quest. Top uses IDs `1200/1220/1221/1222`, with Teleport narrowing the result to `1221/1222` and no Teleport to `1200/1220`; jungle uses `1204/1209/1210/1211` with Smite; middle uses `1201/1206`; bottom uses `1202/1207` or a Summoner's Rift boots item; support uses `1203/1208` or Control Ward `2055`. The reader maps those slots to roles, sorts both teams TOP→JUNGLE→MIDDLE→BOTTOM→UTILITY, and rejects numerical results whose team K/D/A or gold does not equal the five player rows.
7. If the mechanical reader is unavailable or a screenshot does not reach the minimum anchor confidence, use the manual recognition fallback. Save names and confirmed player IDs in a recognition JSON file, then run:

   ```bash
   node .agents/skills/bibi-ingest-lol-match/scripts/resolve-ddragon-assets.mjs recognized.json --screenshot scoreboard.png --output resolved.json
   ```

   The resolver converts exact Korean names to canonical `{id,name,iconPath}` references. It performs image comparison only for unresolved or ambiguous slots.
8. Review unresolved or low-confidence slots. Do not treat a suggested top candidate as confirmed when the report marks it for review.
9. Run validation only:

   ```bash
   node .agents/skills/bibi-ingest-lol-match/scripts/submit-match-result.mjs validate resolved.json
   ```

10. Show the user all extracted values, mapped registered players, guests, team winner, objectives, bans, and every participant field. Clearly say that no database write has happened.
11. Wait for an explicit instruction such as `저장해`, `확인`, or `commit`. A screenshot upload or a request to analyze is not approval to save.
12. After approval, submit the unchanged resolved file with the same `ingestionId`:

    ```bash
    node .agents/skills/bibi-ingest-lol-match/scripts/submit-match-result.mjs commit resolved.json
    ```

13. Return the saved result ID and `${BIBI_WEB_BASE_URL}/lol-member?tab=history`. When the `ingestionId` already exists, commit may return `UPDATED` after correcting only its player mappings.

## Safety rules

- Read credentials only from `BIBI_WEB_BASE_URL` and `BIBI_INGEST_TOKEN` environment variables.
- Never print, persist, pass as a CLI argument, or include the token in an error message.
- Never commit after failed server validation or missing user confirmation. Ambiguous image matches may be committed only when the user explicitly requests the fast local upload path and accepts correcting recognition mistakes in the admin UI.
- Never change `ingestionId` between validation and commit.
- Never store the screenshot in bibi-web or Oracle SODA.
- Treat the API response as authoritative for registered-player and guest mapping. Match records are independent of confirmed team sessions.
- Refresh the player catalog after its ten-minute cache expires; never persist it in the repository.
- If an asset name is readable, prefer catalog lookup over image comparison.

## Output review format

Present a short match summary followed by BLUE and RED tables. Include team K/D/A, gold, six objectives, five bans, and for each player: nickname, registered player or guest, champion, keystone, two spells, level, K/D/A, CS, gold, six item slots, trinket, and quest slot. Mark any unresolved value explicitly.
