export const PUBLIC_TEAM_RATE_WINDOW_MS = 60 * 1000;
export const PUBLIC_TEAM_RATE_MAX_REQUESTS = 10;

export type PublicTeamRateLimit = {
  allowed: boolean;
  attempts: number[];
  retryAt: number;
};

export function recordPublicTeamRequest(
  attempts: number[] | undefined,
  now = Date.now(),
): PublicTeamRateLimit {
  const recent = (attempts ?? []).filter((time) => time > now - PUBLIC_TEAM_RATE_WINDOW_MS);
  if (recent.length >= PUBLIC_TEAM_RATE_MAX_REQUESTS) {
    return {
      allowed: false,
      attempts: recent,
      retryAt: recent[0] + PUBLIC_TEAM_RATE_WINDOW_MS,
    };
  }
  recent.push(now);
  return {allowed: true, attempts: recent, retryAt: 0};
}
