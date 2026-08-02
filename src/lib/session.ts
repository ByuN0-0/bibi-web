export const SESSION_COOKIE = "bibi_lol_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export type AdminSession = {username: string; expiresAt: number};

function base64Url(bytes: Uint8Array): string {
  let value = "";
  bytes.forEach((byte) => (value += String.fromCharCode(byte)));
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const decoded = atob(padded);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

async function key(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {name: "HMAC", hash: "SHA-256"},
    false,
    ["sign", "verify"],
  );
}

export async function createSession(
  username: string,
  secret: string,
  now = Date.now(),
): Promise<string> {
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({
    username,
    expiresAt: now + SESSION_TTL_SECONDS * 1000,
  })));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await key(secret),
    new TextEncoder().encode(payload),
  );
  return `${payload}.${base64Url(new Uint8Array(signature))}`;
}

export async function verifySession(
  value: string | undefined,
  secret: string,
  now = Date.now(),
): Promise<AdminSession | null> {
  if (!value) return null;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra) return null;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await key(secret),
      decodeBase64Url(signature),
      new TextEncoder().encode(payload),
    );
    if (!valid) return null;
    const session = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(payload)),
    ) as AdminSession;
    if (!session.username || !Number.isFinite(session.expiresAt)
        || session.expiresAt <= now) return null;
    return session;
  } catch {
    return null;
  }
}
