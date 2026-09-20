import { expect, test } from "vitest";
import type { CurrentWeather, Extraction, Location } from "../shared/turn";
import { PLACE_QUESTION, lookupPlace } from "./extract-place";
import { answerWeatherTurn } from "./weather-turn";

const transcript = { earlier: [] as const, latest: "What's the weather in New York" };

function extraction(): Extraction {
  return {
    model: "jev-latest",
    placeQuestion: PLACE_QUESTION,
    candidates: [],
    noneProbability: 1,
    placeConfidence: 0.4,
  };
}

const location: Location = {
  name: "New York",
  region: "New York",
  country: "United States",
  latitude: 40.71,
  longitude: -74.01,
  timezone: "America/New_York",
};

const weather: CurrentWeather = {
  observedAt: "2026-09-18T20:00",
  condition: "clear",
  isDay: false,
  temperatureC: 18.2,
  feelsLikeC: 17.4,
  humidityPct: 60,
  precipitationMm: 0,
  windKmh: 12,
  windGustKmh: 20,
  windDirectionDeg: 180,
};

test("a missing place does not geocode", async () => {
  const result = await answerWeatherTurn(transcript, {
    extractPlace: async () => ({ kind: "none", extraction: extraction() }),
    geocode: async () => {
      throw new Error("geocode should not run");
    },
    fetchCurrentWeather: async () => {
      throw new Error("forecast should not run");
    },
  });
  expect(result.kind).toBe("no-place-named");
});

test("an unknown geocode names the span and invents no weather", async () => {
  const span = lookupPlace(transcript, "New York");
  if (span === "none") {
    throw new Error("expected New York");
  }
  const result = await answerWeatherTurn(transcript, {
    extractPlace: async () => ({ kind: "picked", place: span, extraction: extraction() }),
    geocode: async () => null,
    fetchCurrentWeather: async () => weather,
  });
  expect(result.kind).toBe("place-not-found");
  if (result.kind === "place-not-found") {
    expect(result.place.text).toBe("New York");
  }
});

test("a resolved place returns the forecast temperature", async () => {
  const span = lookupPlace(transcript, "New York");
  if (span === "none") {
    throw new Error("expected New York");
  }
  const result = await answerWeatherTurn(transcript, {
    extractPlace: async () => ({ kind: "picked", place: span, extraction: extraction() }),
    geocode: async () => location,
    fetchCurrentWeather: async () => weather,
  });
  expect(result.kind).toBe("answered");
  if (result.kind === "answered") {
    expect(result.current.temperatureC).toBe(18.2);
    expect(result.place.text).toBe("New York");
  }
});
