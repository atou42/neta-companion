import {
  buildExportPlan,
  getFrameRect,
  getOffset,
  layoutWarnings,
  makeRows,
  normalizeLayout,
  parseAlignment,
  resetRowOffsets,
  serializeAlignment,
  setOffset,
} from "./sprite-core.js";

const DEFAULT_SHEET_URL = "https://public.cohub.run/s/7f3cc256-aec1-4673-a01c-456c594424e7/pet-62b095ea-default/spritesheet.webp";
const DEFAULT_SHEET_NAME = "pet-62b095ea/spritesheet.webp";

const $ = (selector) => document.querySelector(selector);

const els = {
  sheetName: $("#sheetName"),
  sheetInput: $("#sheetInput"),
  jsonInput: $("#jsonInput"),
  openSheetBtn: $("#openSheetBtn"),
  playerLink: $("#playerLink"),
  importJsonBtn: $("#importJsonBtn"),
  sampleBtn: $("#sampleBtn"),
  petFoundryPresetBtn: $("#petFoundryPresetBtn"),
  singleRowBtn: $("#singleRowBtn"),
  exportSheetBtn: $("#exportSheetBtn"),
  exportJsonBtn: $("#exportJsonBtn"),
  rowCountInput: $("#rowCountInput"),
  slotCountInput: $("#slotCountInput"),
  fpsInput: $("#fpsInput"),
  zoomInput: $("#zoomInput"),
  ghostToggle: $("#ghostToggle"),
  gridToggle: $("#gridToggle"),
  rowList: $("#rowList"),
  stageCanvas: $("#stageCanvas"),
  previewCanvas: $("#previewCanvas"),
  timeline: $("#timeline"),
  playBtn: $("#playBtn"),
  pauseBtn: $("#pauseBtn"),
  prevFrameBtn: $("#prevFrameBtn"),
  nextFrameBtn: $("#nextFrameBtn"),
  rowNameInput: $("#rowNameInput"),
  frameCountInput: $("#frameCountInput"),
  frameIndexInput: $("#frameIndexInput"),
  offsetXInput: $("#offsetXInput"),
  offsetYInput: $("#offsetYInput"),
  nudgeUpBtn: $("#nudgeUpBtn"),
  nudgeLeftBtn: $("#nudgeLeftBtn"),
  nudgeDownBtn: $("#nudgeDownBtn"),
  nudgeRightBtn: $("#nudgeRightBtn"),
  resetFrameBtn: $("#resetFrameBtn"),
  resetRowBtn: $("#resetRowBtn"),
  sheetSize: $("#sheetSize"),
  cellSize: $("#cellSize"),
  warningCount: $("#warningCount"),
  agentPetNameInput: $("#agentPetNameInput"),
  agentDescriptionInput: $("#agentDescriptionInput"),
  agentNotesInput: $("#agentNotesInput"),
  agentGenerateBtn: $("#agentGenerateBtn"),
  agentRunDirInput: $("#agentRunDirInput"),
  agentLoadRunBtn: $("#agentLoadRunBtn"),
  agentFinalizeRunBtn: $("#agentFinalizeRunBtn"),
  agentStatus: $("#agentStatus"),
  selectedAction: $("#selectedAction"),
  selectedFrame: $("#selectedFrame"),
  selectedOffset: $("#selectedOffset"),
  selectedRect: $("#selectedRect"),
};

const PET_FOUNDRY_ROWS = [
  { id: "idle", name: "idle", frameCount: 6 },
  { id: "running-right", name: "running-right", frameCount: 8 },
  { id: "running-left", name: "running-left", frameCount: 8 },
  { id: "waving", name: "waving", frameCount: 4 },
  { id: "jumping", name: "jumping", frameCount: 5 },
  { id: "failed", name: "failed", frameCount: 8 },
  { id: "waiting", name: "waiting", frameCount: 6 },
  { id: "running", name: "running", frameCount: 6 },
  { id: "review", name: "review", frameCount: 6 },
];

const queryParams = new URLSearchParams(window.location.search);
const BRIDGE_API_BASE = queryParams.has("api")
  ? queryParams.get("api") || window.location.origin
  : "";
const BRIDGE_API_TOKEN = queryParams.get("apiToken") || "";

const state = {
  image: null,
  imageName: "sample-sheet.png",
  sheet: { width: 768, height: 384 },
  rowCount: 3,
  slotCount: 8,
  rows: makeRows(3, 8, [
    { name: "Idle", frameCount: 6 },
    { name: "Run", frameCount: 8 },
    { name: "Jump", frameCount: 5 },
  ]),
  offsets: {},
  selectedRow: 0,
  selectedFrame: 0,
  playing: true,
  fps: 8,
  zoom: 3,
  showGhosts: true,
  showGrid: true,
  previewFrame: 0,
  lastTick: 0,
  drag: null,
};

