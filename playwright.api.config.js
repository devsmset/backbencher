// API-only Playwright config for endpoint smoke checks.
module.exports = {
  testDir: "./tests/api",
  outputDir: "./artifacts/test-results",
  timeout: 30000,
  expect: {
    timeout: 5000
  },
  reporter: [["list"]],
  use: {
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: {
      Accept: "application/json, text/plain, */*"
    }
  }
};
