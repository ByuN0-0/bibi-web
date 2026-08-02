import "server-only";
import {createHmac, timingSafeEqual} from "node:crypto";
import {getServerEnv} from "@/lib/server-env";

type ReviewReceipt = {
  version: 1;
  ingestionId: string;
  requiredReviewIds: string[];
};

export function createReviewReceipt(ingestionId: string, requiredReviewIds: string[]): string {
  const encoded = Buffer.from(JSON.stringify({
    version: 1,
    ingestionId,
    requiredReviewIds: [...new Set(requiredReviewIds)].sort(),
  } satisfies ReviewReceipt)).toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}

export function verifyReviewReceipt(receipt: unknown, ingestionId: string, confirmedReviewIds: unknown): ReviewReceipt {
  if (typeof receipt !== "string" || receipt.length > 16_384) throw new Error("판독 검토 정보가 올바르지 않습니다.");
  const [encoded, providedSignature, extra] = receipt.split(".");
  if (!encoded || !providedSignature || extra) throw new Error("판독 검토 정보가 올바르지 않습니다.");
  const expectedSignature = signature(encoded);
  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw new Error("판독 검토 정보가 올바르지 않습니다.");
  let payload: ReviewReceipt;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ReviewReceipt;
  } catch {
    throw new Error("판독 검토 정보가 올바르지 않습니다.");
  }
  if (payload.version !== 1 || payload.ingestionId !== ingestionId || !Array.isArray(payload.requiredReviewIds)) {
    throw new Error("판독 검토 정보가 현재 초안과 일치하지 않습니다.");
  }
  const confirmed = new Set(Array.isArray(confirmedReviewIds) ? confirmedReviewIds.filter((id): id is string => typeof id === "string") : []);
  const missing = payload.requiredReviewIds.filter((id) => !confirmed.has(id));
  if (missing.length) throw new Error(`확인이 필요한 판독 항목이 ${missing.length}개 남아 있습니다.`);
  return payload;
}

function signature(encoded: string) {
  return createHmac("sha256", getServerEnv().sessionSecret).update(`lol-scoreboard-review:${encoded}`).digest("base64url");
}