function currentLayout() {
  return normalizeLayout({
    width: state.sheet.width,
    height: state.sheet.height,
    rowCount: state.rowCount,
    slotCount: state.slotCount,
  });
}

function currentRow() {
  return state.rows[state.selectedRow];
}

function currentOffset() {
  return getOffset(state.offsets, state.selectedRow, state.selectedFrame);
}

function clampSelection() {
  state.selectedRow = Math.max(0, Math.min(state.rows.length - 1, state.selectedRow));
  const frameCount = currentRow().frameCount;
  state.selectedFrame = Math.max(0, Math.min(frameCount - 1, state.selectedFrame));
  state.previewFrame = Math.max(0, Math.min(frameCount - 1, state.previewFrame));
}

function createSampleSheet() {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 384;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cellW = 96;
  const cellH = 128;
  const rowColors = ["#008d8b", "#d69b2d", "#d85f48"];
  const frameCounts = [6, 8, 5];
  for (let row = 0; row < 3; row += 1) {
    for (let frame = 0; frame < frameCounts[row]; frame += 1) {
      const x = frame * cellW;
      const y = row * cellH;
      const bob = Math.sin((frame / frameCounts[row]) * Math.PI * 2) * 8;
      ctx.save();
      ctx.translate(x + cellW / 2, y + cellH / 2 + bob);
      ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
      ctx.beginPath();
      ctx.ellipse(0, 39, 26, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rowColors[row];
      ctx.strokeStyle = "#24231f";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(-20, -12, 40, 46, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#f6d9a8";
      ctx.beginPath();
      ctx.arc(0, -30, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#24231f";
      ctx.fillRect(-8 + (frame % 2), -34, 4, 4);
      ctx.fillRect(7 + (frame % 2), -34, 4, 4);
      ctx.strokeStyle = "#24231f";
      ctx.beginPath();
      ctx.moveTo(-15, 26);
      ctx.lineTo(-27 + (frame % 3) * 4, 45);
      ctx.moveTo(15, 26);
      ctx.lineTo(29 - (frame % 3) * 4, 45);
      ctx.moveTo(-20, 5);
      ctx.lineTo(-37 + frame, 18);
      ctx.moveTo(20, 5);
      ctx.lineTo(40 - frame, 17);
      ctx.stroke();
      ctx.restore();
    }
  }
  const image = new Image();
  image.onload = () => {
    state.image = image;
    state.imageName = "sample-sheet.png";
    state.sheet = { width: image.naturalWidth, height: image.naturalHeight };
    state.rowCount = 3;
    state.slotCount = 8;
    state.rows = makeRows(3, 8, [
      { name: "Idle", frameCount: 6 },
      { name: "Run", frameCount: 8 },
      { name: "Jump", frameCount: 5 },
    ]);
    state.offsets = {};
    state.selectedRow = 0;
    state.selectedFrame = 0;
    syncInputs();
    render();
  };
  image.src = canvas.toDataURL("image/png");
}

function setSingleRowLayout() {
  state.rowCount = 1;
  state.slotCount = Math.max(1, currentRow().frameCount);
  state.rows = makeRows(1, state.slotCount, [{ name: currentRow().name || "Action", frameCount: state.slotCount }]);
  state.offsets = {};
  state.selectedRow = 0;
  state.selectedFrame = 0;
  syncInputs();
  render();
}

function applyPetFoundryPreset({ resetOffsets = true } = {}) {
  state.rowCount = PET_FOUNDRY_ROWS.length;
  state.slotCount = 8;
  state.rows = makeRows(state.rowCount, state.slotCount, PET_FOUNDRY_ROWS);
  if (resetOffsets) state.offsets = {};
  state.selectedRow = 0;
  state.selectedFrame = 0;
  state.previewFrame = 0;
  syncInputs();
  render();
}

function syncInputs() {
  const layout = currentLayout();
  const row = currentRow();
  const offset = currentOffset();
  els.sheetName.textContent = state.imageName;
  els.rowCountInput.value = state.rowCount;
  els.slotCountInput.value = state.slotCount;
  els.fpsInput.value = state.fps;
  els.zoomInput.value = state.zoom;
  els.ghostToggle.checked = state.showGhosts;
  els.gridToggle.checked = state.showGrid;
  els.rowNameInput.value = row.name;
  els.frameCountInput.max = state.slotCount;
  els.frameCountInput.value = row.frameCount;
  els.frameIndexInput.max = row.frameCount;
  els.frameIndexInput.value = state.selectedFrame + 1;
  els.offsetXInput.value = Math.round(offset.x);
  els.offsetYInput.value = Math.round(offset.y);
  els.sheetSize.textContent = `${state.sheet.width} x ${state.sheet.height}`;
  els.cellSize.textContent = `${round(layout.cellWidth)} x ${round(layout.cellHeight)}`;
  els.warningCount.textContent = String(layoutWarnings(layout).length);
}

function round(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function render() {
  if (!state.image) return;
  clampSelection();
  syncInputs();
  renderRows();
  renderStaticSurfaces();
}

function renderStaticSurfaces() {
  renderStage();
  renderPreview();
  renderTimeline();
  renderReadout();
}

function renderPlaybackSurfaces() {
  syncInputs();
  renderStage();
  renderPreview();
  renderReadout();
}

function selectRow(rowIndex, { preservePlayback = true } = {}) {
  const wasPlaying = state.playing;
  state.selectedRow = Math.max(0, Math.min(state.rows.length - 1, rowIndex));
  state.selectedFrame = Math.min(state.selectedFrame, currentRow().frameCount - 1);
  state.previewFrame = state.selectedFrame;
  if (preservePlayback && wasPlaying) {
    state.playing = true;
    els.playBtn.classList.add("active");
    els.pauseBtn.classList.remove("active");
  }
  render();
}

function handleRowListActivation(event) {
  if (event.target.closest("input")) return;
  const item = event.target.closest(".row-item");
  if (!item) return;
  event.preventDefault();
  selectRow(Number(item.dataset.rowIndex || 0));
}

function renderRows() {
  els.rowList.replaceChildren();
  state.rows.forEach((row, rowIndex) => {
    const item = document.createElement("div");
    item.className = `row-item${rowIndex === state.selectedRow ? " active" : ""}`;
    item.dataset.rowIndex = String(rowIndex);
    const button = document.createElement("button");
    button.type = "button";
    button.innerHTML = `<strong>${escapeHtml(row.name)}</strong><small>${row.frameCount} 帧</small>`;
    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.max = String(state.slotCount);
    input.value = row.frameCount;
    input.addEventListener("change", () => {
      selectRow(rowIndex, { preservePlayback: false });
      row.frameCount = boundedNumber(input.value, 1, state.slotCount);
      state.selectedFrame = Math.min(state.selectedFrame, row.frameCount - 1);
      state.previewFrame = state.selectedFrame;
      render();
    });
    item.append(button, input);
    els.rowList.append(item);
  });
}

function renderStage() {
  const canvas = els.stageCanvas;
  const ctx = setupCanvas(canvas);
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const center = { x: width / 2, y: height / 2 };
  ctx.clearRect(0, 0, width, height);
  drawStageBackground(ctx, width, height, center);

  const row = currentRow();
  if (state.showGhosts) {
    for (let frame = 0; frame < row.frameCount; frame += 1) {
      if (frame === state.selectedFrame) continue;
      const distance = Math.abs(frame - state.selectedFrame);
      drawFrame(ctx, state.selectedRow, frame, center, state.zoom, Math.max(0.08, 0.24 - distance * 0.025), true);
    }
  }
  drawFrame(ctx, state.selectedRow, state.selectedFrame, center, state.zoom, 1, false);
  drawAxes(ctx, width, height, center, state.zoom);
}

function drawStageBackground(ctx, width, height, center) {
  ctx.fillStyle = "#fffaf0";
  ctx.fillRect(0, 0, width, height);
  if (!state.showGrid) return;
  ctx.save();
  ctx.strokeStyle = "rgba(36, 35, 31, 0.08)";
  ctx.lineWidth = 1;
  const step = 16 * state.zoom;
  for (let x = center.x % step; x < width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = center.y % step; y < height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawAxes(ctx, width, height, center, zoom) {
  ctx.save();
  ctx.strokeStyle = "rgba(0, 141, 139, 0.86)";
  ctx.fillStyle = "#006665";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, center.y);
  ctx.lineTo(width, center.y);
  ctx.moveTo(center.x, 0);
  ctx.lineTo(center.x, height);
  ctx.stroke();
  ctx.font = "11px JetBrains Mono, SFMono-Regular, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let value = -160; value <= 160; value += 16) {
    const x = center.x + value * zoom;
    if (x >= 0 && x <= width) {
      ctx.beginPath();
      ctx.moveTo(x, center.y - 5);
      ctx.lineTo(x, center.y + 5);
      ctx.stroke();
      if (value % 32 === 0) ctx.fillText(String(value), x, 8);
    }
    const y = center.y + value * zoom;
    if (y >= 0 && y <= height) {
      ctx.beginPath();
      ctx.moveTo(center.x - 5, y);
      ctx.lineTo(center.x + 5, y);
      ctx.stroke();
      if (value % 32 === 0 && value !== 0) ctx.fillText(String(value), 22, y + 3);
    }
  }
  ctx.restore();
}

function drawFrame(ctx, rowIndex, frameIndex, center, zoom, alpha, ghost) {
  const layout = currentLayout();
  const source = getFrameRect(layout, rowIndex, frameIndex);
  const offset = getOffset(state.offsets, rowIndex, frameIndex);
  const destW = source.width * zoom;
  const destH = source.height * zoom;
  const x = center.x - destW / 2 + offset.x * zoom;
  const y = center.y - destH / 2 + offset.y * zoom;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = false;
  if (ghost) {
    ctx.filter = "saturate(0.7) opacity(0.9)";
  }
  ctx.drawImage(state.image, source.x, source.y, source.width, source.height, x, y, destW, destH);
  ctx.restore();
}

function renderPreview() {
  const canvas = els.previewCanvas;
  const ctx = setupCanvas(canvas);
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.fillStyle = "#fffaf0";
  ctx.fillRect(0, 0, rect.width, rect.height);
  const layout = currentLayout();
  const frameRect = getFrameRect(layout, state.selectedRow, state.previewFrame);
  const scale = Math.min((rect.width - 36) / frameRect.width, (rect.height - 36) / frameRect.height);
  drawFrame(ctx, state.selectedRow, state.previewFrame, { x: rect.width / 2, y: rect.height / 2 }, scale, 1, false);
}

function renderTimeline() {
  els.timeline.replaceChildren();
  const row = currentRow();
  const layout = currentLayout();
  for (let frame = 0; frame < row.frameCount; frame += 1) {
    const tile = document.createElement("button");
    tile.className = `frame-tile${frame === state.selectedFrame ? " active" : ""}`;
    tile.type = "button";
    const canvas = document.createElement("canvas");
    canvas.width = 80;
    canvas.height = 80;
    const ctx = canvas.getContext("2d");
    const source = getFrameRect(layout, state.selectedRow, frame);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 80, 80);
    const scale = Math.min(64 / source.width, 64 / source.height);
    const offset = getOffset(state.offsets, state.selectedRow, frame);
    ctx.drawImage(
      state.image,
      source.x,
      source.y,
      source.width,
      source.height,
      40 - (source.width * scale) / 2 + offset.x * scale,
      40 - (source.height * scale) / 2 + offset.y * scale,
      source.width * scale,
      source.height * scale,
    );
    const label = document.createElement("span");
    label.textContent = String(frame + 1).padStart(2, "0");
    tile.append(canvas, label);
    tile.addEventListener("click", () => {
      state.selectedFrame = frame;
      state.previewFrame = frame;
      render();
    });
    els.timeline.append(tile);
  }
}

function renderReadout() {
  const layout = currentLayout();
  const rect = getFrameRect(layout, state.selectedRow, state.selectedFrame);
  const row = currentRow();
  const offset = currentOffset();
  els.selectedAction.textContent = row.name;
  els.selectedFrame.textContent = `${state.selectedFrame + 1} / ${row.frameCount}`;
  els.selectedOffset.textContent = `${round(offset.x)}, ${round(offset.y)}`;
  els.selectedRect.textContent = `${round(rect.x)}, ${round(rect.y)}, ${round(rect.width)}, ${round(rect.height)}`;
}

function setupCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * scale));
  const height = Math.max(1, Math.round(rect.height * scale));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  return ctx;
}

