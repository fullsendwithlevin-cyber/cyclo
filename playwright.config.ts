import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
const DB = process.env.E2E_DATABASE_URL ?? "postgresql://assistant:assistant@localhost:5432/assistant_e2e";

/** E2E-Tests gegen einen echten Next-Server mit eigener Datenbank und Test-KI (AI_PROVIDER=scripted). */
export const e2eEnv = {
  DATABASE_URL: DB,
  APP_URL: `http://localhost:${PORT}`,
  ALLOW_DEV_LOGIN: "true",
  AI_PROVIDER: "scripted",
  UPLOAD_DIR: "./storage/e2e-uploads",
  TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY ?? "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
};

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", locale: "de-CH", timezoneId: "Europe/Zurich" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: `npx tsx tests/e2e/prepare-db.ts && npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    stdout: "pipe",
    timeout: 120_000,
    env: e2eEnv,
  },
});
