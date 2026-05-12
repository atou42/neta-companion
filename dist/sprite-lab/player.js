const $ = (selector) => document.querySelector(selector);

const DEFAULT_SHEET_URL = "https://public.cohub.run/s/7f3cc256-aec1-4673-a01c-456c594424e7/pet-62b095ea-default/spritesheet.webp";
const DEFAULT_SHEET_NAME = "pet-62b095ea/spritesheet.webp";

const STATES = [
  { id: "idle", label: "待机", row: 0, frames: 6, durations: [280, 110, 110, 140, 140, 320] },
  { id: "running-right", label: "向右跑", row: 1, frames: 8, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
  { id: "running-left", label: "向左跑", row: 2, frames: 8, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
  { id: "waving", label: "挥手", row: 3, frames: 4, durations: [140, 140, 140, 280] },
  { id: "jumping", label: "跳跃", row: 4, frames: 5, durations: [140, 140, 140, 140, 280] },
  { id: "failed", label: "失败", row: 5, frames: 8, durations: [140, 140, 140, 140, 140, 140, 140, 240] },
  { id: "waiting", label: "等待", row: 6, frames: 6, durations: [200, 160, 160, 200, 160, 320] },
  { id: "running", label: "工作中", row: 7, frames: 6, durations: [130, 130, 130, 130, 130, 220] },
  { id: "review", label: "检查", row: 8, frames: 6, durations: [180, 140, 140, 180, 140, 300] },
];

const CELL_W = 192;
const CELL_H = 208;
const els = {
  sheetLabel: $("#sheetLabel"),
  sheetInput: $("#sheetInput"),
  openSheetBtn: $("#openSheetBtn"),
  backToLabLink: $("#backToLabLink"),
  canvas: $("#petCanvas"),
  stateButtons: $("#stateButtons"),
  scaleInput: $("#scaleInput"),
  backgroundInput: $("#backgroundInput"),
  autoToggle: $("#autoToggle"),
};

const state = {
  image: null,
  imageName: "spritesheet.webp",
  current: "idle",
  frame: 0,
  lastTick: 0,
  scale: 3,
  background: "transparent",
  auto: false,
  nextAutoAt: 0,
};

function currentState() {
  return STATES.find((item) => item.id === state.current) || STATES[0];
}

function setState(id, { reset = true } = {}) {
  const next = STATES.find((item) => item.id === id);
  if (!next) return;
  state.current = next.id;
  if (reset) state.frame = 0;
  state.lastTick = performance.now();
  updateButtons();
  render();
}

function updateButtons() {
  for (const button of els.stateButtons.querySelectorAll("button[data-state-id]")) {
    const active = button.dataset.stateId === state.current;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }
}

function renderButtons() {
  els.stateButtons.replaceChildren();
  for (const item of STATES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = item.id === state.current ? "active" : "";
    button.dataset.stateId = item.id;
    button.textContent = item.label;
    button.setAttribute("aria-pressed", item.id === state.current ? "true" : "false");
    els.stateButtons.append(button);
  }
}

function activateStateButton(event) {
  const button = event.target.closest("button[data-state-id]");
  if (!button) return;
  event.preventDefault();
  setState(button.dataset.stateId);
}


function setupCanvas() {
  const canvas = els.canvas;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  return { ctx, width: rect.width, height: rect.height };
}

function drawBackground(ctx, width, height) {
  if (state.background === "light") {
    ctx.fillStyle = "#fffaf0";
    ctx.fillRect(0, 0, width, height);
    return;
  }
  if (state.background === "dark") {
    ctx.fillStyle = "#24231f";
    ctx.fillRect(0, 0, width, height);
    return;
  }
  ctx.fillStyle = "#f2eadb";
  ctx.fillRect(0, 0, width, height);
  const size = 16;
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      ctx.fillStyle = (x / size + y / size) % 2 === 0 ? "#fffaf0" : "#e3dacb";
      ctx.fillRect(x, y, size, size);
    }
  }
}

function render() {
  const { ctx, width, height } = setupCanvas();
  drawBackground(ctx, width, height);
  if (!state.image) return;
  const item = currentState();
  const scale = state.scale;
  const drawW = CELL_W * scale;
  const drawH = CELL_H * scale;
  const x = (width - drawW) / 2;
  const y = (height - drawH) / 2;
  ctx.drawImage(
    state.image,
    state.frame * CELL_W,
    item.row * CELL_H,
    CELL_W,
    CELL_H,
    Math.round(x),
    Math.round(y),
    drawW,
    drawH,
  );
}

function chooseAutoState(now) {
  if (!state.auto || now < state.nextAutoAt) return;
  const candidates = ["idle", "waiting", "running", "review", "waving", "jumping"];
  const next = candidates[Math.floor(Math.random() * candidates.length)];
  setState(next);
  state.nextAutoAt = now + 3000 + Math.random() * 5000;
}

function tick(now) {
  const item = currentState();
  const duration = item.durations[state.frame] || 140;
  if (now - state.lastTick >= duration) {
    state.frame += 1;
    if (state.frame >= item.frames) {
      state.frame = 0;
    }
    state.lastTick = now;
    render();
  }
  chooseAutoState(now);
  requestAnimationFrame(tick);
}

function loadImageUrl(url, name = url.split("/").pop() || "spritesheet.webp") {
  const image = new Image();
  image.onload = () => {
    state.image = image;
    state.imageName = name;
    els.sheetLabel.textContent = `${name} · ${image.naturalWidth} x ${image.naturalHeight}`;
    render();
  };
  image.onerror = () => {
    els.sheetLabel.textContent = `加载失败：${url}`;
  };
  image.src = url;
}

function loadImageFile(file) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(url);
    state.image = image;
    state.imageName = file.name;
    els.sheetLabel.textContent = `${file.name} · ${image.naturalWidth} x ${image.naturalHeight}`;
    render();
  };
  image.src = url;
}

function init() {
  renderButtons();
  els.stateButtons.addEventListener("pointerdown", activateStateButton);
  els.stateButtons.addEventListener("click", activateStateButton);
  els.stateButtons.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") activateStateButton(event);
  });
  els.openSheetBtn.addEventListener("click", () => els.sheetInput.click());
  els.sheetInput.addEventListener("change", () => {
    const file = els.sheetInput.files?.[0];
    if (file) loadImageFile(file);
  });
  els.scaleInput.addEventListener("input", () => {
    state.scale = Number(els.scaleInput.value);
    render();
  });
  els.backgroundInput.addEventListener("change", () => {
    state.background = els.backgroundInput.value;
    render();
  });
  els.autoToggle.addEventListener("change", () => {
    state.auto = els.autoToggle.checked;
    state.nextAutoAt = performance.now() + 1000;
  });
  window.addEventListener("resize", render);
  const params = new URLSearchParams(window.location.search);
  const sheet = params.get("sheet") || DEFAULT_SHEET_URL;
  loadImageUrl(sheet, params.get("name") || DEFAULT_SHEET_NAME);
  const backParams = new URLSearchParams();
  if (sheet) backParams.set("sheet", sheet);
  const api = params.get("api");
  const apiToken = params.get("apiToken");
  if (api !== null) backParams.set("api", api);
  if (apiToken) backParams.set("apiToken", apiToken);
  if ([...backParams].length) els.backToLabLink.href = `./index.html?${backParams.toString()}`;
  requestAnimationFrame(tick);
  render();
}

window.PetRuntime = { setState, loadImageUrl, getState: () => ({ ...state }) };
init();
