// End-to-end checks for the shell, content and accessibility fixes (issues #1, #3,
// #5, #6, #7, #15, #16, #20). They run against a production build:
//
//   npm run build && npx playwright test -c tests/e2e/shell
//
// An existing `next start -p 3402` is reused; set BASE_URL to test another server.
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3402";

export default defineConfig({
  testDir: ".",
  // Traces and screenshots of failures stay out of the repository.
  outputDir: join(tmpdir(), "zama-e2e-shell-results"),
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 2,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    channel: "chrome",
    // The live map and the warehouse twin need WebGL; headless Chrome gets it from SwiftShader.
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
  },
  webServer: process.env.BASE_URL
    ? undefined
    : { command: "npx next start -p 3402", cwd: "../../..", url: `${BASE_URL}/en`, reuseExistingServer: true, timeout: 60_000 },
});
