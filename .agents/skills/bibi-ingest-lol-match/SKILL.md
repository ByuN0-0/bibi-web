---
name: bibi-ingest-lol-match
description: Analyze a Korean League of Legends post-game scoreboard screenshot, resolve visible champions, bans, keystone runes, summoner spells, items, trinkets, and quest slots through Data Dragon, validate the ten-player result against bibi-web, show the complete extraction for confirmation, and commit only after explicit user approval. Use when a user attaches the standard LoL score tab screenshot and asks to save, validate, summarize, or submit an internal match record to bibi-web.
---

# Bibi LoL Match Ingestion

Store one standard Korean LoL post-game scoreboard screenshot as structured match data without uploading the image itself.

## Required workflow

1. Read `references/payload-schema.md` before extracting values.
2. Inspect only the visible scoreboard. Never infer a hidden or unreadable number.
3. Map `1번 팀` to `BLUE` and `2번 팀` to `RED`.
4. Determine the winner from the selected player's team plus the visible `승리` or `패배` label. Stop and ask if those signals conflict.
5. Extract the date, duration, team totals, six objective counters, five ban slots, and all ten participant rows at the fixed positions documented in the reference.
6. Recognize asset names visually first. Save names in a recognition JSON file, then run:

   ```bash
   node .agents/skills/bibi-ingest-lol-match/scripts/resolve-ddragon-assets.mjs recognized.json --screenshot scoreboard.png --output resolved.json
   ```

   The resolver converts exact Korean names to canonical `{id,name,iconPath}` references. It performs image comparison only for unresolved or ambiguous slots.
7. Review unresolved slots. Do not substitute a top candidate when the resolver reports a tie or insufficient confidence; ask the user instead.
8. Run validation only:

   ```bash
   node .agents/skills/bibi-ingest-lol-match/scripts/submit-match-result.mjs validate resolved.json
   ```

9. Show the user all extracted values, mapped registered players, guests, team winner, objectives, bans, and every participant field. Clearly say that no database write has happened.
10. Wait for an explicit instruction such as `저장해`, `확인`, or `commit`. A screenshot upload or a request to analyze is not approval to save.
11. After approval, submit the unchanged resolved file with the same `ingestionId`:

    ```bash
    node .agents/skills/bibi-ingest-lol-match/scripts/submit-match-result.mjs commit resolved.json
    ```

12. Return the saved result ID and `${BIBI_WEB_BASE_URL}/lol-history/{matchResultId}`.

## Safety rules

- Read credentials only from `BIBI_WEB_BASE_URL` and `BIBI_INGEST_TOKEN` environment variables.
- Never print, persist, pass as a CLI argument, or include the token in an error message.
- Never commit after a failed validation, ambiguous image match, or missing user confirmation.
- Never change `ingestionId` between validation and commit.
- Never store the screenshot in bibi-web or Oracle SODA.
- Treat the API response as authoritative for registered-player and guest mapping. Match records are independent of confirmed team sessions.
- If an asset name is readable, prefer catalog lookup over image comparison.

## Output review format

Present a short match summary followed by BLUE and RED tables. Include team K/D/A, gold, six objectives, five bans, and for each player: nickname, registered player or guest, champion, keystone, two spells, level, K/D/A, CS, gold, six item slots, trinket, and quest slot. Mark any unresolved value explicitly.
