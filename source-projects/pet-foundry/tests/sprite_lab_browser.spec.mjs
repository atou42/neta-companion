import { expect, test } from "@playwright/test";
import { spawn } from "node:child_process";

let serverProcess = null;

async function serverReady() {
  try {
    const response = await fetch("http://127.0.0.1:4177/");
    return response.ok;
  } catch {
    return false;
  }
}

test.beforeAll(async () => {
  if (await serverReady()) return;
  serverProcess = spawn("python3", ["-m", "http.server", "4177", "--directory", "web/sprite-lab"], {
    cwd: process.cwd(),
    stdio: "ignore",
  });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await serverReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("sprite lab test server did not start");
});

test.afterAll(() => {
  serverProcess?.kill();
});

test("renders the sprite lab and exports an adjusted sheet", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#app")).toBeVisible();
  await page.waitForFunction(() => window.SpriteLab?.ready === true);

  const stats = await page.evaluate(() => window.SpriteLab.stageStats());
  expect(stats.width).toBeGreaterThan(650);
  expect(stats.height).toBeGreaterThan(500);
  expect(stats.variedPixels).toBeGreaterThan(10000);

  await page.locator("#pauseBtn").click();
  await page.locator("#offsetXInput").fill("12");
  await page.locator("#offsetXInput").dispatchEvent("change");
  await page.locator("#offsetYInput").fill("-5");
  await page.locator("#offsetYInput").dispatchEvent("change");

  const state = await page.evaluate(() => window.SpriteLab.getState());
  expect(state.offsets[`${state.selectedRow}:${state.selectedFrame}`]).toEqual({ x: 12, y: -5 });

  const exported = await page.evaluate(() => window.SpriteLab.exportSheetDataURL());
  expect(exported.startsWith("data:image/png;base64,")).toBe(true);
  expect(exported.length).toBeGreaterThan(5000);
});

test("supports single-row sheets and variable frame counts", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.SpriteLab?.ready === true);

  await page.evaluate(() => window.SpriteLab.setLayout(1, 5));
  await page.evaluate(() => window.SpriteLab.setFrameCount(0, 5));
  let state = await page.evaluate(() => window.SpriteLab.getState());
  expect(state.rowCount).toBe(1);
  expect(state.slotCount).toBe(5);
  expect(state.rows[0].frameCount).toBe(5);

  await page.evaluate(() => window.SpriteLab.setLayout(3, 8));
  await page.evaluate(() => {
    window.SpriteLab.setFrameCount(0, 6);
    window.SpriteLab.setFrameCount(1, 8);
    window.SpriteLab.setFrameCount(2, 4);
  });
  state = await page.evaluate(() => window.SpriteLab.getState());
  expect(state.rows.map((row) => row.frameCount)).toEqual([6, 8, 4]);
});

test("loads on a narrow viewport without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.waitForFunction(() => window.SpriteLab?.ready === true);
  await expect(page.locator("#stageCanvas")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(2);
});
