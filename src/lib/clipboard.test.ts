import {describe, expect, it, vi} from "vitest";
import {copyText} from "@/lib/clipboard";

describe("copyText", () => {
  it("uses the Clipboard API when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await expect(copyText("팀 결과", {writeText})).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("팀 결과");
  });

  it("falls back to a temporary textarea", async () => {
    const textarea = {value: "", style: {} as CSSStyleDeclaration, setAttribute: vi.fn(), select: vi.fn(), remove: vi.fn()} as unknown as HTMLTextAreaElement;
    const documentRef = {body: {appendChild: vi.fn()}, createElement: vi.fn(() => textarea), execCommand: vi.fn(() => true)} as unknown as Pick<Document, "body" | "createElement" | "execCommand">;
    const clipboard = {writeText: vi.fn().mockRejectedValue(new Error("denied"))};
    await expect(copyText("팀 결과", clipboard, documentRef)).resolves.toBe(true);
    expect(textarea.value).toBe("팀 결과");
    expect(textarea.remove).toHaveBeenCalled();
  });

  it("reports failure when neither copy path works", async () => {
    const documentRef = {body: {appendChild: vi.fn()}, createElement: vi.fn(() => ({value: "", style: {}, setAttribute: vi.fn(), select: vi.fn(), remove: vi.fn()})), execCommand: vi.fn(() => false)} as unknown as Pick<Document, "body" | "createElement" | "execCommand">;
    await expect(copyText("팀 결과", undefined, documentRef)).resolves.toBe(false);
  });
});
