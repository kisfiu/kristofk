import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://localhost:4322" },
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
