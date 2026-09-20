import type { CandidateSpan } from "./extract-place.ts";
import type { CurrentWeather, Location, WeatherCondition } from "../shared/turn.ts";

const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Open-Meteo response is missing ${key}`);
  }
  return value;
}

function requiredNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (!isFiniteNumber(value)) {
    throw new Error(`Open-Meteo response is missing ${key}`);
  }
  return value;
}

export function conditionFromWmo(code: number): WeatherCondition {
  if (code === 0) {
    return "clear";
  }
  if (code === 1) {
    return "mainly-clear";
  }
  if (code === 2) {
    return "partly-cloudy";
  }
  if (code === 3) {
    return "overcast";
  }
  if (code === 45 || code === 48) {
    return "fog";
  }
  if (code >= 51 && code <= 57) {
    return "drizzle";
  }
  if (code >= 61 && code <= 65) {
    return "rain";
  }
  if (code === 66 || code === 67) {
    return "freezing-rain";
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return "snow";
  }
  if (code >= 80 && code <= 82) {
    return "showers";
  }
  if (code >= 95 && code <= 99) {
    return "thunderstorm";
  }
  return "unknown";
}

/** First geocoding hit, or null when Open-Meteo has no place. */
export function parseGeocoding(json: unknown): Location | null {
  if (!isRecord(json)) {
    throw new Error("Geocoding response was not an object");
  }
  const results = json.results;
  if (results === undefined || (Array.isArray(results) && results.length === 0)) {
    return null;
  }
  if (!Array.isArray(results)) {
    throw new Error("Geocoding response is missing results");
  }
  const first = results[0];
  if (!isRecord(first)) {
    throw new Error("Geocoding response is missing results");
  }
  const region = first.admin1;
  return {
    name: requiredString(first, "name"),
    region: typeof region === "string" && region.length > 0 ? region : null,
    country: requiredString(first, "country"),
    latitude: requiredNumber(first, "latitude"),
    longitude: requiredNumber(first, "longitude"),
    timezone: requiredString(first, "timezone"),
  };
}

/** Current conditions. A shape change throws instead of becoming a zero. */
export function parseForecast(json: unknown): CurrentWeather {
  if (!isRecord(json) || !isRecord(json.current)) {
    throw new Error("Forecast response is missing current");
  }
  const current = json.current;
  const isDay = current.is_day;
  if (isDay !== 0 && isDay !== 1) {
    throw new Error("Forecast response is missing is_day");
  }
  return {
    observedAt: requiredString(current, "time"),
    condition: conditionFromWmo(requiredNumber(current, "weather_code")),
    isDay: isDay === 1,
    temperatureC: requiredNumber(current, "temperature_2m"),
    feelsLikeC: requiredNumber(current, "apparent_temperature"),
    humidityPct: requiredNumber(current, "relative_humidity_2m"),
    precipitationMm: requiredNumber(current, "precipitation"),
    windKmh: requiredNumber(current, "wind_speed_10m"),
    windGustKmh: requiredNumber(current, "wind_gusts_10m"),
    windDirectionDeg: requiredNumber(current, "wind_direction_10m"),
  };
}

function placeQuery(span: CandidateSpan): string {
  return span.text.trim().replace(/\s+/g, " ");
}

export async function geocode(place: CandidateSpan): Promise<Location | null> {
  const url = new URL(GEOCODING_URL);
  url.searchParams.set("name", placeQuery(place));
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Geocoding failed (${response.status})`);
  }
  return parseGeocoding(await response.json());
}

export async function fetchCurrentWeather(location: Location): Promise<CurrentWeather> {
  const url = new URL(FORECAST_URL);
  url.searchParams.set("latitude", String(location.latitude));
  url.searchParams.set("longitude", String(location.longitude));
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("temperature_unit", "celsius");
  url.searchParams.set("wind_speed_unit", "kmh");
  url.searchParams.set("precipitation_unit", "mm");
  url.searchParams.set(
    "current",
    [
      "temperature_2m",
      "apparent_temperature",
      "relative_humidity_2m",
      "precipitation",
      "weather_code",
      "wind_speed_10m",
      "wind_gusts_10m",
      "wind_direction_10m",
      "is_day",
    ].join(","),
  );
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Forecast failed (${response.status})`);
  }
  return parseForecast(await response.json());
}
