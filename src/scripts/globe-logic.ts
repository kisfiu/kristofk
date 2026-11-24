// The Globe's data and maths, without three.js or the DOM: the places Kristóf has been to (each with a landscape
// photo in src/assets/places/), point-in-country tests on the world-atlas shapes, and which place a click means.

export type Place = {
  /** File name in src/assets/places/ (without .avif); "hungary" has none: it brings back the Hortobágy wallpaper. */
  id: string;
  /** Country name as world-atlas spells it. */
  country: string;
  /** The landscape in the photo. */
  name: string;
  lat: number;
  lon: number;
  /** Too small to click on the globe (islands, San Marino): it gets a pin. */
  pin?: true;
};

const p = (id: string, country: string, name: string, lat: number, lon: number): Place => ({
  id,
  country,
  name,
  lat,
  lon,
});
export const HOME = p("hungary", "Hungary", "the Hortobágy puszta", 47.58, 21.15);
export const places: Place[] = [
  HOME,
  p("albania", "Albania", "the Vjosa Wild River", 40.3, 20.0),
  p("armenia", "Armenia", "Lake Sevan", 40.4, 45.2),
  p("austria", "Austria", "the Hohe Tauern", 47.1, 12.7),
  p("belgium", "Belgium", "the Hoge Kempen", 50.98, 5.63),
  p("bulgaria", "Bulgaria", "Vitosha", 42.56, 23.28),
  p("china", "China", "Sanjiangyuan", 34.5, 95.0),
  p("cyprus", "Cyprus", "the Troodos mountains", 34.93, 32.86),
  p("czechia", "Czechia", "Krkonoše", 50.7, 15.6),
  p("denmark", "Denmark", "Thy", 56.95, 8.4),
  p("england", "United Kingdom", "the Lake District, England", 54.5, -3.1),
  p("estonia", "Estonia", "Lahemaa", 59.57, 25.85),
  p("finland", "Finland", "Koli", 63.1, 29.8),
  p("france", "France", "the Vanoise", 45.4, 6.8),
  p("georgia", "Georgia", "Lagodekhi", 41.85, 46.3),
  p("germany", "Germany", "the Bavarian Forest", 48.95, 13.4),
  p("greece", "Greece", "Mount Olympus", 40.09, 22.36),
  p("iceland", "Iceland", "Þingvellir", 64.26, -21.13),
  p("italy", "Italy", "Gran Paradiso", 45.52, 7.27),
  p("jordan", "Jordan", "Wadi Rum", 29.58, 35.42),
  p("latvia", "Latvia", "the Gauja valley", 57.3, 25.0),
  p("lithuania", "Lithuania", "Aukštaitija", 55.4, 26.05),
  { ...p("malta", "Malta", "Majjistral", 35.95, 14.36), pin: true },
  p("montenegro", "Montenegro", "Durmitor", 43.15, 19.0),
  p("netherlands", "Netherlands", "the Veluwezoom", 52.03, 6.0),
  p("poland", "Poland", "the Białowieża Forest", 52.7, 23.85),
  p("portugal", "Portugal", "Peneda-Gerês", 41.75, -8.15),
  { ...p("azores", "Portugal", "Pico island in the Azores", 38.47, -28.4), pin: true },
  { ...p("madeira", "Portugal", "the Laurisilva forest of Madeira", 32.75, -17.0), pin: true },
  p("romania", "Romania", "the Retezat mountains", 45.37, 22.85),
  { ...p("san-marino", "San Marino", "Monte Titano", 43.94, 12.45), pin: true },
  p("serbia", "Serbia", "Fruška Gora", 45.15, 19.7),
  p("slovakia", "Slovakia", "the High Tatras", 49.17, 20.1),
  p("slovenia", "Slovenia", "Triglav", 46.38, 13.84),
  p("spain", "Spain", "the Picos de Europa", 43.2, -4.85),
  p("sweden", "Sweden", "Laponia", 67.3, 17.5),
  p("switzerland", "Switzerland", "the Swiss National Park", 46.66, 10.2),
  p("turkey", "Turkey", "Göreme in Cappadocia", 38.64, 34.83),
  p("usa", "United States of America", "Yellowstone", 44.6, -110.5),
];
export const visited = new Set(places.map((x) => x.country));
/** How Racka and the lists name a place's country. */
export const where = (x: Place) =>
  ({ "United Kingdom": "England", "United States of America": "the USA" })[x.country] ?? x.country;

type Ring = number[][];
/** A country from world-atlas, as topojson-client's feature() gives it. */
export type Country = {
  properties: { name: string };
  geometry: { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] } | null;
};

// world-atlas outlines may cross the date line (Russia, Fiji) or circle a pole (Antarctica). Unwrapped, every ring
// is continuous in plain lon/lat, so it can be drawn and tested flat (shifted by ±360° where it runs off the map),
// and a ring around a pole is closed along it.
function unwrap(ring: Ring): Ring {
  const out: Ring = [];
  let shift = 0;
  for (const [i, [lon, lat]] of ring.entries()) {
    const prev = i ? ring[i - 1][0] : lon;
    if (lon - prev > 180) shift -= 360;
    else if (prev - lon > 180) shift += 360;
    out.push([lon + shift, lat]);
  }
  if (shift) {
    const pole = out.reduce((sum, p) => sum + p[1], 0) > 0 ? 90 : -90;
    out.push([out[out.length - 1][0], pole], [out[0][0], pole]);
  }
  return out;
}
type Shape = { polys: Ring[][]; box: [number, number, number, number] };
const cache = new WeakMap<Country, Shape>();
function shape(c: Country): Shape {
  let s = cache.get(c);
  if (!s) {
    const raw = !c.geometry ? [] : c.geometry.type === "Polygon" ? [c.geometry.coordinates] : c.geometry.coordinates;
    const polys = raw.map((poly) => poly.map(unwrap));
    const box: Shape["box"] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of polys.flat(2)) {
      box[0] = Math.min(box[0], x);
      box[1] = Math.min(box[1], y);
      box[2] = Math.max(box[2], x);
      box[3] = Math.max(box[3], y);
    }
    s = { polys, box };
    cache.set(c, s);
  }
  return s;
}
/** A country's polygons (outer ring, then holes), unwrapped. */
export const polygons = (c: Country) => shape(c).polys;

// even-odd ray casting
function inRing(ring: Ring, x: number, y: number) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// even-odd over all rings, like the canvas fill: Antarctica's outer ring is a tiny circle at the pole and its coast a
// "hole", which only works out this way
const inPolygon = (poly: Ring[], x: number, y: number) => poly.filter((r) => inRing(r, x, y)).length % 2 === 1;
export const countryAt = (countries: Country[], lon: number, lat: number) =>
  countries.find((c) => {
    const { polys, box } = shape(c);
    // the bounding box first: most countries are nowhere near the pointer
    return [lon, lon - 360, lon + 360].some(
      (x) => x >= box[0] && x <= box[2] && lat >= box[1] && lat <= box[3] && polys.some((p) => inPolygon(p, x, lat)),
    );
  });

/** The place a point on the globe means: a pin within `pin` degrees (islands and San Marino), else the nearest
 * place in the visited country under it, else nothing (the country, if any, is just named). */
export function placeAt(country: string | undefined, lon: number, lat: number, pin = 0.7): Place | undefined {
  const d = (x: Place) => Math.hypot((x.lon - lon) * Math.cos((lat * Math.PI) / 180), x.lat - lat);
  const near = places.filter((x) => x.pin && d(x) < pin);
  const pool = near.length ? near : places.filter((x) => x.country === country);
  return pool.sort((a, b) => d(a) - d(b))[0];
}
