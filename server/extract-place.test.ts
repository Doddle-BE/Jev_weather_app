import { expect, test } from "vitest";
import { requestText } from "../shared/turn";
import { buildCandidates, lookupPlace } from "./extract-place";

const followUp = {
  earlier: ["What's the weather in New York"],
  latest: "and the wind?",
} as const;

test("a follow-up still offers New York from the earlier message", () => {
  const spans = buildCandidates(followUp);
  const match = spans.find((span) => span.text === "New York");
  expect(match?.text).toBe("New York");
  expect(match?.source).toEqual({ at: "earlier", index: 0 });
  expect(requestText(followUp, { at: "earlier", index: 0 }).slice(match?.from, match?.to)).toBe(
    "New York",
  );
  expect(spans.map((span) => span.text)).not.toContain("York?");
  expect(spans.map((span) => span.text)).not.toContain("York And");
});

test("a question mark keeps New York and Boston in separate spans", () => {
  const spans = buildCandidates({ earlier: [], latest: "in New York? And Boston" });
  const texts = spans.map((span) => span.text);
  expect(texts).toContain("New York");
  expect(texts).toContain("Boston");
  expect(texts.filter((text) => text.includes("York") && text.includes("Boston"))).toEqual([]);
});

test("lookup returns the earlier span, the sentinel, or throws", () => {
  expect(lookupPlace(followUp, "(no place named)")).toBe("none");
  const span = lookupPlace(followUp, "New York");
  expect(span).not.toBe("none");
  if (span === "none") {
    return;
  }
  expect(span.text).toBe("New York");
  expect(span.source).toEqual({ at: "earlier", index: 0 });
  expect(() => lookupPlace(followUp, "Paris")).toThrow("Unknown place option: Paris");
});
