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

export type RiotServerEnv = {
  apiKey: string;
  platform: "kr";
  region: "asia";
  timeoutMs: number;
};

export type IngestServerEnv = {
  token: string;
};

let cached: ServerEnv | null = null;
let cachedRiot: RiotServerEnv | null = null;
let cachedIngest: IngestServerEnv | null = null;

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
  if (adminPassword.length < 10) {
    throw new Error("ADMIN_PASSWORD must be at least 10 characters");
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

export function getRiotServerEnv(): RiotServerEnv {
  if (cachedRiot) return cachedRiot;
  const apiKey = process.env.RIOT_API_KEY?.trim();
  if (!apiKey) throw new Error("Missing required environment variable: RIOT_API_KEY");
  const platform = (process.env.RIOT_PLATFORM ?? "kr").trim().toLowerCase();
  const region = (process.env.RIOT_REGION ?? "asia").trim().toLowerCase();
  const timeout = Number(process.env.RIOT_TIMEOUT_SECONDS ?? "10");
  if (platform !== "kr") throw new Error("RIOT_PLATFORM must be kr");
  if (region !== "asia") throw new Error("RIOT_REGION must be asia");
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 60) {
    throw new Error("RIOT_TIMEOUT_SECONDS must be between 1 and 60");
  }
  cachedRiot = {
    apiKey,
    platform: "kr",
    region: "asia",
    timeoutMs: timeout * 1000,
  };
  return cachedRiot;
}

export function getIngestServerEnv(): IngestServerEnv {
  if (cachedIngest) return cachedIngest;
  const token = process.env.BIBI_INGEST_TOKEN?.trim();
  if (!token) throw new Error("Missing required environment variable: BIBI_INGEST_TOKEN");
  if (token.length < 32) throw new Error("BIBI_INGEST_TOKEN must be at least 32 characters");
  cachedIngest = {token};
  return cachedIngest;
}
