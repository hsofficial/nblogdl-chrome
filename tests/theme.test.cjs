"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../extension/theme.js"), "utf8");
const modes = ["system", "light", "dark"];
// One event-loop turn drains the controller's promise chains without wall-clock sleeps.
const settle = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function page({ dark = false, stored = {}, read, write } = {}) {
  const root = { dataset: {} };
  const status = { hidden: true, textContent: "" };
  const logs = [], gets = [], sets = [];
  const storage = { ...stored };
  const buttons = modes.map(mode => ({
    dataset: { colorModeValue: mode },
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(type, listener) {
      assert.equal(type, "click");
      this.click = listener;
    }
  }));
  let osChange, storageChange;
  const media = {
    matches: dark,
    addEventListener(type, listener) {
      assert.equal(type, "change");
      osChange = listener;
    }
  };
  vm.runInNewContext(source, {
    document: {
      documentElement: root,
      querySelectorAll(selector) {
        assert.equal(selector, "[data-color-mode-value]");
        return buttons;
      },
      getElementById(id) { assert.equal(id, "colorModeStatus"); return status; }
    },
    matchMedia(query) { assert.equal(query, "(prefers-color-scheme: dark)"); return media; },
    chrome: { storage: {
      local: {
        get(key) { gets.push(key); return read || Promise.resolve({ ...storage }); },
        async set(values) {
          // Copy into the host realm so assertions do not depend on VM prototypes.
          const update = { ...values };
          sets.push(update);
          if (write) await write(update);
          Object.assign(storage, update);
        }
      },
      onChanged: { addListener(listener) { storageChange = listener; } }
    } },
    console: {
      info: (...args) => logs.push(["info", ...args]),
      error: (...args) => logs.push(["error", ...args])
    }
  }, { filename: "extension/theme.js" });
  return {
    status, logs, gets, sets, storage,
    click(mode) { buttons.find(button => button.dataset.colorModeValue === mode).click(); },
    os(darkMode) { media.matches = darkMode; osChange({ matches: darkMode }); },
    changed(changes, area = "local") { storageChange(changes, area); },
    appearance(preference, effective) {
      assert.equal(root.dataset.colorPreference, preference);
      assert.equal(root.dataset.colorMode, effective);
      for (const button of buttons) {
        assert.equal(button.attributes["aria-pressed"], String(button.dataset.colorModeValue === preference));
      }
    }
  };
}

test("system default follows live OS changes without writing storage", async () => {
  for (const dark of [false, true]) {
    const ui = page({ dark });
    ui.appearance("system", dark ? "dark" : "light");
    await settle();
    ui.os(!dark);
    ui.appearance("system", dark ? "light" : "dark");
    ui.os(dark);
    ui.appearance("system", dark ? "dark" : "light");
    assert.deepEqual(ui.gets, ["uiColorMode"]);
    assert.deepEqual(ui.sets, []);
  }
});

test("manual light and dark persist only uiColorMode and ignore OS changes", async () => {
  const state = { folder: "photos", jobs: ["existing-job"] };
  const ui = page({ stored: { state } });
  await settle();
  for (const mode of ["dark", "light"]) {
    ui.click(mode);
    ui.appearance(mode, mode);
    ui.os(mode !== "dark");
    ui.appearance(mode, mode);
    await settle();
    assert.equal(ui.storage.uiColorMode, mode);
    assert.equal(ui.storage.state, state);
  }
  assert.deepEqual(ui.sets, [{ uiColorMode: "dark" }, { uiColorMode: "light" }]);
});

test("saved modes load and invalid saved values fall back to system", async () => {
  for (const value of [...modes, undefined, null, "sepia", 1, {}, "\uBE44\uBC00"]) {
    const ui = page({ dark: true, stored: { uiColorMode: value } });
    await settle();
    const preference = modes.includes(value) ? value : "system";
    ui.appearance(preference, preference === "system" ? "dark" : preference);
    assert.deepEqual(ui.sets, []);
    assert.deepEqual(ui.logs, [["info", "[theme] preference_loaded mode=" + preference]]);
  }
});

test("a stale initial read cannot overwrite a user click", async () => {
  const initial = deferred();
  const ui = page({ read: initial.promise });
  ui.click("dark");
  await settle();
  initial.resolve({ uiColorMode: "light" });
  await settle();
  ui.appearance("dark", "dark");
  assert.deepEqual(ui.sets, [{ uiColorMode: "dark" }]);
  assert.deepEqual(ui.logs, [["info", "[theme] preference_saved mode=dark"]]);
});

