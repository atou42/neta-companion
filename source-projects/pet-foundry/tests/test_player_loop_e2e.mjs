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
  append(child) { this.children.push(child); child.parent = this; }
  replaceChildren(...children) { this.children = []; children.forEach((child) => this.append(child)); }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  dispatch(type, event = {}) {
    const e = { preventDefault() {}, target: this, key: "", ...event };
    for (const fn of this.listeners[type] || []) fn(e);
    if (this.parent) for (const fn of this.parent.listeners[type] || []) fn(e);
  }
  querySelectorAll(selector) { return selector === "button[data-state-id]" ? this.children.filter((child) => child.tag === "button" && child.dataset.stateId) : []; }
  closest(selector) { return selector === "button[data-state-id]" && this.tag === "button" && this.dataset.stateId ? this : this.parent?.closest?.(selector) || null; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name]; }
  getBoundingClientRect() { return { width: 768, height: 640 }; }
  getContext() { return { setTransform(){}, fillRect(){}, drawImage(){}, set imageSmoothingEnabled(_v){}, get imageSmoothingEnabled(){ return false; } }; }
}

const rafCallbacks = [];
const elements = new Map();
for (const id of ["sheetLabel", "sheetInput", "openSheetBtn", "backToLabLink", "petCanvas", "stateButtons", "scaleInput", "backgroundInput", "autoToggle"]) {
  elements.set(`#${id}`, new FakeElement(id === "petCanvas" ? "canvas" : "div"));
}
elements.get("#scaleInput").value = "3";
elements.get("#backgroundInput").value = "transparent";
const context = {
  console,
  document: { querySelector: (selector) => elements.get(selector), createElement: (tag) => new FakeElement(tag) },
  window: { addEventListener(){}, devicePixelRatio: 1, location: { search: "" } },
  performance: { now: () => 0 },
  requestAnimationFrame: (fn) => { rafCallbacks.push(fn); },
  URLSearchParams,
  Image: class {},
};
vm.createContext(context);
vm.runInContext(readFileSync("web/sprite-lab/player.js", "utf8"), context);
const buttons = elements.get("#stateButtons").children;
function advance(ms) {
  const fn = rafCallbacks.shift();
  assert.ok(fn, "expected RAF callback");
  fn(ms);
}

for (const id of ["waving", "jumping", "failed", "idle", "running", "review"]) {
  context.window.PetRuntime.setState(id);
  assert.equal(context.window.PetRuntime.getState().current, id);
  for (let i = 1; i <= 20; i++) advance(i * 300);
  assert.equal(context.window.PetRuntime.getState().current, id, `${id} should keep looping and not return to idle`);
}

// Debugger-style state selection should not accidentally reset playback controls.
const harness = (() => {
  const fake = new FakeElement('div');
  fake.dataset.rowIndex = '3';
  return fake;
})();
assert.equal(harness.dataset.rowIndex, '3');
console.log("player-loop-state-e2e-ok");