function boundedNumber(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function updateLayoutFromInputs() {
  state.rowCount = boundedNumber(els.rowCountInput.value, 1, 32);
  state.slotCount = boundedNumber(els.slotCountInput.value, 1, 32);
  state.rows = makeRows(state.rowCount, state.slotCount, state.rows);
  state.selectedRow = Math.min(state.selectedRow, state.rowCount - 1);
  state.selectedFrame = Math.min(state.selectedFrame, currentRow().frameCount - 1);
  render();
}

function updateSelectedRowFromInspector() {
  const row = currentRow();
  row.name = els.rowNameInput.value.trim() || row.name;
  row.frameCount = boundedNumber(els.frameCountInput.value, 1, state.slotCount);
  state.selectedFrame = Math.min(state.selectedFrame, row.frameCount - 1);
  render();
}

function updateCurrentOffset(x, y) {
  state.offsets = setOffset(state.offsets, state.selectedRow, state.selectedFrame, { x, y });
  render();
}

function nudgeCurrent(dx, dy) {
  const offset = currentOffset();
  updateCurrentOffset(offset.x + dx, offset.y + dy);
}

function loadImageUrl(url, imageName = url.split("/").pop() || "spritesheet") {
  const image = new Image();
  image.onload = () => {
    state.image = image;
    state.imageName = imageName;
    state.sheet = { width: image.naturalWidth, height: image.naturalHeight };
    const looksLikePetFoundrySheet = image.naturalWidth === 1536 && image.naturalHeight === 1872;
    if (looksLikePetFoundrySheet) {
      applyPetFoundryPreset();
    } else {
      state.rowCount = 1;
      state.slotCount = Math.max(1, Math.min(12, Math.round(image.naturalWidth / Math.max(1, image.naturalHeight))));
      state.rows = makeRows(state.rowCount, state.slotCount, [{ name: "Action", frameCount: state.slotCount }]);
      state.offsets = {};
      state.selectedRow = 0;
      state.selectedFrame = 0;
      state.previewFrame = 0;
      syncInputs();
      render();
    }
  };
  image.onerror = () => window.alert(`无法加载 Sheet URL：${url}`);
  image.src = url;
}

function loadImageFile(file) {
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(image.src);
    state.image = image;
    state.imageName = file.name;
    state.sheet = { width: image.naturalWidth, height: image.naturalHeight };
    const looksLikePetFoundrySheet = image.naturalWidth === 1536 && image.naturalHeight === 1872;
    if (looksLikePetFoundrySheet) {
      applyPetFoundryPreset();
    } else {
      state.rowCount = 1;
      state.slotCount = Math.max(1, Math.min(12, Math.round(image.naturalWidth / Math.max(1, image.naturalHeight))));
      state.rows = makeRows(state.rowCount, state.slotCount, [{ name: "Action", frameCount: state.slotCount }]);
      state.offsets = {};
      state.selectedRow = 0;
      state.selectedFrame = 0;
      syncInputs();
      render();
    }
  };
  image.src = URL.createObjectURL(file);
}

