import type { SpanRef, TurnResult } from "../shared/turn";

const CONDITIONS = [
  "clear",
  "mainly-clear",
  "partly-cloudy",
  "overcast",
  "fog",
  "drizzle",
  "rain",
  "freezing-rain",
  "snow",
  "showers",
  "thunderstorm",
  "unknown",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSpanRef(value: unknown): value is SpanRef {
  if (!isRecord(value) || typeof value.text !== "string") {
    return false;
  }
  if (typeof value.from !== "number" || typeof value.to !== "number" || !isRecord(value.source)) {
    return false;
  }
  if (value.source.at === "latest") {
    return true;
  }
  return value.source.at === "earlier" && typeof value.source.index === "number";
}

function isTurnResult(value: unknown): value is TurnResult {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return false;
  }
  if (value.kind === "extraction-unavailable") {
    return typeof value.detail === "string";
  }
  if (value.kind === "no-place-named") {
    return isRecord(value.extraction);
  }
  if (value.kind === "place-not-found") {
    return isRecord(value.extraction) && isSpanRef(value.place);
  }
  if (value.kind === "weather-unavailable") {
    return isRecord(value.extraction) && isSpanRef(value.place) && typeof value.detail === "string";
  }
  if (value.kind === "answered") {
    const current = value.current;
    if (!isRecord(current) || typeof current.condition !== "string") {
      return false;
    }
    const condition = current.condition;
    return (
      isRecord(value.extraction) &&
      isSpanRef(value.place) &&
      isRecord(value.location) &&
      CONDITIONS.some((item) => item === condition)
    );
  }
  return false;
}

/** Posts one transcript. Throws when the dev server cannot answer. */
export async function sendTurn(transcript: {
  readonly earlier: readonly string[];
  readonly latest: string;
}): Promise<TurnResult> {
  let response: Response;
  try {
    response = await fetch("/api/turn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(transcript),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Request failed";
    throw new Error(detail);
  }
  if (!response.ok) {
    throw new Error(await errorDetail(response));
  }
  const body: unknown = await response.json();
  if (!isTurnResult(body)) {
    throw new Error("The server returned an unexpected reply.");
  }
  return body;
}

async function errorDetail(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const parsed: unknown = JSON.parse(text);
    if (isRecord(parsed) && typeof parsed.error === "string") {
      return parsed.error;
    }
  } catch {
    if (text.length > 0) {
      return text;
    }
  }
  return `Request failed (${response.status})`;
}
