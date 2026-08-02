import {describe, expect, it} from "vitest";
import {readApiJson} from "@/lib/api-response";

describe("readApiJson", () => {
  it("returns a JSON response", async () => {
    const response = Response.json({ok: true});
    await expect(readApiJson<{ok: boolean}>(response, {fallbackMessage: "실패"})).resolves.toEqual({ok: true});
  });

  it("turns a deployment timeout page into a readable error", async () => {
    const response = new Response("An error occurred with your deployment\nFUNCTION_INVOCATION_TIMEOUT", {status: 504});
    await expect(readApiJson(response, {
      fallbackMessage: "판독 실패",
      timeoutMessage: "판독 시간이 초과됐습니다.",
    })).rejects.toThrow("판독 시간이 초과됐습니다.");
  });

  it("reports other malformed responses without leaking their body", async () => {
    const response = new Response("upstream secret error", {status: 502});
    await expect(readApiJson(response, {fallbackMessage: "요청 실패"})).rejects.toThrow("요청 실패 (HTTP 502)");
  });
});
