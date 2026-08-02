import "server-only";
import {calculateInhouseRatings} from "@/lib/lol/inhouse-rating";
import {getInhouseRatingSnapshot, listMatchResults, saveInhouseRatingSnapshot} from "@/lib/lol/repository";

export async function rebuildInhouseRatingSnapshot() {
  const snapshot = calculateInhouseRatings(await listMatchResults());
  await saveInhouseRatingSnapshot(snapshot);
  return snapshot;
}

export async function getOrRebuildInhouseRatingSnapshot() {
  return await getInhouseRatingSnapshot() ?? rebuildInhouseRatingSnapshot();
}
