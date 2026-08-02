import {describe, expect, it} from "vitest";
import {parseSodaDocuments} from "@/lib/soda-document";

describe("SODA document parsing", () => {
  it("separates metadata from unwrapped document content", () => {
    const [document] = parseSodaDocuments<{name: string}>({
      items: [{
        name: "bibi",
        _id: "one",
        _etag: "v1",
        _createdOn: "today",
      }],
    });

    expect(document).toEqual({
      id: "one",
      etag: "v1",
      value: {name: "bibi"},
    });
  });

  it("removes persisted metadata from wrapped content", () => {
    const [document] = parseSodaDocuments<{name: string}>({
      items: [{
        id: "one",
        etag: "v2",
        value: {name: "bibi", _id: "stale-id"},
      }],
    });

    expect(document.value).toEqual({name: "bibi"});
  });
});