function importAlignmentText(text, { confirmMismatch = true } = {}) {
  const alignment = parseAlignment(text);
  if (confirmMismatch && state.image && (alignment.layout.width !== state.sheet.width || alignment.layout.height !== state.sheet.height)) {
    const proceed = window.confirm(
      `Alignment layout ${alignment.layout.width} x ${alignment.layout.height} does not match current sheet ${state.sheet.width} x ${state.sheet.height}. Import anyway?`,
    );
    if (!proceed) return false;
  }
  state.imageName = alignment.sheetName || state.imageName;
  state.rowCount = alignment.layout.rowCount;
  state.slotCount = alignment.layout.slotCount;
  state.rows = alignment.rows;
  state.offsets = alignment.offsets;
  state.selectedRow = 0;
  state.selectedFrame = 0;
  state.previewFrame = 0;
  syncInputs();
  render();
  return true;
}

async function importAlignmentUrl(url) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    importAlignmentText(await response.text(), { confirmMismatch: false });
  } catch (error) {
    window.alert(`无法导入远程对齐 JSON：${error.message}`);
  }
}

function importJsonFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      importAlignmentText(String(reader.result || ""));
    } catch (error) {
      window.alert(`无法导入对齐 JSON：${error.message}`);
    } finally {
      els.jsonInput.value = "";
    }
  };
  reader.readAsText(file);
}

