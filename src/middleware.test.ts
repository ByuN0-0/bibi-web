import {afterEach, describe, expect, it} from "vitest";
import {NextRequest} from "next/server";
import {middleware} from "@/middleware";
import {createSession, SESSION_COOKIE} from "@/lib/session";

const secret = "middleware-session-secret-at-least-32-characters";

describe("lol-statics middleware", () => {
  afterEach(() => {
    delete process.env.SESSION_SECRET;
    delete process.env.ADMIN_USERNAME;
  });

  it("redirects an unauthenticated page and rejects an API", async () => {
    process.env.SESSION_SECRET = secret;
    process.env.ADMIN_USERNAME = "bibi";
    const page = await middleware(new NextRequest("https://bibi.example/lol-statics"));
    const api = await middleware(new NextRequest("https://bibi.example/api/lol-statics/players"));

    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toBe("https://bibi.example/lol-statics/login");
    expect(api.status).toBe(401);
  });

  it("accepts a valid signed session", async () => {
    process.env.SESSION_SECRET = secret;
    process.env.ADMIN_USERNAME = "bibi";
    const session = await createSession("bibi", secret);
    const request = new NextRequest("https://bibi.example/lol-statics", {
      headers: {cookie: `${SESSION_COOKIE}=${session}`},
    });

    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
