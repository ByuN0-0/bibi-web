export const CANVAS = {width: 1028, height: 604};
export const REFERENCE_ROWS = {
  BLUE: [207, 242, 277, 312, 347],
  RED: [422, 457, 492, 527, 562],
};
export const MATCH_ROLE_ORDER = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

export function detectScoreboardLayout(data, info) {
  if (info.width !== CANVAS.width || info.channels < 3) throw new Error("layout detector requires a 1028px RGB image");
  const gold = (x, y) => {
    if (x < 0 || x >= info.width || y < 0 || y >= info.height) return false;
    const index = (y * info.width + x) * info.channels;
    const red = data[index]; const green = data[index + 1]; const blue = data[index + 2];
    return red >= 40 && red <= 185 && green >= 27 && green <= 150 && blue <= 68
      && red > blue * 1.35 && green > blue * 1.15;
  };
  const horizontal = Array(info.height).fill(0);
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 245; x < 525; x += 1) if (gold(x, y)) horizontal[y] += 1;
  }

  let bestRows = {score: -1, gap: 35, height: 24, blueTop: 195, redTop: 410};
  for (let gap = 28; gap <= 43; gap += 1) {
    const cellHeight = Math.max(18, Math.round(gap * 24 / 35));
    const redDistance = Math.round(gap * 215 / 35);
    for (let blueTop = 125; blueTop < Math.min(315, info.height - redDistance - gap * 4 - cellHeight); blueTop += 1) {
      const predictedRed = blueTop + redDistance;
      for (let redDelta = -Math.max(4, Math.round(gap * 0.3)); redDelta <= Math.max(4, Math.round(gap * 0.3)); redDelta += 1) {
        const redTop = predictedRed + redDelta;
        let score = 0;
        for (let row = 0; row < 5; row += 1) {
          for (const top of [blueTop + row * gap, redTop + row * gap]) {
            score += horizontal[top] ?? 0;
            score += horizontal[top + cellHeight] ?? 0;
          }
        }
        if (score > bestRows.score) bestRows = {score, gap, height: cellHeight, blueTop, redTop};
      }
    }
  }

  const rowTops = [
    ...Array.from({length: 5}, (_, index) => bestRows.blueTop + index * bestRows.gap),
    ...Array.from({length: 5}, (_, index) => bestRows.redTop + index * bestRows.gap),
  ];
  let bestColumns = {score: -1, gap: 25, start: 284};
  for (let gap = 20; gap <= 31; gap += 1) {
    for (let start = 225; start <= 345; start += 1) {
      let score = 0;
      for (const top of rowTops) {
        for (let boundary = 0; boundary <= 7; boundary += 1) {
          const x = start + boundary * gap;
          for (let y = top + 2; y < top + bestRows.height - 1; y += 1) {
            if (gold(x, y)) score += 1;
            if (gold(x + 1, y)) score += 0.5;
          }
        }
        for (const x of [start + gap * 7 + Math.round(gap * 9 / 25), start + gap * 8 + Math.round(gap * 9 / 25)]) {
          for (let y = top + 2; y < top + bestRows.height - 1; y += 1) {
            if (gold(x, y)) score += 1.5;
            if (gold(x + 1, y)) score += 0.75;
          }
        }
      }
      if (score > bestColumns.score) bestColumns = {score, gap, start};
    }
  }

  const detectedBlueCenter = bestRows.blueTop + bestRows.height / 2;
  const detectedRedCenter = bestRows.redTop + bestRows.height / 2;
  const detectedDistance = detectedRedCenter - detectedBlueCenter;
  const yScale = (REFERENCE_ROWS.RED[0] - REFERENCE_ROWS.BLUE[0]) / detectedDistance;
  const yOffset = REFERENCE_ROWS.BLUE[0] - detectedBlueCenter * yScale;
  const xScale = 25 / bestColumns.gap;
  const xOffset = 281 - bestColumns.start * xScale;
  const expectedBorderScore = 10 * 8 * Math.max(12, bestRows.height - 3);

  return {
    source: {
      blueTop: bestRows.blueTop,
      redTop: bestRows.redTop,
      rowGap: bestRows.gap,
      cellHeight: bestRows.height,
      itemGridLeft: bestColumns.start,
      itemSlotGap: bestColumns.gap,
    },
    transform: {xScale, xOffset, yScale, yOffset},
    confidence: Math.max(0, Math.min(1, bestColumns.score / expectedBorderScore)),
  };
}

export function parseInteger(text) {
  const normalized = String(text ?? "")
    .replace(/[OoQ]/g, "0")
    .replace(/[Il|]/g, "1")
    .replace(/[^0-9]/g, "");
  return normalized ? Number(normalized) : null;
}

