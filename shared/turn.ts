/** User text the server may see. `latest` is the message being answered. */
export interface Transcript {
  readonly earlier: readonly string[];
  readonly latest: string;
}

/** The client windows to this. The server rejects anything larger. It does not trim. */
export const TRANSCRIPT_LIMITS = {
  maxEarlier: 6,
  maxCharsPerRequest: 500,
} as const;

export type SpanSource =
  | { readonly at: "latest" }
  | { readonly at: "earlier"; readonly index: number };

/** A verbatim slice of one request. `text === requestText(transcript, source).slice(from, to)`. */
export interface SpanRef {
  readonly text: string;
  readonly source: SpanSource;
  readonly from: number;
  readonly to: number;
}

export interface ScoredSpan {
  readonly span: SpanRef;
  readonly probability: number;
}

export interface Extraction {
  readonly model: string;
  readonly placeQuestion: string;
  readonly candidates: readonly ScoredSpan[];
  readonly noneProbability: number;
  readonly placeConfidence: number;
}

export interface Location {
  readonly name: string;
  readonly region: string | null;
  readonly country: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly timezone: string;
}

export type WeatherCondition =
  | "clear"
  | "mainly-clear"
  | "partly-cloudy"
  | "overcast"
  | "fog"
  | "drizzle"
  | "rain"
  | "freezing-rain"
  | "snow"
  | "showers"
  | "thunderstorm"
  | "unknown";

export interface CurrentWeather {
  readonly observedAt: string;
  readonly condition: WeatherCondition;
  readonly isDay: boolean;
  readonly temperatureC: number;
  readonly feelsLikeC: number;
  readonly humidityPct: number;
  readonly precipitationMm: number;
  readonly windKmh: number;
  readonly windGustKmh: number;
  readonly windDirectionDeg: number;
}

export interface AnsweredTurn {
  readonly kind: "answered";
  readonly extraction: Extraction;
  readonly place: SpanRef;
  readonly location: Location;
  readonly current: CurrentWeather;
}

export interface PlaceNotFoundTurn {
  readonly kind: "place-not-found";
  readonly extraction: Extraction;
  readonly place: SpanRef;
}

export interface NoPlaceNamedTurn {
  readonly kind: "no-place-named";
  readonly extraction: Extraction;
}

export interface ExtractionUnavailableTurn {
  readonly kind: "extraction-unavailable";
  readonly detail: string;
}

export interface WeatherUnavailableTurn {
  readonly kind: "weather-unavailable";
  readonly extraction: Extraction;
  readonly place: SpanRef;
  readonly detail: string;
}

export type TurnResult =
  | AnsweredTurn
  | PlaceNotFoundTurn
  | NoPlaceNamedTurn
  | ExtractionUnavailableTurn
  | WeatherUnavailableTurn;

/** The request a span was cut from. */
export function requestText(transcript: Transcript, source: SpanSource): string {
  if (source.at === "latest") {
    return transcript.latest;
  }
  return transcript.earlier[source.index] ?? "";
}
