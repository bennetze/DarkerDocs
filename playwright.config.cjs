const { defineConfig } = require("@playwright/test");
module.exports = defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.cjs",
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: "artifacts/browser-results.json" }],
  ],
  use: {
    headless: true,
    viewport: { width: 1120, height: 780 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
