import { defineConfig, devices } from '@playwright/test';

const useSystemChrome = process.env.PW_USE_SYSTEM_CHROME === '1';
const browserChannel = process.env.PW_CHROME_CHANNEL || 'chrome';

export default defineConfig({
  testDir: './tests-auto',
  testIgnore: ['**/generate-*.spec.js'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'file://' + process.cwd() + '/extension/',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      // 默认使用 Playwright Chromium；本地网络受限时可切换到系统 Chrome。
      use: {
        ...devices['Desktop Chrome'],
        ...(useSystemChrome ? { channel: browserChannel } : {}),
      },
    },
  ],
});
