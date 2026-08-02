import "server-only";
import {getServerEnv} from "@/lib/server-env";

export type SodaDocument<T> = {id: string; etag: string; value: T};

class SodaClient {
  private readonly env = getServerEnv();

  async ensureCollection(collection: string): Promise<void> {
    const response = await this.request("PUT", this.collectionUrl(collection));
    if (![200, 201, 409].includes(response.status)) {
      throw new Error(`SODA collection initialization failed (${response.status})`);
    }
  }

  async list<T>(collection: string): Promise<SodaDocument<T>[]> {
    const response = await this.request(
      "GET",
      `${this.collectionUrl(collection)}?fields=all&limit=1000`,
    );
    await this.ensureOk(response, "list");
    return this.parse<T>(await response.json());
  }

  async query<T>(collection: string, filter: Record<string, unknown>): Promise<SodaDocument<T>[]> {
    const response = await this.request(
      "POST",
      `${this.collectionUrl(collection)}?action=query&fields=all&limit=1000`,
      filter,
    );
    await this.ensureOk(response, "query");
    return this.parse<T>(await response.json());
  }

  async insert(collection: string, value: unknown): Promise<void> {
    const response = await this.request("POST", this.collectionUrl(collection), value);
    await this.ensureOk(response, "insert");
  }

  async replace(collection: string, document: SodaDocument<unknown>, value: unknown): Promise<void> {
    const response = await this.request(
      "PUT",
      `${this.collectionUrl(collection)}/${encodeURIComponent(document.id)}`,
      value,
      document.etag,
    );
    if (response.status === 412) throw new Error("SODA_CONFLICT");
    await this.ensureOk(response, "replace");
  }

  async delete(collection: string, document: SodaDocument<unknown>): Promise<void> {
    const response = await this.request(
      "DELETE",
      `${this.collectionUrl(collection)}/${encodeURIComponent(document.id)}`,
      undefined,
      document.etag,
    );
    if (response.status !== 404) await this.ensureOk(response, "delete");
  }

  private collectionUrl(collection: string) {
    return `${this.env.sodaBaseUrl}/${encodeURIComponent(collection)}`;
  }

  private async request(
    method: string,
    url: string,
    body?: unknown,
    etag?: string,
  ): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetch(url, {
          method,
          cache: "no-store",
          signal: AbortSignal.timeout(this.env.sodaTimeoutMs),
          headers: {
            Authorization: `Basic ${Buffer.from(
              `${this.env.sodaUsername}:${this.env.sodaPassword}`,
            ).toString("base64")}`,
            Accept: "application/json",
            ...(body === undefined ? {} : {"Content-Type": "application/json"}),
            ...(etag ? {"If-Match": etag} : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        if ((response.status === 429 || response.status >= 500) && attempt < 3) {
          const retryAfter = Math.min(Number(response.headers.get("retry-after") ?? attempt), 5);
          await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
          continue;
        }
        return response;
      } catch (error) {
        lastError = error;
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 250));
        }
      }
    }
    throw new Error("SODA request failed", {cause: lastError});
  }

  private async ensureOk(response: Response, operation: string) {
    if (!response.ok) throw new Error(`SODA ${operation} failed (${response.status})`);
  }

  private parse<T>(payload: unknown): SodaDocument<T>[] {
    const items = (payload as {items?: Array<Record<string, unknown>>})?.items ?? [];
    return items.map((item) => {
      let value = item.value ?? item.content ?? item;
      if (typeof value === "string") value = JSON.parse(value);
      return {id: String(item.id ?? ""), etag: String(item.etag ?? ""), value: value as T};
    });
  }
}

export const soda = new SodaClient();
