/* ============================================================
   ARTEMIS · Test harness
   Zero-dependency browser environment shim so the vanilla
   `(function (global) { ... })(window)` modules load and run
   under Node's built-in test runner. Provides deterministic
   fakes for the DOM, the Canvas 2D context, Web Audio, Image,
   localStorage, requestAnimationFrame and matchMedia.

   Usage:
     import { ARTEMIS, freshGame, dom, win, fireKey, resetStore } from "./harness.js";
   ============================================================ */
import path from "node:path";
import { pathToFileURL } from "node:url";

// ---- classList ------------------------------------------------------------
function makeClassList() {
  const set = new Set();
  return {
    add(...cs) { cs.forEach((c) => set.add(c)); },
    remove(...cs) { cs.forEach((c) => set.delete(c)); },
    toggle(c, force) {
      if (force === undefined) {
        if (set.has(c)) { set.delete(c); return false; }
        set.add(c); return true;
      }
      if (force) set.add(c); else set.delete(c);
      return !!force;
    },
    contains(c) { return set.has(c); },
    get size() { return set.size; },
    _set: set,
  };
}

function camel(s) { return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); }

// ---- Canvas 2D context mock ----------------------------------------------
function makeCtx() {
  const grad = { addColorStop() {} };
  const ctx = {
    // state props (assignable)
    fillStyle: "", strokeStyle: "", lineWidth: 1, lineCap: "", lineJoin: "",
    globalAlpha: 1, globalCompositeOperation: "", font: "", textAlign: "",
    textBaseline: "", shadowColor: "", shadowBlur: 0,
    // methods (no-ops)
    setTransform() {}, clearRect() {}, fillRect() {}, strokeRect() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {},
    arcTo() {}, ellipse() {}, rect() {}, fill() {}, stroke() {}, clip() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    setLineDash() {}, drawImage() {}, fillText() {}, strokeText() {},
    measureText() { return { width: 0 }; },
    createLinearGradient() { return grad; },
    createRadialGradient() { return grad; },
    createPattern() { return null; },
  };
  return ctx;
}

// ---- Element --------------------------------------------------------------
function makeEl(tag, opts) {
  opts = opts || {};
  const listeners = Object.create(null);
  const el = {
    tagName: (tag || "div").toUpperCase(),
    textContent: "",
    innerHTML: "",
    value: "",
    style: {},
    className: "",
    classList: makeClassList(),
    dataset: Object.assign(Object.create(null), opts.dataset || {}),
    children: [],
    _attrs: Object.create(null),
    _selectorMap: opts.selectorMap || Object.create(null),
    _w: opts.w, _h: opts.h,
    _ctx: null,
    parentElement: null,
    getAttribute(n) {
      if (n && n.indexOf("data-") === 0) {
        const k = camel(n.slice(5));
        if (k in el.dataset) return el.dataset[k];
      }
      return n in el._attrs ? el._attrs[n] : null;
    },
    setAttribute(n, v) {
      el._attrs[n] = String(v);
      if (n.indexOf("data-") === 0) el.dataset[camel(n.slice(5))] = String(v);
    },
    hasAttribute(n) { return n in el._attrs; },
    removeAttribute(n) { delete el._attrs[n]; },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener(type, fn) {
      const a = listeners[type]; if (!a) return;
      const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1);
    },
    dispatch(type, ev) {
      ev = ev || {};
      ev.type = ev.type || type;
      if (!ev.preventDefault) ev.preventDefault = () => {};
      ev.target = ev.target || el;
      (listeners[type] || []).slice().forEach((fn) => fn(ev));
    },
    click() { el.dispatch("click", { type: "click" }); },
    closest() {
      if (!el._closest) { el._closest = makeEl("div"); }
      return el._closest;
    },
    append(...kids) { kids.forEach((k) => { el.children.push(k); if (k) k.parentElement = el; }); },
    appendChild(k) { el.children.push(k); if (k) k.parentElement = el; return k; },
    querySelector(sel) { const m = el._selectorMap[sel]; return (m && m[0]) || null; },
    querySelectorAll(sel) { return el._selectorMap[sel] || []; },
    getContext() { if (!el._ctx) el._ctx = makeCtx(); return el._ctx; },
    getBoundingClientRect() { return { x: 0, y: 0, width: el.clientWidth, height: el.clientHeight, top: 0, left: 0 }; },
    get clientWidth() { return el._w == null ? 1280 : el._w; },
    get clientHeight() { return el._h == null ? 720 : el._h; },
    width: 0, height: 0,
    _listeners: listeners,
  };
  return el;
}

// ---- Document -------------------------------------------------------------
const ids = Object.create(null);
const docListeners = Object.create(null);

function reg(id, el) { ids[id] = el; return el; }

// Pre-build elements that are queried by selector (not just by id).
const toggles = ["sound", "predict", "graph", "trail"].map((t) =>
  makeEl("button", { dataset: { toggle: t } }));
const diffOpts = ["cadet", "commander", "ace"].map((d, i) => {
  const el = makeEl("button", { dataset: { diff: d } });
  if (d === "commander") el.classList.add("is-active");
  return el;
});
const touchButtons = ["ArrowLeft", "ArrowUp", "ArrowDown", "ArrowRight"].map((k) => {
  const el = makeEl("button"); el.setAttribute("data-key", k); return el;
});

const diffOptsContainer = makeEl("div", { selectorMap: { ".diff__opt": diffOpts } });
reg("diff-opts", diffOptsContainer);

// Canvas elements
reg("scene", makeEl("canvas", { w: 1280, h: 720 }));
reg("telemetry", makeEl("canvas", { w: 264, h: 122 }));

