import {describe, expect, it} from "vitest";
import {isLoginLocked, LOGIN_WINDOW_MS, recordLoginFailure} from "@/lib/login-rate-limit";

describe("login rate limit", () => {
  it("locks the fifth failure for fifteen minutes", () => {
    let state;
    for (let index = 0; index < 5; index += 1) {
      state = recordLoginFailure(state, "hashed-ip", 1_000 + index);
    }
    expect(isLoginLocked(state, 2_000)).toBe(true);
    expect(state.lockedUntil).toBe(1_004 + LOGIN_WINDOW_MS);
    expect(isLoginLocked(state, state.lockedUntil + 1)).toBe(false);
  });

  it("drops failures outside the rolling window", () => {
    const old = recordLoginFailure(undefined, "hashed-ip", 1_000);
    const current = recordLoginFailure(old, "hashed-ip", 1_000 + LOGIN_WINDOW_MS + 1);
    expect(current.failures).toHaveLength(1);
    expect(current.lockedUntil).toBe(0);
  });
});
