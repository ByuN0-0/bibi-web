import {describe, expect, it} from "vitest";
import {
  PUBLIC_TEAM_RATE_MAX_REQUESTS,
  PUBLIC_TEAM_RATE_WINDOW_MS,
  recordPublicTeamRequest,
} from "@/lib/lol/public-team-rate-limit";

describe("recordPublicTeamRequest", () => {
  it("allows requests up to the public limit", () => {
    const now = 100_000;
    const attempts = Array.from({length: PUBLIC_TEAM_RATE_MAX_REQUESTS - 1}, (_, index) => now - index);
    const result = recordPublicTeamRequest(attempts, now);
    expect(result.allowed).toBe(true);
    expect(result.attempts).toHaveLength(PUBLIC_TEAM_RATE_MAX_REQUESTS);
  });

  it("rejects excess requests and drops expired attempts", () => {
    const now = 100_000;
    const attempts = [
      now - PUBLIC_TEAM_RATE_WINDOW_MS,
      ...Array.from({length: PUBLIC_TEAM_RATE_MAX_REQUESTS}, (_, index) => now - index),
    ];
    const rejected = recordPublicTeamRequest(attempts, now);
    expect(rejected.allowed).toBe(false);
    expect(rejected.attempts).toHaveLength(PUBLIC_TEAM_RATE_MAX_REQUESTS);

    expect(recordPublicTeamRequest(attempts, now + PUBLIC_TEAM_RATE_WINDOW_MS + 1).allowed).toBe(true);
  });
});
