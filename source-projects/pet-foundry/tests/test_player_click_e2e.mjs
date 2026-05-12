import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

class FakeElement {
  constructor(tag = "div") {
    this.tag = tag;
    this.children = [];
    this.parent = null;
    this.listeners = {};
    this.dataset = {};
    this.className = "";
    this.textContent = "";
    this.value = "";
    this.checked = false;
    this.href = "";
    this.attributes = {};
    this.style = {};
    this.classList = {
      toggle: (name, active) => {
        const set = new Set(String(this.className || "").split(/\s+/).filter(Boolean));
        if (active) set.add(name);
        else set.delete(name);
        this.className = [...set].join(" ");
      },
      contains: (name) => String(this.className || "").split(/\s+/).includes(name),
    };
  }

  append(child) {
    this.children.push(child);
    child.parent = this;
  }

  replaceChildren(...children) {
    this.children = [];
    children.forEach((child) => this.append(child));
  }

  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }

  dispatch(type, event = {}) {
    const e = {
      preventDefaultCalled: false,
      preventDefault() { this.preventDefaultCalled = true; },
      target: this,
      key: "",
      ...event,
    };
    for (const fn of this.listeners[type] || []) fn(e);
    if (this.parent) {
      for (const fn of this.parent.listeners[type] || []) fn(e);
    }
    return e;
  }

  querySelectorAll(selector) {
    if (selector !== "button[data-state-id]") return [];
    return this.children.filter((child) => child.tag === "button" && child.dataset.stateId);
  }

  closest(selector) {
    if (selector === "button[data-state-id]" && this.tag === "button" && this.dataset.stateId) return this;
    return this.parent?.closest?.(selector) || null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name];
  }

  getBoundingClientRect() {
    return { width: 768, height: 640 };
  }

  getContext() {
    return {
      setTransform() {},
      fillRect() {},
      drawImage() {},
      set imageSmoothingEnabled(_value) {},
      get imageSmoothingEnabled() { return false; },
    };
  }
}

function createHarness() {
  const elements = new Map();
  for (const id of [
    "sheetLabel",
    "sheetInput",
    "openSheetBtn",
    "backToLabLink",
    "petCanvas",
    "stateButtons",
    "scaleInput",
    "backgroundInput",
    "autoToggle",
  ]) {
    elements.set(`#${id}`, new FakeElement(id === "petCanvas" ? "canvas" : "div"));
  }
  elements.get("#scaleInput").value = "3";
  elements.get("#backgroundInput").value = "transparent";

  const context = {
    console,
    document: {
      querySelector: (selector) => elements.get(selector),
      createElement: (tag) => new FakeElement(tag),
    },
    window: { addEventListener() {}, devicePixelRatio: 1, location: { search: "" } },
    performance: { now: () => 1000 },
    requestAnimationFrame() {},
    URLSearchParams,
    Image: class {},
  };
  vm.createContext(context);
  vm.runInContext(readFileSync("web/sprite-lab/player.js", "utf8"), context);
  return { context, elements, buttons: elements.get("#stateButtons").children };
}

function assertActive(buttons, expectedId) {
  const active = buttons.filter((button) => button.classList.contains("active"));
  assert.equal(active.length, 1, "应该始终只有一个 active 动作按钮");
  assert.equal(active[0].dataset.stateId, expectedId, `active 应该是 ${expectedId}`);
  for (const button of buttons) {
    assert.equal(button.getAttribute("aria-pressed"), button.dataset.stateId === expectedId ? "true" : "false");
  }
}

const { context, buttons } = createHarness();
assert.equal(buttons.length, 9, "应该渲染 9 个动作按钮");
assert.equal(context.window.PetRuntime.getState().current, "idle");
assertActive(buttons, "idle");

const originalButtons = [...buttons];

// Pointer/touch style: pointerdown must switch immediately on first tap.
for (const button of buttons) {
  button.dispatch("pointerdown");
  assert.equal(context.window.PetRuntime.getState().current, button.dataset.stateId);
  assertActive(buttons, button.dataset.stateId);
}

// Mouse style: click must also work, without needing a second click.
for (const button of [...buttons].reverse()) {
  button.dispatch("click");
  assert.equal(context.window.PetRuntime.getState().current, button.dataset.stateId);
  assertActive(buttons, button.dataset.stateId);
}

// Keyboard accessibility: Enter and Space both switch.
buttons[3].dispatch("keydown", { key: "Enter" });
assert.equal(context.window.PetRuntime.getState().current, buttons[3].dataset.stateId);
assertActive(buttons, buttons[3].dataset.stateId);
buttons[7].dispatch("keydown", { key: " " });
assert.equal(context.window.PetRuntime.getState().current, buttons[7].dataset.stateId);
assertActive(buttons, buttons[7].dataset.stateId);

// Rapid switching should be deterministic and should not recreate buttons.
const rapidOrder = [1, 4, 2, 8, 0, 7, 3, 6, 5, 0, 8, 1, 2, 3, 4, 5, 6, 7, 8];
for (const index of rapidOrder) {
  buttons[index].dispatch("pointerdown");
  assert.equal(context.window.PetRuntime.getState().current, buttons[index].dataset.stateId);
}
assertActive(buttons, buttons[rapidOrder.at(-1)].dataset.stateId);
assert.deepEqual([...buttons], originalButtons, "切换动作不应该重建按钮 DOM，否则真实点击会丢失/卡顿");

console.log("player-action-click-e2e-ok");
