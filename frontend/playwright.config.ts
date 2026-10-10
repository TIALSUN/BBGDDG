import {existsSync} from 'node:fs'
import { defineConfig, devices } from '@playwright/test';

const chromePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH||(process.platform==='win32'&&existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined)
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:8201',
    extraHTTPHeaders: { 'x-bbgddg-token': 'e'.repeat(64) },
    trace: 'on-first-retry',
    ...(chromePath
      ? { launchOptions: { executablePath: chromePath } }
      : {}),
  },
  webServer: {
    command: 'node e2e/serve.mjs',
    port: 8201,
    reuseExistingServer: false,
    timeout: 15_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