export function parseDate(text) {
  const normalized = String(text ?? "").replace(/[.\-]/g, "/").replace(/\s/g, "");
  const match = normalized.match(/(20\d{2})\/(\d{1,2})\/(\d{1,2})/);
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

export function parseDuration(text) {
  const match = String(text ?? "").replace(/\s/g, "").match(/(\d{1,2})[:.-](\d{2})/);
  if (!match) return null;
  const minutes = Number(match[1]); const seconds = Number(match[2]);
  return seconds < 60 ? minutes * 60 + seconds : null;
}

export function normalizeName(value) {
  return String(value ?? "").normalize("NFC").toLocaleLowerCase("ko-KR").replace(/[^0-9a-z가-힣]/g, "");
}

export function matchRegisteredPlayer(ocrName, players) {
  const observed = normalizeName(ocrName);
  if (!observed) return null;
  const readings = [...new Set([observed, normalizeOcrConfusables(observed)])];
  const candidates = [];
  for (const player of players) {
    const variants = [
      {name: player.displayName, account: false},
      {name: player.riotGameName, account: true},
      ...(player.accounts ?? []).map((account) => ({name: account.riotGameName, account: true})),
    ];
    for (const variant of variants) {
      const normalized = normalizeName(variant.name);
      if (!normalized) continue;
      for (const reading of readings) {
        const comparable = normalizeOcrConfusables(normalized);
        const prefix = comparable.startsWith(reading) || reading.startsWith(comparable);
        const distance = levenshtein(reading, comparable);
        const similarity = 1 - distance / Math.max(reading.length, comparable.length);
        const score = prefix && Math.min(reading.length, comparable.length) >= 4 ? Math.max(similarity, 0.92) : similarity;
        candidates.push({player, variant, score});
      }
    }
  }
  candidates.sort((left, right) => right.score - left.score);
  const best = candidates[0]; const second = candidates.find((candidate) => candidate.player.discordUserId !== best?.player.discordUserId);
  if (!best || best.score < 0.58 || (second && best.score - second.score < 0.1)) return null;
  return {
    discordUserId: best.player.discordUserId,
    observedName: best.variant.account ? best.variant.name : ocrName.trim(),
    displayName: best.player.displayName,
    confidence: best.score,
  };
}

function normalizeOcrConfusables(value) {
  return value.replace(/2/g, "z").replace(/[58]/g, "s").replace(/0/g, "o");
}

export function validateMechanicalTotals(teamStats, participants) {
  const errors = [];
  for (const stats of teamStats) {
    const members = participants.filter((participant) => participant.team === stats.team);
    const totals = {
      kills: members.reduce((sum, participant) => sum + participant.kills, 0),
      deaths: members.reduce((sum, participant) => sum + participant.deaths, 0),
      assists: members.reduce((sum, participant) => sum + participant.assists, 0),
      goldTotal: members.reduce((sum, participant) => sum + participant.goldEarned, 0),
    };
    for (const field of Object.keys(totals)) {
      if (stats[field] !== totals[field]) errors.push(`${stats.team} ${field}: team=${stats[field]} players=${totals[field]}`);
    }
  }
  return errors;
}

export function participantRowOffsets(layout) {
  const {source, transform} = layout;
  const offsets = {};
  for (const team of ["BLUE", "RED"]) {
    const firstTop = team === "BLUE" ? source.blueTop : source.redTop;
    offsets[team] = REFERENCE_ROWS[team].map((referenceRow, index) => {
      const sourceCenter = firstTop + source.cellHeight / 2 + index * source.rowGap;
      const alignedCenter = sourceCenter * transform.yScale + transform.yOffset;
      const rounded = Math.round(alignedCenter - referenceRow);
      return Object.is(rounded, -0) ? 0 : rounded;
    });
  }
  return offsets;
}

export function repairMissingParticipantTotals(teamStats, participants) {
  const repairs = [];
  const fields = [["kills", "kills"], ["deaths", "deaths"], ["assists", "assists"], ["goldTotal", "goldEarned"]];
  for (const stats of teamStats) {
    const members = participants.map((participant, index) => ({participant, index})).filter(({participant}) => participant.team === stats.team);
    for (const [teamField, participantField] of fields) {
      const missing = members.filter(({participant}) => !Number.isInteger(participant[participantField]));
      if (missing.length !== 1) continue;
      const knownTotal = members.reduce((sum, {participant}) => sum + (Number.isInteger(participant[participantField]) ? participant[participantField] : 0), 0);
      const derived = stats[teamField] - knownTotal;
      if (!Number.isInteger(derived) || derived < 0) continue;
      missing[0].participant[participantField] = derived;
      repairs.push({team: stats.team, participantIndex: missing[0].index, field: participantField, value: derived});
    }
  }
  return repairs;
}

export function selectSpellQuestCombination(spellSlots, questCandidates, requiredRole = null) {
  const combinations = spellQuestCombinations(spellSlots, questCandidates, requiredRole);
  const best = combinations[0];
  if (!best) return null;
  const alternativeGap = (changed) => {
    const alternative = combinations.find(changed);
    return alternative ? alternative.score - best.score : Number.POSITIVE_INFINITY;
  };
  return {
    ...best,
    fieldGaps: [
      alternativeGap((entry) => entry.spells[0].candidate.id !== best.spells[0].candidate.id),
      alternativeGap((entry) => entry.spells[1].candidate.id !== best.spells[1].candidate.id),
      alternativeGap((entry) => entry.quest.candidate?.id !== best.quest.candidate?.id),
    ],
  };
}

export function selectTeamSpellQuestAssignments(participants) {
  if (!Array.isArray(participants) || participants.length !== 5) return null;
  const options = participants.map(({spellSlots, questCandidates}) => Object.fromEntries(
    MATCH_ROLE_ORDER.map((role) => [role, spellQuestCombinations(spellSlots, questCandidates, role).slice(0, 3)]),
  ));
  const teamCandidates = [];
  const visit = (participantIndex, usedRoles, assignments, score) => {
    if (participantIndex === participants.length) {
      teamCandidates.push({assignments: [...assignments], score});
      return;
    }
    for (const role of MATCH_ROLE_ORDER) {
      if (usedRoles.has(role)) continue;
      for (const option of options[participantIndex][role]) {
        usedRoles.add(role);
        assignments.push({...option, role});
        visit(participantIndex + 1, usedRoles, assignments, score + option.score);
        assignments.pop();
        usedRoles.delete(role);
      }
    }
  };
  visit(0, new Set(), [], 0);
  teamCandidates.sort((left, right) => left.score - right.score);
  const best = teamCandidates[0];
  if (!best) return null;
  return {
    ...best,
    fieldGaps: best.assignments.map((assignment, participantIndex) => [
      teamAlternativeGap(teamCandidates, best, participantIndex, 0, assignment.spells[0].candidate.id),
      teamAlternativeGap(teamCandidates, best, participantIndex, 1, assignment.spells[1].candidate.id),
      teamAlternativeGap(teamCandidates, best, participantIndex, 2, assignment.quest.candidate.id),
    ]),
  };
}

export function selectUniqueAssetAssignments(candidatePools) {
  let best = null;
  const visit = (index, selected, used, totalScore) => {
    if (best && totalScore >= best.totalScore) return;
    if (index === candidatePools.length) {
      best = {assignments: [...selected], totalScore};
      return;
    }
    for (const entry of candidatePools[index] ?? []) {
      const id = entry.candidate?.id;
      if (!id) {
        selected.push(entry);
        visit(index + 1, selected, used, totalScore + entry.matchScore);
        selected.pop();
        continue;
      }
      if (used.has(id)) continue;
      used.add(id);
      selected.push(entry);
      visit(index + 1, selected, used, totalScore + entry.matchScore);
      selected.pop();
      used.delete(id);
    }
  };
  visit(0, [], new Set(), 0);
  return best;
}

export function roleFromQuest(asset) {
  if (asset?.questRole) return asset.questRole;
  const id = String(asset?.id ?? "");
  if (["1200", "1220", "1221", "1222"].includes(id)) return "TOP";
  if (["1204", "1209", "1210", "1211"].includes(id)) return "JUNGLE";
  if (["1201", "1206"].includes(id)) return "MIDDLE";
  if (["1202", "1207"].includes(id)) return "BOTTOM";
  if (["1203", "1208", "2055"].includes(id)) return "UTILITY";
  return null;
}

function spellQuestCombinations(spellSlots, questCandidates, requiredRole) {
  if (!Array.isArray(spellSlots) || spellSlots.length !== 2 || spellSlots.some((slot) => !slot?.length) || !questCandidates?.length) return [];
  const combinations = [];
  for (const first of spellSlots[0]) for (const second of spellSlots[1]) for (const quest of questCandidates) {
    if (first.candidate.id === second.candidate.id) continue;
    if (requiredRole && roleFromQuest(quest.candidate) !== requiredRole) continue;
    const hasSmite = isSmite(first.candidate) || isSmite(second.candidate);
    if (hasSmite !== isJungleQuest(quest.candidate)) continue;
    if (roleFromQuest(quest.candidate) === "TOP") {
      const teleported = isTeleport(first.candidate) || isTeleport(second.candidate);
      const allowedIds = teleported ? ["1221", "1222"] : ["1200", "1220"];
      if (!allowedIds.includes(String(quest.candidate.id))) continue;
    }
    combinations.push({
      spells: [first, second],
      quest,
      score: first.matchScore + second.matchScore + quest.matchScore,
    });
  }
  combinations.sort((left, right) => left.score - right.score);
  return combinations;
}

function teamAlternativeGap(candidates, best, participantIndex, fieldIndex, selectedId) {
  const alternative = candidates.find((candidate) => {
    const assignment = candidate.assignments[participantIndex];
    const id = fieldIndex < 2 ? assignment.spells[fieldIndex].candidate.id : assignment.quest.candidate.id;
    return id !== selectedId;
  });
  return alternative ? alternative.score - best.score : Number.POSITIVE_INFINITY;
}

function isSmite(asset) {
  return normalizeName(asset?.name) === normalizeName("강타") || String(asset?.id ?? "").toLocaleLowerCase("en-US").includes("smite");
}

function isJungleQuest(asset) {
  return roleFromQuest(asset) === "JUNGLE";
}

function isTeleport(asset) {
  return normalizeName(asset?.name).includes(normalizeName("순간이동"))
    || String(asset?.id ?? "").toLocaleLowerCase("en-US").includes("teleport");
}

function levenshtein(left, right) {
  const previous = Array.from({length: right.length + 1}, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0]; previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[right.length];
}
