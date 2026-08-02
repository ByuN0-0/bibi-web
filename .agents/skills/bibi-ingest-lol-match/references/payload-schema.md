# bibi-web LoL match payload

## API contract

Send `POST /api/internal/lol-match-results` with `Authorization: Bearer <BIBI_INGEST_TOKEN>` and `Content-Type: application/json`. The body is at most 64 KiB. Use the same body and `ingestionId` for `validate` and `commit`, changing only `action`.

The match record is independent of team-balancing sessions and has no `sessionId`. The API maps uniquely matching player names when possible and stores every unmatched or ambiguous name as a guest. `ingestionId` is the only ingestion idempotency key.

Before recognition, call authenticated `GET /api/internal/lol-match-results` or run `submit-match-result.mjs players`. The response contains only `discordUserId`, `displayName`, `riotGameName`, and `riotTagLine`. A participant may include a catalog-confirmed `discordUserId`; the server verifies that the player exists and is not used twice. Omit it or set it to null when the visual match is ambiguous.

```json
{
  "action": "validate",
  "ingestionId": "lol-scoreboard:<sha256>",
  "playedOn": "2026-08-01",
  "durationSeconds": 1785,
  "winner": "BLUE",
  "ddragonVersion": "16.15.1",
  "teamStats": [
    {
      "team": "BLUE",
      "kills": 36,
      "deaths": 31,
      "assists": 54,
      "goldTotal": 66520,
      "objectives": {
        "turretsDestroyed": 10,
        "inhibitorsDestroyed": 2,
        "baronKills": 1,
        "dragonKills": 4,
        "riftHeraldKills": 0,
        "voidGrubKills": 2
      },
      "bans": [null, null, null, null, null]
    }
  ],
  "participants": [
    {
      "team": "BLUE",
      "role": "TOP",
      "observedName": "화면 닉네임",
      "discordUserId": "registered-player-id-or-null",
      "champion": {"id": "Ahri", "name": "아리", "iconPath": "img/champion/Ahri.png"},
      "primaryPerk": {"id": "8112", "name": "감전", "iconPath": "perk-images/Styles/Domination/Electrocute/Electrocute.png"},
      "summonerSpells": [
        {"id": "SummonerFlash", "name": "점멸", "iconPath": "img/spell/SummonerFlash.png"},
        {"id": "SummonerTeleport", "name": "순간이동", "iconPath": "img/spell/SummonerTeleport.png"}
      ],
      "level": 16,
      "kills": 10,
      "deaths": 5,
      "assists": 12,
      "cs": 227,
      "goldEarned": 15099,
      "items": [null, null, null, null, null, null],
      "trinket": null,
      "questSlot": null
    }
  ]
}
```

Include two team records and ten participant records, five per team. `winner` and all participant teams are `BLUE` or `RED`. `playedOn` is the scoreboard date in Asia/Seoul. If only a date is shown, store that date without inventing a time.

Every number is a non-negative integer; duration and level are positive. The API requires each team's K/D/A and gold totals to equal the sums of its five participants. Bans contain exactly five nullable slots, items exactly six nullable slots, summoner spells exactly two non-null slots. A trinket or quest slot may be null. New scoreboard ingestion maps each position quest to `TOP`, `JUNGLE`, `MIDDLE`, `BOTTOM`, or `UTILITY`; each team contains every role exactly once and participants are sent in that order.

Asset paths are relative Data Dragon paths. Champion, item, and spell paths start with `img/champion/`, `img/item/`, or `img/spell/`. Perk paths start with `perk-images/`. The server re-fetches the Korean catalog for `ddragonVersion` and rejects any mismatched ID, name, or path. Normal inventory and trinket matching is restricted to Summoner's Rift items. The role quest slot uses the complete Data Dragon item catalog because 2026 role rewards such as IDs `1206`, `1209`, `1220`, and `1221` are intentionally marked as non-map-11 catalog entries even though they appear in that scoreboard slot.

## Fixed coordinate guide

Normalize the screenshot to 1028 pixels wide without changing its aspect ratio. `read-scoreboard.mjs` detects the ten item-slot border rows and column grid first, then independently scales and translates x/y into the 1028×604 canonical canvas. The coordinates below are canonical targets, not assumptions about the source image size.

When the whole scoreboard is uniformly shifted vertically, pass `--offset-y <pixels>` to the resolver after width normalization. For example, use `--offset-y -8` when the first BLUE row center is 199 instead of 207.
If only the ban panel is vertically misaligned with the player rows, pass `--ban-offset-y <pixels>` separately. It defaults to the value of `--offset-y`.

Player row centers: BLUE `207, 242, 277, 312, 347`; RED `422, 457, 492, 527, 562`.

For each player row center `y`:

| Slot | x | y offset | size |
| --- | ---: | ---: | ---: |
| Primary perk | 18 | -10 | 20×20 |
| Summoner spell 1 | 43 | -12 | 11×11 |
| Summoner spell 2 | 43 | 3 | 11×11 |
| Champion portrait | 89 | -16 | 32×32 |
| Items 1–6 | 284, 309, 334, 359, 384, 409 | -10 | 22×22 |
| Trinket | 434 | -10 | 22×22 |
| Quest slot | 467 | -10 | 22×22 |

Ban crops are 24×24 at BLUE `(845,198) (910,198) (975,198) (845,233) (910,233)` and RED `(845,413) (910,413) (975,413) (845,448) (910,448)`. Mask diagonal ban slashes and outer borders before comparison.

Team objective icons, left to right, represent: destroyed turrets, destroyed inhibitors, Baron Nashor kills, dragon kills, Rift Herald kills, and Void Grub kills. Record the visible counters in those six named fields only.

## Resolver recognition format

Before resolution, use the same payload but asset values may be Korean name strings. Nullable slots stay null. The resolver accepts `champion`, `primaryPerk`, both `summonerSpells`, six `items`, `trinket`, `questSlot`, and five `bans` in this name form. It fills `ddragonVersion` from the latest official version when omitted and computes `ingestionId` from the screenshot when omitted.

The resolver is strict by default and stops when exact-name lookup and image comparison cannot produce a unique result. `--allow-ambiguous --confidence-output report.json` produces a review draft with the deterministic best candidate and marks it `accepted: false`; that draft must not be validated or committed until every marked asset is checked. `read-scoreboard.mjs` uses this review-draft mode by default for speed and supports `--strict-assets` when a partial result is preferable to suggested values.

Summoner spells and position quests are resolved as a team-wide constrained combination. The two spells must be different, Smite requires a jungle quest, and every jungle quest requires Smite in one of the two spell slots. Within each team, top, jungle, middle, bottom, and support quests must each occur exactly once. The resolved quest sets `participant.role`, and the final participant array is sorted `BLUE TOP→UTILITY`, then `RED TOP→UTILITY` before validation or commit.

Player IDs are not Data Dragon assets and pass through the resolver unchanged. Re-validating an existing `ingestionId` never writes. After explicit approval, committing the same scoreboard with improved player IDs updates only its player mappings and revision history.
