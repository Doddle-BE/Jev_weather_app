import { expect, test } from "vitest";
import { parseForecast, parseGeocoding } from "./open-meteo";

test("geocoding JSON becomes a location, and an empty object is no place", () => {
  expect(parseGeocoding({})).toBeNull();
  expect(
    parseGeocoding({
      results: [
        {
          name: "New York",
          latitude: 40.71,
          longitude: -74.01,
          country: "United States",
          admin1: "New York",
          timezone: "America/New_York",
        },
      ],
    }),
  ).toEqual({
    name: "New York",
    region: "New York",
    country: "United States",
    latitude: 40.71,
    longitude: -74.01,
    timezone: "America/New_York",
  });
});

test("a clear forecast keeps the fixture temperature", () => {
  expect(
    parseForecast({
      current: {
        time: "2026-09-18T20:00",
        temperature_2m: 18.2,
        apparent_temperature: 17.4,
        relative_humidity_2m: 60,
        precipitation: 0,
        weather_code: 0,
        wind_speed_10m: 12,
        wind_gusts_10m: 20,
        wind_direction_10m: 180,
        is_day: 0,
      },
    }),
  ).toMatchObject({
    observedAt: "2026-09-18T20:00",
    temperatureC: 18.2,
    condition: "clear",
    isDay: false,
    windKmh: 12,
  });
});
