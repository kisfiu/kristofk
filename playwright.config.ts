import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PW_PORT ?? 4322);

export default defineConfig({
  testDir: "tests",
  // CI: annotations on the run plus an HTML report (uploaded on failure); one retry, with a trace of it
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  retries: process.env.CI ? 1 : 0,
  // Same base path as the deployed build (e.g. /kristofk/), so a root-absolute link fails here, not live.
  // Tests navigate with relative URLs ("./", "./#resume") so they work under any base.
  use: {
    baseURL: `http://localhost:${port}${(process.env.BASE_PATH ?? "/").replace(/\/?$/, "/")}`,
    trace: "on-first-retry",
  },
  webServer: {
    command: `npx astro preview --port ${port} --ignore-lock`,
    port,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
});