function composeSheetCanvas() {
  const output = document.createElement("canvas");
  output.width = state.sheet.width;
  output.height = state.sheet.height;
  const ctx = output.getContext("2d");
  ctx.clearRect(0, 0, output.width, output.height);
  ctx.imageSmoothingEnabled = false;
  const layout = currentLayout();
  for (const item of buildExportPlan(layout, state.rows, state.offsets)) {
    ctx.drawImage(
      state.image,
      item.source.x,
      item.source.y,
      item.source.width,
      item.source.height,
      item.destination.x,
      item.destination.y,
      item.destination.width,
      item.destination.height,
    );
  }
  return output;
}

function downloadUrl(url, filename) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
}

function exportPng() {
  const canvas = composeSheetCanvas();
  downloadUrl(canvas.toDataURL("image/png"), state.imageName.replace(/\.[^.]+$/, "") + "-aligned.png");
}

function exportJson() {
  const text = serializeAlignment({
    sheetName: state.imageName,
    layout: currentLayout(),
    rows: state.rows,
    offsets: state.offsets,
  });
  const blob = new Blob([text], { type: "application/json" });
  downloadUrl(URL.createObjectURL(blob), state.imageName.replace(/\.[^.]+$/, "") + "-alignment.json");
}

function setAgentStatus(message, tone = "") {
  els.agentStatus.textContent = message;
  els.agentStatus.dataset.tone = tone;
}

