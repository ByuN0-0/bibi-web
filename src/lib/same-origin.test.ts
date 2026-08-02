import {describe, expect, it} from "vitest";
import {NextRequest} from "next/server";
import {hasSameOrigin} from "@/lib/same-origin";

describe("same-origin mutation protection", () => {
  it("accepts the deployment origin", () => {
    const request = new NextRequest("https://bibi.example/api/lol-statics/team", {
      headers: {origin: "https://bibi.example"},
    });
    expect(hasSameOrigin(request)).toBe(true);
  });

  it("rejects missing and foreign origins", () => {
    expect(hasSameOrigin(new NextRequest("https://bibi.example/api/lol-statics/team"))).toBe(false);
    expect(hasSameOrigin(new NextRequest("https://bibi.example/api/lol-statics/team", {
      headers: {origin: "https://evil.example"},
    }))).toBe(false);
  });
});
