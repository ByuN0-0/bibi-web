import {describe, expect, it} from "vitest";
import {createSession, verifySession} from "@/lib/session";

const secret = "test-session-secret-with-at-least-32-characters";

describe("admin session", () => {
  it("accepts a valid session and rejects tampering", async () => {
    const value = await createSession("bibi", secret, 1_000);
    expect(await verifySession(value, secret, 2_000)).toEqual({username: "bibi", expiresAt: 28_801_000});
    expect(await verifySession(`${value.slice(0, -1)}x`, secret, 2_000)).toBeNull();
  });

  it("rejects an expired session", async () => {
    const value = await createSession("bibi", secret, 1_000);
    expect(await verifySession(value, secret, 28_801_001)).toBeNull();
  });
});