function slugifyPetName(value) {
  const ascii = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return ascii || "自动生成";
}

function syncRunDirPreview() {
  const petName = els.agentPetNameInput.value.trim();
  if (!els.agentRunDirInput.value.trim() || els.agentRunDirInput.dataset.autofilled === "true") {
    els.agentRunDirInput.value = petName ? `runs/${slugifyPetName(petName)}` : "";
    els.agentRunDirInput.dataset.autofilled = "true";
  }
}

async function agentRequest(path, options = {}) {
  if (!BRIDGE_API_BASE) {
    throw new Error("Agent 生成桥未启用。请先启动 scripts/sprite_lab_agent_server.py，然后打开它打印的 URL，或在分享链接后添加 ?api=...");
  }
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (BRIDGE_API_TOKEN) headers["X-Sprite-Lab-Token"] = BRIDGE_API_TOKEN;
  const response = await fetch(`${BRIDGE_API_BASE}${path}`, {
    headers,
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `${response.status} ${response.statusText}`);
  }
  return data;
}

function bridgeAssetUrl(url) {
  if (!url || !BRIDGE_API_BASE || !url.startsWith("/")) return url;
  return new URL(url, BRIDGE_API_BASE).href;
}

async function agentLoadRun({ finalize = false } = {}) {
  const runDir = els.agentRunDirInput.value.trim();
  if (!runDir) {
    setAgentStatus("请先填写运行目录，例如 runs/<pet>。", "error");
    return;
  }
  const action = finalize ? "正在 finalize" : "正在加载";
  setAgentStatus(`${action} ${runDir}...`, "busy");
  try {
    const data = await agentRequest(finalize ? "/api/finalize-and-load" : "/api/load-run", {
      method: "POST",
      body: JSON.stringify({ runDir }),
    });
    loadImageUrl(bridgeAssetUrl(data.sheetUrl), data.name || "spritesheet.webp");
    if (data.alignmentUrl) importAlignmentUrl(bridgeAssetUrl(data.alignmentUrl));
    setAgentStatus(`已加载 ${data.sheetPath}`, "ok");
  } catch (error) {
    setAgentStatus(error.message, "error");
  }
}

function setAgentBusy(busy) {
  els.agentGenerateBtn.disabled = busy;
  els.agentLoadRunBtn.disabled = busy;
  els.agentFinalizeRunBtn.disabled = busy;
}

