# bibi-web LoL match payload

## API contract

Send `POST /api/internal/lol-match-results` with `Authorization: Bearer <BIBI_INGEST_TOKEN>` and `Content-Type: application/json`. The body is at most 64 KiB. Use the same body and `ingestionId` for `validate` and `commit`, changing only `action`.

The match record is independent of team-balancing sessions and has no `sessionId`. The API maps uniquely matching player names when possible and stores every unmatched or ambiguous name as a guest. `ingestionId` is the only ingestion idempotency key.

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
      "observedName": "화면 닉네임",
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

Every number is a non-negative integer; duration and level are positive. The API requires each team's K/D/A and gold totals to equal the sums of its five participants. Bans contain exactly five nullable slots, items exactly six nullable slots, summoner spells exactly two non-null slots. A trinket or quest slot may be null.

Asset paths are relative Data Dragon paths. Champion, item, and spell paths start with `img/champion/`, `img/item/`, or `img/spell/`. Perk paths start with `perk-images/`. The server re-fetches the Korean catalog for `ddragonVersion` and rejects any mismatched ID, name, or path. Normal inventory and trinket matching is restricted to Summoner's Rift items. The role quest slot uses the complete Data Dragon item catalog because 2026 role rewards such as IDs `1206`, `1209`, `1220`, and `1221` are intentionally marked as non-map-11 catalog entries even though they appear in that scoreboard slot.

## Fixed coordinate guide

Normalize the screenshot to 1028 pixels wide without changing its aspect ratio. Coordinates are approximate top-left crop positions for the standard 1028×604 result screen and must be refined from visible row centers when browser/window chrome changes.

When the whole scoreboard is uniformly shifted vertically, pass `--offset-y <pixels>` to the resolver after width normalization. For example, use `--offset-y -8` when the first BLUE row center is 199 instead of 207.

Player row centers: BLUE `207, 242, 277, 312, 347`; RED `422, 457, 492, 527, 562`.

For each player row center `y`:

| Slot | x | y offset | size |
| --- | ---: | ---: | ---: |
| Primary perk | 18 | -10 | 20×20 |
| Summoner spell 1 | 43 | -14 | 14×14 |
| Summoner spell 2 | 43 | 1 | 14×14 |
| Champion inner portrait | 94 | -10 | 24×24 |
| Items 1–6 | 286, 311, 336, 361, 386, 411 | -11 | 22×22 |
| Trinket | 436 | -11 | 22×22 |
| Quest slot | 469 | -11 | 22×22 |

Ban crops are 25×25 at BLUE `(846,190) (911,190) (976,190) (846,225) (911,225)` and RED `(846,405) (911,405) (976,405) (846,440) (911,440)`. Mask diagonal ban slashes and outer borders before comparison.

Team objective icons, left to right, represent: destroyed turrets, destroyed inhibitors, Baron Nashor kills, dragon kills, Rift Herald kills, and Void Grub kills. Record the visible counters in those six named fields only.

## Resolver recognition format

Before resolution, use the same payload but asset values may be Korean name strings. Nullable slots stay null. The resolver accepts `champion`, `primaryPerk`, both `summonerSpells`, six `items`, `trinket`, `questSlot`, and five `bans` in this name form. It fills `ddragonVersion` from the latest official version when omitted and computes `ingestionId` from the screenshot when omitted.

The resolver stops when exact-name lookup and image comparison cannot produce a unique result. It never silently picks an ambiguous candidate.
