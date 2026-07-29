// @ts-check
const { defineConfig } = require('@playwright/test');

// This sandbox pre-installs a specific Chromium build outside npm's usual
// browser cache; pointing at it directly avoids a redundant download attempt
// regardless of which @playwright/test version is installed.
const CHROMIUM_PATH = '/opt/pw-browsers/chromium';
const fs = require('node:fs');

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: [['list']],
  timeout: 60000, // the page's Google Fonts @import can be slow on constrained/proxied networks
  use: {
    ...(fs.existsSync(CHROMIUM_PATH) ? { launchOptions: { executablePath: CHROMIUM_PATH } } : {})
  }
});
