import { ICON, LABEL, skyFor } from "./weather-codes";

// Live weather at Hortobágy (the place on the wallpaper) from Open-Meteo: free, no API key,
// fixed coordinates, so the visitor's location is never asked for or sent.
const API =
  "https://api.open-meteo.com/v1/forecast?latitude=47.58&longitude=21.15&current=weather_code,is_day,temperature_2m&timezone=Europe%2FBudapest";
const root = document.documentElement;
const tray = document.getElementById("weather")!;
// the Weather window (a desktop app) shows the same live reading
const shown = (sel: string) => document.querySelector<HTMLElement>(`[data-wx-${sel}]`);

function failed() {
  if (root.dataset.weather) return; // a later refresh failed: keep showing the last good reading
  shown("icon")!.textContent = "☀️";
  shown("text")!.textContent = "Couldn't reach the weather service, so the desktop shows its sunny default.";
}

async function update() {
  try {
    const res = await fetch(API);
    if (!res.ok) return failed();
    const { current } = await res.json();
    const sky = skyFor(current.weather_code);
    const day = current.is_day === 1;
    const temp = `${Math.round(current.temperature_2m)}°C`;
    root.dataset.weather = sky;
    root.dataset.daylight = day ? "day" : "night";
    tray.textContent = `${ICON[sky][day ? 0 : 1]} ${temp}`;
    tray.title = `Hortobágy now: ${LABEL[sky]}, ${temp}`;
    tray.setAttribute("aria-label", tray.title);
    tray.hidden = false;
    shown("icon")!.textContent = ICON[sky][day ? 0 : 1];
    shown("text")!.textContent = `Hortobágy now: ${LABEL[sky]}, ${temp}${day ? "" : " (night)"}`;
    shown("time")!.textContent =
      `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}, next check in 30 minutes`;
  } catch {
    failed(); // offline or blocked: the desktop just keeps its default sunny look
  }
}

update();
setInterval(update, 30 * 60_000);
