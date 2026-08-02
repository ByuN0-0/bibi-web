export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_MAX_FAILURES = 5;

export type LoginAttemptState = {
  schemaVersion: number;
  ipHash: string;
  failures: number[];
  lockedUntil: number;
  updatedAt: number;
};

export function isLoginLocked(attempt: LoginAttemptState | undefined, now: number) {
  return !!attempt && attempt.lockedUntil > now;
}

export function recordLoginFailure(
  attempt: LoginAttemptState | undefined,
  ipHash: string,
  now: number,
): LoginAttemptState {
  const failures = (attempt?.failures ?? []).filter((time) => time > now - LOGIN_WINDOW_MS);
  failures.push(now);
  return {
    schemaVersion: 1,
    ipHash,
    failures,
    lockedUntil: failures.length >= LOGIN_MAX_FAILURES ? now + LOGIN_WINDOW_MS : 0,
    updatedAt: now,
  };
}
