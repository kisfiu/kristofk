// @ts-check
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://kisfiu.github.io",
  // "/" for kisfiu.github.io, "/<repo>" for any other repo name (set by the deploy workflow).
  base: process.env.BASE_PATH || "/",
  vite: {
    // XP.css 0.2.6 ships one invalid selector (`:before:not([value])`); skip that rule instead of failing the build.
    css: { lightningcss: { errorRecovery: true } },
    // the games load these on first open; bundled up front, the dev server doesn't reload the page when they appear
    optimizeDeps: {
      include: ["three", "three/examples/jsm/controls/OrbitControls.js", "topojson-client", "planck"],
    },
  },
});
