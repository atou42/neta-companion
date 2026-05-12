import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "sprite_lab_browser.spec.mjs",
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:4177",
    viewport: { width: 1440, height: 960 },
  },
});
