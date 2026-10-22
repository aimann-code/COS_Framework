import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testMatch: "frontend.spec.ts",
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:3002",
    trace: "retain-on-failure",
    reducedMotion: "reduce",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: process.env.PLAYWRIGHT_CHANNEL } }],
  webServer: {
    command: "npm run dev --workspace apps/web -- --port 3002",
    env: { NEXT_PUBLIC_COS_MODE: "demo", COS_NEXT_DIST_DIR: ".next-demo" },
    url: "http://127.0.0.1:3002",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
