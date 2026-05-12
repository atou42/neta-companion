import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExportPlan,
  getFrameRect,
  getOffset,
  layoutWarnings,
  makeRows,
  parseAlignment,
  serializeAlignment,
  setOffset,
} from "../web/sprite-lab/sprite-core.js";

test("builds single-row sheets with arbitrary frame counts", () => {
  const rows = makeRows(1, 6, [{ name: "Blink", frameCount: 6 }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Blink");
  assert.equal(rows[0].frameCount, 6);
  const rect = getFrameRect({ width: 576, height: 96, rowCount: 1, slotCount: 6 }, 0, 5);
  assert.deepEqual(rect, { x: 480, y: 0, width: 96, height: 96 });
});

test("keeps different frame counts per action row", () => {
  const rows = makeRows(3, 8, [
    { name: "Idle", frameCount: 6 },
    { name: "Run", frameCount: 8 },
    { name: "Jump", frameCount: 4 },
  ]);
  assert.deepEqual(rows.map((row) => row.frameCount), [6, 8, 4]);
  const plan = buildExportPlan({ width: 768, height: 384, rowCount: 3, slotCount: 8 }, rows, {});
  assert.equal(plan.length, 18);
  assert.equal(plan.at(-1).rowIndex, 2);
  assert.equal(plan.at(-1).frameIndex, 3);
});

test("applies frame offsets to export destinations without changing source rects", () => {
  const rows = makeRows(1, 4, [{ frameCount: 4 }]);
  const offsets = setOffset({}, 0, 2, { x: 7, y: -3 });
  const plan = buildExportPlan({ width: 256, height: 64, rowCount: 1, slotCount: 4 }, rows, offsets);
  assert.deepEqual(plan[2].source, { x: 128, y: 0, width: 64, height: 64 });
  assert.deepEqual(plan[2].destination, { x: 135, y: -3, width: 64, height: 64 });
  assert.deepEqual(getOffset(offsets, 0, 2), { x: 7, y: -3 });
});

test("serializes and parses alignment data strictly", () => {
  const rows = makeRows(2, 5, [
    { name: "Idle", frameCount: 3 },
    { name: "Run", frameCount: 5 },
  ]);
  const offsets = setOffset({}, 1, 4, { x: -2, y: 9 });
  const text = serializeAlignment({
    sheetName: "hero.png",
    layout: { width: 500, height: 200, rowCount: 2, slotCount: 5 },
    rows,
    offsets,
  });
  const parsed = parseAlignment(text);
  assert.equal(parsed.sheetName, "hero.png");
  assert.equal(parsed.rows[1].frameCount, 5);
  assert.deepEqual(parsed.offsets["1:4"], { x: -2, y: 9 });
});

test("reports non-even sheet divisions as warnings", () => {
  assert.deepEqual(
    layoutWarnings({ width: 101, height: 64, rowCount: 1, slotCount: 4, cellWidth: 25.25, cellHeight: 64 }),
    ["Sheet width is not evenly divisible by frame slots."],
  );
});

test("rejects invalid frame rectangles instead of returning fallback data", () => {
  assert.throws(
    () => getFrameRect({ width: 256, height: 64, rowCount: 1, slotCount: 4 }, 0, 4),
    /outside the sheet layout/,
  );
});