async function pollGenerationJob(jobId) {
  setAgentBusy(true);
  try {
    for (;;) {
      const data = await agentRequest(`/api/jobs/${encodeURIComponent(jobId)}`);
      if (data.agentCommand && data.status === "submitted") {
        console.info("Sprite Lab agent command:", data.agentCommand);
      }
      setAgentStatus(data.message || data.status || "正在处理...", data.status === "failed" ? "error" : "busy");
      if (data.status === "done") {
        if (data.runDir) els.agentRunDirInput.value = data.runDir;
        loadImageUrl(bridgeAssetUrl(data.sheetUrl || data.assets?.spritesheet), data.name || "spritesheet.webp");
        setAgentStatus(`生成完成，已加载 ${data.sheetPath || data.sheetUrl || "spritesheet"}`, "ok");
        return;
      }
      if (data.status === "failed") {
        setAgentStatus(data.error || "生成失败", "error");
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
  } finally {
    setAgentBusy(false);
  }
}

async function agentGenerateSheet() {
  const petName = els.agentPetNameInput.value.trim();
  const description = els.agentDescriptionInput.value.trim();
  const notes = els.agentNotesInput.value.trim() || "保持角色身份一致；轮廓清晰；像素风邻近；动作可读；透明背景；不要文字、UI、场景背景。";
  if (!petName || !description) {
    setAgentStatus("请填写角色名称和角色描述。", "error");
    return;
  }
  setAgentStatus("正在启动生成任务...", "busy");
  try {
    const data = await agentRequest("/api/generate-pet", {
      method: "POST",
      body: JSON.stringify({ petName, description, notes }),
    });
    if (data.agentCommand) {
      console.info("Sprite Lab agent command:", data.agentCommand);
      setAgentStatus(`请求已提交。请让 Cohub agent 执行：${data.agentCommand}`, "busy");
    }
    pollGenerationJob(data.jobId);
  } catch (error) {
    setAgentStatus(error.message, "error");
  }
}

async function probeAgentBridge() {
  if (!BRIDGE_API_BASE) return;
  try {
    const data = await agentRequest("/api/status");
    setAgentStatus(data.message || "Agent bridge connected.", "ok");
  } catch (error) {
    setAgentStatus(error.message, "error");
  }
}

function tick(now) {
  const row = currentRow();
  if (state.playing && now - state.lastTick > 1000 / state.fps) {
    state.previewFrame = (state.previewFrame + 1) % row.frameCount;
    state.selectedFrame = state.previewFrame;
    state.lastTick = now;
    renderPlaybackSurfaces();
  }
  requestAnimationFrame(tick);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

function bindEvents() {
  els.openSheetBtn.addEventListener("click", () => els.sheetInput.click());
  els.rowList.addEventListener("pointerdown", handleRowListActivation);
  els.rowList.addEventListener("click", handleRowListActivation);
  els.rowList.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") handleRowListActivation(event);
  });
  const syncPlayerLink = () => {
    const params = new URLSearchParams(window.location.search);
    const sheet = params.get("sheet") || DEFAULT_SHEET_URL;
    const api = params.get("api");
    const apiToken = params.get("apiToken");
    const q = new URLSearchParams();
    q.set("sheet", sheet);
    q.set("name", params.get("name") || DEFAULT_SHEET_NAME);
    if (api !== null) q.set("api", api);
    if (apiToken) q.set("apiToken", apiToken);
    els.playerLink.href = `./player.html?${q.toString()}`;
  };
  syncPlayerLink();
  els.importJsonBtn.addEventListener("click", () => els.jsonInput.click());
  els.sheetInput.addEventListener("change", () => {
    const file = els.sheetInput.files?.[0];
    if (file) loadImageFile(file);
  });
  els.jsonInput.addEventListener("change", () => {
    const file = els.jsonInput.files?.[0];
    if (file) importJsonFile(file);
  });
  els.sampleBtn.addEventListener("click", createSampleSheet);
  els.petFoundryPresetBtn.addEventListener("click", () => applyPetFoundryPreset());
  els.agentPetNameInput.addEventListener("input", syncRunDirPreview);
  els.agentRunDirInput.addEventListener("input", () => {
    els.agentRunDirInput.dataset.autofilled = "false";
  });
  els.agentGenerateBtn.addEventListener("click", agentGenerateSheet);
  els.agentLoadRunBtn.addEventListener("click", () => agentLoadRun());
  els.agentFinalizeRunBtn.addEventListener("click", () => agentLoadRun({ finalize: true }));
  els.singleRowBtn.addEventListener("click", setSingleRowLayout);
  els.rowCountInput.addEventListener("change", updateLayoutFromInputs);
  els.slotCountInput.addEventListener("change", updateLayoutFromInputs);
  els.fpsInput.addEventListener("change", () => {
    state.fps = boundedNumber(els.fpsInput.value, 1, 30);
    render();
  });
  els.zoomInput.addEventListener("input", () => {
    state.zoom = Number(els.zoomInput.value);
    renderStage();
  });
  els.ghostToggle.addEventListener("change", () => {
    state.showGhosts = els.ghostToggle.checked;
    renderStage();
  });
  els.gridToggle.addEventListener("change", () => {
    state.showGrid = els.gridToggle.checked;
    renderStage();
  });
  els.rowNameInput.addEventListener("change", updateSelectedRowFromInspector);
  els.frameCountInput.addEventListener("change", updateSelectedRowFromInspector);
  els.frameIndexInput.addEventListener("change", () => {
    const next = boundedNumber(els.frameIndexInput.value, 1, currentRow().frameCount) - 1;
    state.selectedFrame = next;
    state.previewFrame = next;
    state.playing = false;
    els.pauseBtn.classList.add("active");
    els.playBtn.classList.remove("active");
    render();
  });
  els.offsetXInput.addEventListener("change", () => updateCurrentOffset(Number(els.offsetXInput.value), currentOffset().y));
  els.offsetYInput.addEventListener("change", () => updateCurrentOffset(currentOffset().x, Number(els.offsetYInput.value)));
  const nudgeFromButton = (dx, dy) => (event) => nudgeCurrent(event.shiftKey ? dx * 8 : dx, event.shiftKey ? dy * 8 : dy);
  els.nudgeUpBtn.addEventListener("click", nudgeFromButton(0, -1));
  els.nudgeLeftBtn.addEventListener("click", nudgeFromButton(-1, 0));
  els.nudgeDownBtn.addEventListener("click", nudgeFromButton(0, 1));
  els.nudgeRightBtn.addEventListener("click", nudgeFromButton(1, 0));
  els.resetFrameBtn.addEventListener("click", () => updateCurrentOffset(0, 0));
  els.resetRowBtn.addEventListener("click", () => {
    state.offsets = resetRowOffsets(state.offsets, state.selectedRow, currentRow().frameCount);
    render();
  });
  els.prevFrameBtn.addEventListener("click", () => {
    state.selectedFrame = (state.selectedFrame + currentRow().frameCount - 1) % currentRow().frameCount;
    state.previewFrame = state.selectedFrame;
    render();
  });
  els.nextFrameBtn.addEventListener("click", () => {
    state.selectedFrame = (state.selectedFrame + 1) % currentRow().frameCount;
    state.previewFrame = state.selectedFrame;
    render();
  });
  els.playBtn.addEventListener("click", () => {
    state.playing = true;
    els.playBtn.classList.add("active");
    els.pauseBtn.classList.remove("active");
  });
  els.pauseBtn.addEventListener("click", () => {
    state.playing = false;
    els.pauseBtn.classList.add("active");
    els.playBtn.classList.remove("active");
  });
  els.exportSheetBtn.addEventListener("click", exportPng);
  els.exportJsonBtn.addEventListener("click", exportJson);
  els.stageCanvas.addEventListener("pointerdown", (event) => {
    els.stageCanvas.setPointerCapture(event.pointerId);
    state.drag = {
      x: event.clientX,
      y: event.clientY,
      offset: currentOffset(),
    };
  });
  els.stageCanvas.addEventListener("pointermove", (event) => {
    if (!state.drag) return;
    const dx = (event.clientX - state.drag.x) / state.zoom;
    const dy = (event.clientY - state.drag.y) / state.zoom;
    updateCurrentOffset(Math.round(state.drag.offset.x + dx), Math.round(state.drag.offset.y + dy));
  });
  els.stageCanvas.addEventListener("pointerup", () => {
    state.drag = null;
  });
  window.addEventListener("keydown", (event) => {
    if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
    const amount = event.shiftKey ? 8 : 1;
    if (event.key === "ArrowLeft") nudgeCurrent(-amount, 0);
    if (event.key === "ArrowRight") nudgeCurrent(amount, 0);
    if (event.key === "ArrowUp") nudgeCurrent(0, -amount);
    if (event.key === "ArrowDown") nudgeCurrent(0, amount);
  });
  window.addEventListener("resize", render);
}

function installTestHooks() {
  window.SpriteLab = {
    get ready() {
      return Boolean(state.image);
    },
    getState() {
      return {
        sheet: { ...state.sheet },
        rowCount: state.rowCount,
        slotCount: state.slotCount,
        rows: state.rows.map((row) => ({ ...row })),
        selectedRow: state.selectedRow,
        selectedFrame: state.selectedFrame,
        offsets: structuredClone(state.offsets),
      };
    },
    setLayout(rowCount, slotCount) {
      state.rowCount = rowCount;
      state.slotCount = slotCount;
      state.rows = makeRows(rowCount, slotCount, state.rows);
      state.selectedRow = 0;
      state.selectedFrame = 0;
      render();
    },
    selectRow,
    getSelectedRow() {
      return state.selectedRow;
    },
    setFrameCount(rowIndex, frameCount) {
      state.rows[rowIndex].frameCount = frameCount;
      render();
    },
    setOffset(rowIndex, frameIndex, x, y) {
      state.selectedRow = rowIndex;
      state.selectedFrame = frameIndex;
      state.offsets = setOffset(state.offsets, rowIndex, frameIndex, { x, y });
      render();
    },
    loadImageUrl,
    importAlignmentUrl,
    agentLoadRun,
    agentGenerateSheet,
    applyPetFoundryPreset,
    importAlignmentText(text) {
      return importAlignmentText(text, { confirmMismatch: false });
    },
    stageStats() {
      const ctx = els.stageCanvas.getContext("2d");
      const pixels = ctx.getImageData(0, 0, els.stageCanvas.width, els.stageCanvas.height).data;
      let varied = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index] < 245 || pixels[index + 1] < 245 || pixels[index + 2] < 235) varied += 1;
      }
      return { width: els.stageCanvas.width, height: els.stageCanvas.height, variedPixels: varied };
    },
    exportSheetDataURL() {
      return composeSheetCanvas().toDataURL("image/png");
    },
  };
}

bindEvents();
installTestHooks();

const params = queryParams;
const sheetUrl = params.get("sheet");
const alignmentUrl = params.get("alignment");
if (sheetUrl) {
  loadImageUrl(sheetUrl, params.get("name") || undefined);
  if (alignmentUrl) importAlignmentUrl(alignmentUrl);
} else {
  loadImageUrl(DEFAULT_SHEET_URL, DEFAULT_SHEET_NAME);
  if (alignmentUrl) importAlignmentUrl(alignmentUrl);
}
probeAgentBridge();
requestAnimationFrame(tick);
