import { readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * Next loads .env.local into the server process, but Playwright's own process never sees it,
 * so specs that need a real value (the organizer access code) silently fell back to the CI
 * placeholder and skipped themselves. Load it here so a local run actually exercises the game.
 */
function loadEnvLocal() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      if (process.env[key] === undefined) {
        process.env[key] = trimmed.slice(eq + 1).trim();
      }
    }
  } catch {
    // No .env.local (CI): the workflow supplies these directly.
  }
}

loadEnvLocal();

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  webServer: {
    command: process.env.CI ? "npm run start" : "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    // Never let a local e2e run reach a real image model: the suite drives a whole game.
    env: { AI_PROVIDER: process.env.AI_PROVIDER ?? "mock" }
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"] }
    }
  ]
});