test("a stale initial read cannot overwrite an external storage event", async () => {
  const initial = deferred();
  const ui = page({ read: initial.promise });
  ui.changed({ uiColorMode: { newValue: "dark" } });
  initial.resolve({ uiColorMode: "light" });
  await settle();
  ui.appearance("dark", "dark");
  assert.deepEqual(ui.sets, []);
  assert.deepEqual(ui.logs, []);
});

test("cross-page storage events require local uiColorMode and validate values", async () => {
  const ui = page({ stored: { uiColorMode: "light" } });
  await settle();
  for (const area of ["sync", "session", ""]) {
    ui.changed({ uiColorMode: { newValue: "dark" } }, area);
    ui.appearance("light", "light");
  }
  ui.changed({ state: { newValue: { uiColorMode: "dark" } } });
  ui.changed(Object.create({ uiColorMode: { newValue: "dark" } }));
  ui.appearance("light", "light");
  ui.changed({ uiColorMode: { newValue: "dark" }, state: { newValue: {} } });
  ui.appearance("dark", "dark");
  ui.os(true);
  for (const change of [{ newValue: "invalid" }, { oldValue: "dark" }]) {
    ui.changed({ uiColorMode: change });
    ui.appearance("system", "dark");
  }
  ui.changed({ uiColorMode: { newValue: "light" } });
  ui.appearance("light", "light");
  assert.deepEqual(ui.sets, []);
});

test("fast clicks serialize writes and pending storage echoes cannot undo selection", async () => {
  const gates = [];
  const ui = page({ write() { const gate = deferred(); gates.push(gate); return gate.promise; } });
  await settle();
  for (const mode of ["dark", "light", "system"]) ui.click(mode);
  await settle();
  assert.deepEqual(ui.sets, [{ uiColorMode: "dark" }]);
  for (const [index, mode] of ["dark", "light", "system"].entries()) {
    ui.changed({ uiColorMode: { newValue: mode } });
    ui.appearance("system", "light");
    gates[index].resolve();
    await settle();
    assert.equal(ui.sets.length, Math.min(index + 2, 3));
  }
  assert.deepEqual(ui.sets, ["dark", "light", "system"].map(uiColorMode => ({ uiColorMode })));
  assert.equal(ui.storage.uiColorMode, "system");
  assert.deepEqual(ui.logs.slice(1), ["dark", "light", "system"].map(mode =>
    ["info", "[theme] preference_saved mode=" + mode]));
  // Once the queue drains, another page's genuine update must be accepted again.
  ui.changed({ uiColorMode: { newValue: "dark" } });
  ui.appearance("dark", "dark");
});

function assertFailure(ui) {
  assert.equal(ui.status.hidden, false);
  assert.match(ui.status.textContent, /\S/);
  assert.deepEqual(ui.logs.at(-1), ["error", "[theme] preference_storage_failed"]);
  for (const entry of ui.logs) for (const value of entry) assert.match(value, /^[\x00-\x7f]*$/);
}

test("initial read errors show status and a static ASCII log", async () => {
  const initial = deferred();
  const ui = page({ dark: true, read: initial.promise });
  initial.reject(new Error("private details \uBE44\uBC00"));
  await settle();
  ui.appearance("system", "dark");
  assertFailure(ui);
  assert.deepEqual(ui.sets, []);
});

test("failed writes report safely and leave the write queue usable", async () => {
  const failed = deferred(), next = deferred();
  const ui = page({ write: values => values.uiColorMode === "dark" ? failed.promise : next.promise });
  await settle();
  ui.click("dark");
  ui.click("light");
  await settle();
  failed.reject(new Error("private details \uBE44\uBC00"));
  await settle();
  ui.appearance("light", "light");
  assertFailure(ui);
  assert.deepEqual(ui.sets, [{ uiColorMode: "dark" }, { uiColorMode: "light" }]);
  next.resolve();
  await settle();
  assert.equal(ui.storage.uiColorMode, "light");
  assert.deepEqual(ui.logs.at(-1), ["info", "[theme] preference_saved mode=light"]);
  ui.click("system");
  assert.equal(ui.status.hidden, true);
  await settle();
  assert.equal(ui.storage.uiColorMode, "system");
});
