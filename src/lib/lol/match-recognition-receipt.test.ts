import {describe, expect, it, vi} from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server-env", () => ({getServerEnv: () => ({sessionSecret: "test-session-secret-that-is-long-enough"})}));

import {createReviewReceipt, verifyReviewReceipt} from "@/lib/lol/match-recognition-receipt";

describe("match recognition review receipt", () => {
  it("requires every signed low-confidence review", () => {
    const receipt = createReviewReceipt("ingestion-1", ["review-a", "review-b"]);
    expect(() => verifyReviewReceipt(receipt, "ingestion-1", ["review-a"])).toThrow("1개 남아");
    expect(verifyReviewReceipt(receipt, "ingestion-1", ["review-a", "review-b"]).requiredReviewIds).toEqual(["review-a", "review-b"]);
  });

  it("rejects altered receipts and another ingestion", () => {
    const receipt = createReviewReceipt("ingestion-1", []);
    expect(() => verifyReviewReceipt(`${receipt}x`, "ingestion-1", [])).toThrow("올바르지 않습니다");
    expect(() => verifyReviewReceipt(receipt, "ingestion-2", [])).toThrow("일치하지 않습니다");
  });
});
