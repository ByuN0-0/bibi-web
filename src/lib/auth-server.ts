import "server-only";
import {createHash, timingSafeEqual} from "node:crypto";
import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import type {NextRequest} from "next/server";
import {getServerEnv} from "@/lib/server-env";
import {SESSION_COOKIE, verifySession} from "@/lib/session";
export {hasSameOrigin} from "@/lib/same-origin";

export function safeEqual(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

export async function requirePageSession() {
  const env = getServerEnv();
  const jar = await cookies();
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value, env.sessionSecret);
  if (!session || !safeEqual(session.username, env.adminUsername)) {
    redirect("/lol-statics/login");
  }
  return session;
}

export async function hasApiSession(request: NextRequest): Promise<boolean> {
  const env = getServerEnv();
  const session = await verifySession(
    request.cookies.get(SESSION_COOKIE)?.value,
    env.sessionSecret,
  );
  return !!session && safeEqual(session.username, env.adminUsername);
}
