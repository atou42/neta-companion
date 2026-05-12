export const DEFAULT_ROW_NAMES = [
  "Idle",
  "Run",
  "Jump",
  "Wave",
  "Wait",
  "Hit",
  "Review",
  "Custom",
];

export function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
}

export function clampInteger(value, min, max, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a number`);
  }
  const rounded = Math.round(parsed);
  return Math.min(max, Math.max(min, rounded));
}

export function offsetKey(rowIndex, frameIndex) {
  assertPositiveInteger(rowIndex + 1, "rowIndex");
  assertPositiveInteger(frameIndex + 1, "frameIndex");
  return `${rowIndex}:${frameIndex}`;
}

export function makeRows(rowCount, slotCount, existingRows = []) {
  assertPositiveInteger(rowCount, "rowCount");
  assertPositiveInteger(slotCount, "slotCount");
  return Array.from({ length: rowCount }, (_, index) => {
    const existing = existingRows[index] || {};
    const frameCount = clampInteger(existing.frameCount ?? slotCount, 1, slotCount, "frameCount");
    return {
      id: existing.id || `row-${index + 1}`,
      name: String(existing.name || DEFAULT_ROW_NAMES[index % DEFAULT_ROW_NAMES.length]),
      frameCount,
    };
  });
}

export function normalizeLayout(input) {
  const width = Number(input.width);
  const height = Number(input.height);
  const rowCount = Number(input.rowCount);
  const slotCount = Number(input.slotCount);
  assertPositiveInteger(width, "width");
  assertPositiveInteger(height, "height");
  assertPositiveInteger(rowCount, "rowCount");
  assertPositiveInteger(slotCount, "slotCount");
  return {
    width,
    height,
    rowCount,
    slotCount,
    cellWidth: width / slotCount,
    cellHeight: height / rowCount,
  };
}

export function layoutWarnings(layout) {
  const warnings = [];
  if (!Number.isInteger(layout.cellWidth)) {
    warnings.push("Sheet width is not evenly divisible by frame slots.");
  }
  if (!Number.isInteger(layout.cellHeight)) {
    warnings.push("Sheet height is not evenly divisible by rows.");
  }
  return warnings;
}

export function getFrameRect(layoutInput, rowIndex, frameIndex) {
  const layout = normalizeLayout(layoutInput);
  if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= layout.rowCount) {
    throw new Error("rowIndex is outside the sheet layout");
  }
  if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= layout.slotCount) {
    throw new Error("frameIndex is outside the sheet layout");
  }
  return {
    x: frameIndex * layout.cellWidth,
    y: rowIndex * layout.cellHeight,
    width: layout.cellWidth,
    height: layout.cellHeight,
  };
}

export function getOffset(offsets, rowIndex, frameIndex) {
  const raw = offsets[offsetKey(rowIndex, frameIndex)];
  return {
    x: Number(raw?.x || 0),
    y: Number(raw?.y || 0),
  };
}

export function setOffset(offsets, rowIndex, frameIndex, nextOffset) {
  const x = Number(nextOffset.x);
  const y = Number(nextOffset.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error("offset x and y must be finite numbers");
  }
  return {
    ...offsets,
    [offsetKey(rowIndex, frameIndex)]: { x, y },
  };
}

export function resetRowOffsets(offsets, rowIndex, frameCount) {
  assertPositiveInteger(rowIndex + 1, "rowIndex");
  assertPositiveInteger(frameCount, "frameCount");
  const next = { ...offsets };
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    delete next[offsetKey(rowIndex, frameIndex)];
  }
  return next;
}

export function buildExportPlan(layoutInput, rows, offsets) {
  const layout = normalizeLayout(layoutInput);
  return rows.flatMap((row, rowIndex) => {
    const frameCount = clampInteger(row.frameCount, 1, layout.slotCount, "frameCount");
    return Array.from({ length: frameCount }, (_, frameIndex) => {
      const rect = getFrameRect(layout, rowIndex, frameIndex);
      const offset = getOffset(offsets, rowIndex, frameIndex);
      return {
        rowIndex,
        frameIndex,
        source: rect,
        destination: {
          x: rect.x + offset.x,
          y: rect.y + offset.y,
          width: rect.width,
          height: rect.height,
        },
        offset,
      };
    });
  });
}

export function serializeAlignment({ sheetName, layout, rows, offsets }) {
  const normalized = normalizeLayout(layout);
  return JSON.stringify(
    {
      schemaVersion: "pet-foundry.sprite-lab.v0",
      sheetName: sheetName || "untitled-sheet",
      layout: {
        width: normalized.width,
        height: normalized.height,
        rowCount: normalized.rowCount,
        slotCount: normalized.slotCount,
      },
      rows: rows.map((row, index) => ({
        id: row.id || `row-${index + 1}`,
        name: String(row.name || `Row ${index + 1}`),
        frameCount: clampInteger(row.frameCount, 1, normalized.slotCount, "frameCount"),
      })),
      offsets: Object.entries(offsets).map(([key, value]) => ({
        key,
        x: Number(value.x || 0),
        y: Number(value.y || 0),
      })),
    },
    null,
    2,
  );
}

export function parseAlignment(text) {
  const data = JSON.parse(text);
  if (data.schemaVersion !== "pet-foundry.sprite-lab.v0") {
    throw new Error("unsupported alignment schema");
  }
  const layout = normalizeLayout(data.layout);
  if (!Array.isArray(data.rows) || data.rows.length !== layout.rowCount) {
    throw new Error("alignment rows do not match layout rowCount");
  }
  const rows = makeRows(layout.rowCount, layout.slotCount, data.rows);
  const offsets = {};
  for (const item of data.offsets || []) {
    if (!item || typeof item.key !== "string") {
      throw new Error("invalid offset entry");
    }
    const x = Number(item.x || 0);
    const y = Number(item.y || 0);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error("invalid offset value");
    }
    offsets[item.key] = { x, y };
  }
  return { sheetName: data.sheetName || "untitled-sheet", layout, rows, offsets };
}
