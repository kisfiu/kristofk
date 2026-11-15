export type Sky = "clear" | "cloudy" | "fog" | "rain" | "snow" | "storm";

/** WMO weather code (as returned by Open-Meteo) → how the desktop should look. */
export function skyFor(code: number): Sky {
  if (code <= 1) return "clear";
  if (code <= 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  return "cloudy"; // unknown codes: a neutral sky rather than a wrong dramatic one
}

export const LABEL: Record<Sky, string> = {
  clear: "clear",
  cloudy: "cloudy",
  fog: "fog",
  rain: "rain",
  snow: "snow",
  storm: "thunderstorm",
};

export const ICON: Record<Sky, [day: string, night: string]> = {
  clear: ["☀️", "🌙"],
  cloudy: ["⛅", "☁️"],
  fog: ["🌫️", "🌫️"],
  rain: ["🌧️", "🌧️"],
  snow: ["❄️", "❄️"],
  storm: ["⛈️", "⛈️"],
};
