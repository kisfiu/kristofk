import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  reporter: process.env.CI ? "github" : "list",
  // Same base path as the deployed build (e.g. /kristofk/), so a root-absolute link fails here, not live.
  // Tests navigate with relative URLs ("./", "./#resume") so they work under any base.
  use: { baseURL: `http://localhost:4322${(process.env.BASE_PATH ?? "/").replace(/\/?$/, "/")}` },
  webServer: {
    command: "npx astro preview --port 4322 --ignore-lock",
    port: 4322,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
});
