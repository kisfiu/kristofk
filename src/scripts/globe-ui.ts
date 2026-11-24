// The Globe window: a three.js earth whose texture is drawn here in 2D from world-atlas (every country with its
// border, Kristóf's countries in gold). Hover names a country; clicking one he has been to highlights it, Racka
// says what it is, and the wallpaper becomes that landscape (src/assets/places/). Loaded on first open.
import {
  AdditiveBlending,
  AmbientLight,
  BackSide,
  BufferGeometry,
  CanvasTexture,
  DirectionalLight,
  Float32BufferAttribute,
  Mesh,
  MeshPhongMaterial,
  NearestFilter,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Raycaster,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { feature } from "topojson-client";
import worldUrl from "world-atlas/countries-50m.json?url";
import { store, wallpaper } from "./desktop";
import { type Country, countryAt, HOME, type Place, placeAt, places, polygons, visited, where } from "./globe-logic";
import { racka } from "./helper";

const W = 4096;
const H = 2048;
const px = (lon: number, lat: number): [number, number] => [((lon + 180) / 360) * W, ((90 - lat) / 180) * H];
const OCEAN = "#1c4f9c";
const LAND = "#d6dbbd";
const GOLD = "#f2b51b";
const PICKED = "#e8412c";

export async function initGlobe(el: HTMLElement) {
  const win = el.closest<HTMLElement>(".window")!;
  const canvas = el.querySelector<HTMLCanvasElement>("[data-canvas]")!;
  const tip = el.querySelector<HTMLElement>("[data-tip]")!;
  const status = el.querySelector<HTMLElement>("[data-status]")!;
  const pick = el.querySelector<HTMLSelectElement>("[data-pick]")!;

  const topo = await (await fetch(worldUrl)).json();
  // biome-ignore lint/suspicious/noExplicitAny: world-atlas ships untyped JSON
  const countries = (feature(topo, topo.objects.countries) as any).features as Country[];

  // ---- two flat maps, drawn and uploaded once: the colours, and a hidden one that holds each country's number
  // (so hovering and picking only change a number the GPU tints by, instead of redrawing a 4096 px map)
  const path = (ctx: CanvasRenderingContext2D, c: Country) => {
    ctx.beginPath();
    for (const poly of polygons(c))
      for (const ring of poly)
        for (const shift of [-360, 0, 360]) // a ring that runs off one edge comes back in at the other
          for (const [i, [lon, lat]] of ring.entries()) ctx[i ? "lineTo" : "moveTo"](...px(lon + shift, lat));
  };
  const flat = () => {
    const cv = Object.assign(document.createElement("canvas"), { width: W, height: H });
    return [cv, cv.getContext("2d")!] as const;
  };
  const [colours, b] = flat();
  const [ids, n] = flat();
  b.fillStyle = OCEAN;
  b.fillRect(0, 0, W, H);
  b.lineJoin = "round";
  // a country's number i as a colour: blue marks "a country" and red/green sit in the middle of 16-step cells,
  // so the soft edges where two colours blend don't read as some other country
  const idColour = (i: number) => `rgb(${(i % 16) * 16 + 8} ${Math.floor(i / 16) * 16 + 8} 255)`;
  for (const [i, c] of countries.entries()) {
    path(b, c);
    b.fillStyle = visited.has(c.properties.name) ? GOLD : LAND;
    b.fill("evenodd");
    b.strokeStyle = "#5e6450";
    b.lineWidth = 1.5;
    b.stroke();
    path(n, c);
    n.fillStyle = idColour(i);
    n.fill("evenodd");
  }
  const byName = (name?: string) => countries.find((c) => c.properties.name === name);
  // pins, so the islands and San Marino can be found and clicked; they light up with their country
  for (const x of places.filter((x) => x.pin)) {
    const [x0, y0] = px(x.lon, x.lat);
    for (const [ctx, fill] of [
      [b, PICKED],
      [n, idColour(countries.indexOf(byName(x.country)!))],
    ] as const) {
      ctx.beginPath();
      ctx.arc(x0, y0, 6, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
    }
    b.lineWidth = 2;
    b.strokeStyle = "#fff";
    b.stroke();
  }
  const texture = new CanvasTexture(colours);
  texture.colorSpace = SRGBColorSpace;
  const idTexture = new CanvasTexture(ids);
  idTexture.magFilter = idTexture.minFilter = NearestFilter;
  idTexture.generateMipmaps = false;
  const tint = { hover: { value: -1 }, pick: { value: -1 }, ids: { value: idTexture } };

  let hovered: Country | undefined;
  let picked = places.find((x) => x.id === store.get(localStorage, "kk-place"));
  let dirty = true; // draw on the next frame
  function paint() {
    tint.hover.value = hovered ? countries.indexOf(hovered) : -1;
    tint.pick.value = picked ? countries.indexOf(byName(picked.country)!) : -1;
    dirty = true;
  }
  paint();

  // ---- the 3D scene
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(1.5, devicePixelRatio));
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const scene = new Scene();
  const camera = new PerspectiveCamera(35, 1, 0.1, 100);
  const ground = new MeshPhongMaterial({ map: texture, shininess: 12 });
  // tint the hovered country lighter and the picked one red, by the number in the hidden map
  ground.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { hoverId: tint.hover, pickId: tint.pick, idMap: tint.ids });
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", "uniform float hoverId; uniform float pickId; uniform sampler2D idMap;\nvoid main() {")
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        vec4 cell = texture2D(idMap, vMapUv);
        vec2 q = cell.rg * 255.0;
        vec2 c = floor(q / 16.0);
        if (cell.b > 0.98 && all(lessThan(abs(q - c * 16.0 - 8.0), vec2(3.0)))) {
          float id = c.x + c.y * 16.0;
          if (abs(id - pickId) < 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.81, 0.05, 0.025), 0.8);
          else if (abs(id - hoverId) < 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), 0.4);
        }`,
      );
  };
  const earth = new Mesh(new SphereGeometry(1, 96, 64), ground);
  scene.add(earth, new AmbientLight(0xffffff, 1.6));
  const sun = new DirectionalLight(0xffffff, 1.6);
  sun.position.set(-2, 2, 3);
  camera.add(sun); // light always from the viewer's upper left
  scene.add(camera);
  // a soft blue atmosphere: a bigger sphere seen from inside, brightest at the earth's rim
  const glow = new ShaderMaterial({
    side: BackSide,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexShader:
      "varying vec3 n; void main() { n = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader:
      "varying vec3 n; void main() { float i = pow(0.72 - dot(n, vec3(0.0, 0.0, 1.0)), 3.0); gl_FragColor = vec4(0.35, 0.65, 1.0, 1.0) * i; }",
  });
  scene.add(new Mesh(new SphereGeometry(1.14, 64, 32), glow));
  // stars far away all round
  const stars = [];
  for (let i = 0; i < 1500; i++)
    stars.push(
      ...new Vector3()
        .randomDirection()
        .multiplyScalar(40 + Math.random() * 20)
        .toArray(),
    );
  const sky = new BufferGeometry().setAttribute("position", new Float32BufferAttribute(stars, 3));
  scene.add(new Points(sky, new PointsMaterial({ color: 0xffffff, size: 1.5, sizeAttenuation: false })));

  // the point on the sphere for a place, as SphereGeometry lays out its texture
  const at = (lon: number, lat: number) => {
    const phi = ((lon + 180) * Math.PI) / 180;
    const theta = ((90 - lat) * Math.PI) / 180;
    return new Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta));
  };
  const start = picked ?? HOME;
  camera.position.copy(at(start.lon, start.lat - 8).setLength(4.2));
  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enablePan: false, enableDamping: true, minDistance: 1.4, maxDistance: 7 });
  controls.rotateSpeed = 0.5;
  controls.zoomSpeed = 0.6;
  // it turns slowly by itself until someone touches it
  controls.autoRotate = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  controls.autoRotateSpeed = 0.5;
  controls.addEventListener("start", () => {
    controls.autoRotate = false;
  });
  controls.addEventListener("change", () => {
    dirty = true;
  });

  // ---- flying to a place: the camera swings round to look at it from the same distance
  let fly: Vector3 | undefined;
  const flyTo = (x: Place) => {
    fly = at(x.lon, x.lat);
  };

  let shown = !win.hidden;
  function frame() {
    if (!shown) return;
    if (move) hover(move);
    move = undefined;
    if (fly) {
      dirty = true;
      const d = camera.position.length();
      const next = camera.position.clone().normalize().lerp(fly, 0.08);
      camera.position.copy(next.setLength(Math.min(d, 3.2)));
      if (camera.position.clone().normalize().distanceTo(fly) < 0.002) fly = undefined;
    }
    controls.update();
    // only draw when something changed: a still globe costs nothing
    if (dirty) renderer.render(scene, camera);
    dirty = false;
    requestAnimationFrame(frame);
  }
  let size = "";
  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (!w || !h || size === `${w}x${h}`) return;
    size = `${w}x${h}`;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    dirty = true;
  };
  new ResizeObserver(resize).observe(canvas);
  // only draw while the window is open
  new MutationObserver(() => {
    const was = shown;
    shown = !win.hidden;
    if (shown && !was) {
      dirty = true;
      requestAnimationFrame(frame);
    }
  }).observe(win, { attributes: true, attributeFilter: ["hidden"] });

  // ---- hover and click
  const ray = new Raycaster();
  const lonLat = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(
      new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1),
      camera,
    );
    const uv = ray.intersectObject(earth)[0]?.uv;
    return uv && { lon: uv.x * 360 - 180, lat: uv.y * 180 - 90 };
  };
  const under = (e: PointerEvent) => {
    const ll = lonLat(e);
    if (!ll) return {};
    const country = countryAt(countries, ll.lon, ll.lat);
    return { country, place: placeAt(country?.properties.name, ll.lon, ll.lat) };
  };
  const label = (c?: Country, x?: Place) =>
    x
      ? x === HOME
        ? "Hungary: home"
        : `${where(x).replace("the USA", "USA")}: ${x.name}`
      : (c?.properties.name ?? "");

  // the pointer is looked at once a frame, not on every one of its many move events
  let move: PointerEvent | undefined;
  canvas.addEventListener("pointermove", (e) => {
    move = e;
  });
  function hover(e: PointerEvent) {
    const { country, place } = under(e);
    const c = place ? byName(place.country) : country;
    tip.textContent = label(country, place);
    tip.hidden = !tip.textContent || e.pointerType === "touch";
    const r = el.querySelector(".globe-view")!.getBoundingClientRect();
    tip.style.translate = `${e.clientX - r.left + 14}px ${e.clientY - r.top + 14}px`;
    canvas.style.cursor = place ? "pointer" : "";
    if (c !== hovered) {
      hovered = c;
      paint();
    }
  }
  canvas.addEventListener("pointerleave", () => {
    move = undefined;
    tip.hidden = true;
    if (hovered) {
      hovered = undefined;
      paint();
    }
  });
  // a click is a press that didn't drag the globe round
  let down: [number, number] | undefined;
  canvas.addEventListener("pointerdown", (e) => {
    down = [e.clientX, e.clientY];
  });
  canvas.addEventListener("pointerup", (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    const { country, place } = under(e);
    if (place) go(place);
    else if (country) status.textContent = `${country.properties.name}: Kristóf hasn't been here yet.`;
  });
  pick.addEventListener("change", () => {
    const x = places.find((x) => x.id === pick.value);
    if (x) go(x);
  });
  el.querySelector("[data-home]")!.addEventListener("click", () => go(HOME));

  function go(x: Place) {
    picked = x;
    pick.value = x.id;
    controls.autoRotate = false;
    paint();
    flyTo(x);
    const text =
      x === HOME
        ? "Back home in Hungary: this is the Hortobágy puszta, the usual wallpaper."
        : `This is ${where(x)}! Kristóf has been here. Look behind the window: the wallpaper is now ${x.name}.`;
    status.textContent = text;
    wallpaper(x === HOME ? undefined : x.id);
    racka(text, x === HOME ? [] : [["Back to Hortobágy", () => go(HOME)]]);
  }

  status.textContent = `${visited.size} countries in gold. Drag to turn the globe, scroll to zoom, click a gold one.`;
  racka(
    "Kristóf has been to the gold countries. Pick one and I'll take you there: the wallpaper changes to its landscape!",
    [],
  );
  if (picked) pick.value = picked.id;
  resize();
  requestAnimationFrame(frame);
}
