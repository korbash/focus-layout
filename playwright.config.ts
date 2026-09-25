import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test', testMatch: '*.spec.ts', timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:4323', viewport: { width: 1500, height: 980 }, launchOptions: { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] } },
  webServer: { command: 'npm run dev -- --port 4323', url: 'http://127.0.0.1:4323', reuseExistingServer: false },
});
