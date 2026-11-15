import { describe, expect, it } from "vitest";
import { skyFor } from "./weather-codes";

describe("skyFor", () => {
  it("maps WMO codes to desktop looks", () => {
    expect([0, 1].map(skyFor)).toEqual(["clear", "clear"]);
    expect([2, 3].map(skyFor)).toEqual(["cloudy", "cloudy"]);
    expect([45, 48].map(skyFor)).toEqual(["fog", "fog"]);
    expect([51, 61, 67, 80, 82].map(skyFor)).toEqual(["rain", "rain", "rain", "rain", "rain"]);
    expect([71, 77, 85, 86].map(skyFor)).toEqual(["snow", "snow", "snow", "snow"]);
    expect([95, 96, 99].map(skyFor)).toEqual(["storm", "storm", "storm"]);
    expect(skyFor(42)).toBe("cloudy"); // unknown code
  });
});
