export type SodaDocument<T> = {id: string; etag: string; value: T};

const DOCUMENT_METADATA_FIELDS = ["_id", "_etag", "_createdOn", "_lastModified"] as const;

export function parseSodaDocuments<T>(payload: unknown): SodaDocument<T>[] {
  const items = (payload as {items?: Array<Record<string, unknown>>})?.items ?? [];
  return items.map((item) => {
    let value = item.value ?? item.content ?? item;
    if (typeof value === "string") value = JSON.parse(value);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const content = {...value} as Record<string, unknown>;
      for (const field of DOCUMENT_METADATA_FIELDS) delete content[field];
      value = content;
    }
    return {
      id: String(item.id ?? item._id ?? ""),
      etag: String(item.etag ?? item._etag ?? ""),
      value: value as T,
    };
  });
}
