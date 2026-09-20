import { expect, test } from "vitest";
import { parseTranscript } from "./vite-plugin";

test("parseTranscript rejects a blank message and a seventh earlier message", () => {
  expect(parseTranscript({ latest: "  ", earlier: [] })).toBeNull();
  expect(parseTranscript({ latest: "Hi", earlier: ["a", "b", "c", "d", "e", "f", "g"] })).toBeNull();
  expect(parseTranscript({ latest: "Hi", earlier: ["earlier"] })).toEqual({
    latest: "Hi",
    earlier: ["earlier"],
  });
});
