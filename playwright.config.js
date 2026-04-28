const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 60000,
  retries: 0,
  fullyParallel: true,
  workers: 10,
  use: {
    baseURL: 'http://localhost:8080',
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: 'node server.js',
    port: 8080,
    reuseExistingServer: true,
    timeout: 10000,
  },
});
