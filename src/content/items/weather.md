---

title: Hortobágy Weather
label: Weather
icon: weather
parent: desktop
order: 5.5
width: 480
links:

- { label: "Open-Meteo (weather data)", href: "https://open-meteo.com/" }

---

<div class="wx-now">
  <span class="wx-icon" data-wx-icon aria-hidden="true">⏳</span>
  <p><b data-wx-text>Checking the sky over Hortobágy…</b><br /><small data-wx-time></small></p>
</div>

## How the desktop background works

The wallpaper is the Hortobágy puszta, and it follows the **real weather there, right now**:

- ☀️ **Clear:** blue sky, storks, and the sun shining through the bridge
- ☁️ **Cloudy:** an overcast sky
- 🌫️ **Fog:** a milky haze over everything
- 🌧️ **Rain:** falling rain under grey clouds
- ❄️ **Snow:** a snowy puszta with drifting snowflakes
- ⛈️ **Thunderstorm:** a dark sky with the odd lightning flash
- 🌙 **After sunset:** a moonlit puszta under the stars, or a dark cloudy one

Every 30 minutes your browser asks [Open-Meteo](https://open-meteo.com/) for the current weather at Hortobágy (47.58° N, 21.15° E). Only those fixed coordinates are sent, never your location. If the weather can't be fetched, the desktop simply stays sunny. With reduced motion turned on, the rain and snow stand still.
