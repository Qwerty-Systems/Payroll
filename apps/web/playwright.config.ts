import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm exec vite --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_AUTH0_DOMAIN: 'e2e-example.us.auth0.com',
      VITE_AUTH0_CLIENT_ID: 'e2e-client-id',
      VITE_AUTH0_AUDIENCE: 'https://api.example.test',
      VITE_AUTH0_REDIRECT_URI: 'http://127.0.0.1:4173/auth/callback',
      VITE_API_BASE_URL: 'http://127.0.0.1:3001',
    },
  },
});
