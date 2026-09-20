import type { CurrentWeather, Location, Transcript, TurnResult } from "../shared/turn.ts";
import {
  createPlaceExtractor,
  typeSafeClient,
  type CandidateSpan,
  type ExtractPlace,
  type PlaceExtraction,
} from "./extract-place.ts";
import { fetchCurrentWeather, geocode } from "./open-meteo.ts";

export interface WeatherTurnDeps {
  readonly extractPlace: ExtractPlace;
  readonly geocode: (place: CandidateSpan) => Promise<Location | null>;
  readonly fetchCurrentWeather: (location: Location) => Promise<CurrentWeather>;
}

function errorDetail(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return "Unknown error";
}

function toSpanRef(span: CandidateSpan) {
  return {
    text: span.text,
    source: span.source,
    from: span.from,
    to: span.to,
  };
}

/** One weather turn. Running it twice performs two lookups and writes nothing. */
export async function answerWeatherTurn(
  transcript: Transcript,
  deps: WeatherTurnDeps,
): Promise<TurnResult> {
  let picked: PlaceExtraction;
  try {
    picked = await deps.extractPlace(transcript);
  } catch (error) {
    return { kind: "extraction-unavailable", detail: errorDetail(error) };
  }
  if (picked.kind === "none") {
    return { kind: "no-place-named", extraction: picked.extraction };
  }
  const place = toSpanRef(picked.place);
  try {
    const location = await deps.geocode(picked.place);
    if (location === null) {
      return { kind: "place-not-found", extraction: picked.extraction, place };
    }
    const current = await deps.fetchCurrentWeather(location);
    return {
      kind: "answered",
      extraction: picked.extraction,
      place,
      location,
      current,
    };
  } catch (error) {
    return {
      kind: "weather-unavailable",
      extraction: picked.extraction,
      place,
      detail: errorDetail(error),
    };
  }
}

export function liveDeps(): WeatherTurnDeps {
  return {
    extractPlace: (transcript) => createPlaceExtractor(typeSafeClient())(transcript),
    geocode,
    fetchCurrentWeather,
  };
}
