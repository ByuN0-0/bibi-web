import "server-only";

export type ServerEnv = {
  adminUsername: string;
  adminPassword: string;
  sessionSecret: string;
  sodaBaseUrl: string;
  sodaUsername: string;
  sodaPassword: string;
  sodaTimeoutMs: number;
};

let cached: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const required = (name: string) => {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Missing required environment variable: ${name}`);
    return value;
  };
  const adminUsername = required("ADMIN_USERNAME");
  const adminPassword = required("ADMIN_PASSWORD");
  const sessionSecret = required("SESSION_SECRET");
  const sodaBaseUrl = required("SODA_BASE_URL").replace(/\/$/, "");
  const sodaUsername = required("SODA_USERNAME");
  const sodaPassword = required("SODA_PASSWORD");
  const timeout = Number(process.env.SODA_TIMEOUT_SECONDS ?? "10");
  if (adminPassword.length < 12) {
    throw new Error("ADMIN_PASSWORD must be at least 12 characters");
  }
  if (sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters");
  }
  const parsed = new URL(sodaBaseUrl);
  if (parsed.protocol !== "https:" || !parsed.pathname.endsWith("/soda/latest")) {
    throw new Error("SODA_BASE_URL must be an HTTPS /soda/latest URL");
  }
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 60) {
    throw new Error("SODA_TIMEOUT_SECONDS must be between 1 and 60");
  }
  cached = {
    adminUsername,
    adminPassword,
    sessionSecret,
    sodaBaseUrl,
    sodaUsername,
    sodaPassword,
    sodaTimeoutMs: timeout * 1000,
  };
  return cached;
}
