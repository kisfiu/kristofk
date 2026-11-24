import { readdirSync } from "node:fs";
import { feature } from "topojson-client";
import { describe, expect, it } from "vitest";
import world from "world-atlas/countries-50m.json" with { type: "json" };
import { type Country, countryAt, HOME, placeAt, places, visited } from "./globe-logic";

// biome-ignore lint/suspicious/noExplicitAny: world-atlas ships untyped JSON
const countries = (feature(world as any, (world as any).objects.countries) as any).features as Country[];

describe("globe", () => {
  it("has a photo for every place but home, and 37 countries", () => {
    const photos = readdirSync("src/assets/places").map((f) => f.replace(".avif", ""));
    expect(
      places
        .filter((x) => x !== HOME)
        .map((x) => x.id)
        .sort(),
    ).toEqual(photos.sort());
    expect(visited.size).toBe(37); // the Travel window says 37 countries
    for (const c of visited)
      expect(
        countries.some((x) => x.properties.name === c),
        c,
      ).toBe(true);
  });

  it("finds the country under each place, holes and islands included", () => {
    for (const x of places.filter((x) => !["malta", "san-marino"].includes(x.id)))
      expect(countryAt(countries, x.lon, x.lat)?.properties.name, x.id).toBe(x.country);
    expect(countryAt(countries, 12.45, 43.94)?.properties.name).toBe("San Marino"); // a hole in Italy
    expect(countryAt(countries, -30, 45)).toBeUndefined(); // the Atlantic
    expect(countryAt(countries, 0, 85)).toBeUndefined(); // the Arctic Ocean, around Russia's date-line edge
    expect(countryAt(countries, -175, 66)?.properties.name).toBe("Russia"); // Chukotka, past the date line
    expect(countryAt(countries, 0, -85)?.properties.name).toBe("Antarctica"); // a ring around the pole
  });

  it("picks the nearest place in a country with several photos", () => {
    expect(placeAt("Portugal", -9.1, 38.7)?.id).toBe("portugal"); // Lisbon
    expect(placeAt("Portugal", -28.0, 38.6)?.id).toBe("azores");
    expect(placeAt("Portugal", -16.9, 32.65)?.id).toBe("madeira");
    expect(placeAt("Italy", 14.4, 35.9)?.id).toBe("malta"); // a pin wins over the country around it
    expect(placeAt("Canada", -100, 55)).toBeUndefined();
  });
});