const documentObj = {
  _selectorMap: {
    "[data-key]": touchButtons,
    "#hud-toggles .toggle": toggles,
  },
  body: makeEl("body"),
  getElementById(id) {
    if (!ids[id]) reg(id, makeEl("div"));
    return ids[id];
  },
  querySelector(sel) { const m = documentObj._selectorMap[sel]; return (m && m[0]) || null; },
  querySelectorAll(sel) { return documentObj._selectorMap[sel] || []; },
  createElement(tag) { return makeEl(tag); },
  addEventListener(type, fn) { (docListeners[type] = docListeners[type] || []).push(fn); },
  removeEventListener(type, fn) {
    const a = docListeners[type]; if (!a) return;
    const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1);
  },
  _fire(type, ev) { (docListeners[type] || []).slice().forEach((fn) => fn(ev || { type })); },
};

// ---- Web Audio mock -------------------------------------------------------
function audioParam() {
  return {
    value: 0,
    setValueAtTime() {}, setTargetAtTime() {},
    exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {},
    cancelScheduledValues() {},
  };
}
function gainNode() { return { gain: audioParam(), connect() {}, disconnect() {} }; }
function oscNode() { return { type: "sine", frequency: audioParam(), connect() {}, start() {}, stop() {} }; }
function srcNode() { return { buffer: null, loop: false, connect() {}, start() {}, stop() {} }; }
function filterNode() { return { type: "lowpass", frequency: audioParam(), Q: audioParam(), connect() {} }; }

class AudioContextMock {
  constructor() {
    this.state = "running";
    this.currentTime = 0;
    this.sampleRate = 44100;
    this.destination = {};
  }
  resume() { this.state = "running"; return Promise.resolve(); }
  suspend() { this.state = "suspended"; return Promise.resolve(); }
  createGain() { return gainNode(); }
  createOscillator() { return oscNode(); }
  createBufferSource() { return srcNode(); }
  createBiquadFilter() { return filterNode(); }
  createBuffer(channels, length) {
    return { length, getChannelData() { return new Float32Array(length); } };
  }
}

// ---- localStorage mock ----------------------------------------------------
function makeLocalStorage() {
  const store = new Map();
  return {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); },
    clear() { store.clear(); },
    key(i) { return Array.from(store.keys())[i] ?? null; },
    get length() { return store.size; },
    _store: store,
  };
}

// ---- Image mock -----------------------------------------------------------
class ImageMock {
  constructor() { this.onload = null; this.onerror = null; this.crossOrigin = ""; this._src = ""; }
  set src(v) {
    this._src = v;
    // Simulate a failed network load so loadFirstImage falls back gracefully.
    queueMicrotask(() => { if (this.onerror) this.onerror(new Error("mock: no network")); });
  }
  get src() { return this._src; }
}

// ---- window ---------------------------------------------------------------
const winListeners = Object.create(null);
function unref(t) { if (t && typeof t.unref === "function") t.unref(); return t; }

const win = {
  document: documentObj,
  devicePixelRatio: 1,
  innerWidth: 1280,
  innerHeight: 720,
  AudioContext: AudioContextMock,
  webkitAudioContext: AudioContextMock,
  localStorage: makeLocalStorage(),
  matchMedia(q) {
    return { matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} };
  },
  addEventListener(type, fn) { (winListeners[type] = winListeners[type] || []).push(fn); },
  removeEventListener(type, fn) {
    const a = winListeners[type]; if (!a) return;
    const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1);
  },
  _fire(type, ev) { (winListeners[type] || []).slice().forEach((fn) => fn(ev || { type })); },
  // unref'd timers so pending audio cues never keep the test process alive
  setTimeout: (fn, ms, ...a) => unref(setTimeout(fn, ms, ...a)),
  setInterval: (fn, ms, ...a) => unref(setInterval(fn, ms, ...a)),
  clearTimeout: (t) => clearTimeout(t),
  clearInterval: (t) => clearInterval(t),
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
};

// ---- Install globals ------------------------------------------------------
globalThis.window = win;
globalThis.document = documentObj;
globalThis.requestAnimationFrame = () => 0;   // game loop is driven manually in tests
globalThis.cancelAnimationFrame = () => {};
globalThis.Image = ImageMock;
globalThis.navigator = globalThis.navigator || { userAgent: "node-test" };

// ---- Load the application modules in dependency order ---------------------
const JS = path.resolve(import.meta.dirname, "..", "js");
const ORDER = [
  "config.js", "utils.js", "storage.js", "audio.js", "terrain.js",
  "physics.js", "renderer.js", "telemetry.js", "hud.js", "input.js",
  "game.js", "main.js",
];
for (const f of ORDER) {
  await import(pathToFileURL(path.join(JS, f)).href);
}

export const ARTEMIS = win.ARTEMIS;

// ---- Test helpers ---------------------------------------------------------
export const dom = documentObj;
export { win };
export const els = { toggles, diffOpts, touchButtons };

export function freshGame() {
  return new ARTEMIS.Game(documentObj.getElementById("scene"));
}

export function fireKey(code, extra) {
  win._fire("keydown", Object.assign({ type: "keydown", code, repeat: false, preventDefault() {} }, extra));
}
export function fireKeyUp(code, extra) {
  win._fire("keyup", Object.assign({ type: "keyup", code, preventDefault() {} }, extra));
}
export function fireWindow(type, ev) { win._fire(type, ev); }
export function fireDOMContentLoaded() { documentObj._fire("DOMContentLoaded", { type: "DOMContentLoaded" }); }

export function resetStore() {
  win.localStorage.clear();
  if (ARTEMIS.Store) {
    ARTEMIS.Store._data = { settings: { sound: true, predict: true, graph: true, trail: true }, records: {} };
  }
}

export { makeCtx, makeEl, AudioContextMock };
