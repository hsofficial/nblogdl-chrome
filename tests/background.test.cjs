"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const backgroundSource = fs.readFileSync(path.join(__dirname, "../extension/background.js"), "utf8");
const coreSource = fs.readFileSync(path.join(__dirname, "../extension/core.js"), "utf8");
const extensionSender = { url: "chrome-extension://test/popup.html" };
const imageRoot = "https://postfiles.pstatic.net/path/";

function copy(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function event() {
  const listeners = [];
  return {
    addListener(listener) { listeners.push(listener); },
    emit(...args) { return listeners.map(listener => listener(...args)); },
    get listener() {
      assert.equal(listeners.length, 1, "expected one registered listener");
      return listeners[0];
    }
  };
}

function storageArea(backing, writes, setHook) {
  return {
    async get(keys) {
      if (keys == null) return copy(backing);
      const result = {};
      if (typeof keys === "string") {
        if (Object.hasOwn(backing, keys)) result[keys] = copy(backing[keys]);
      } else if (Array.isArray(keys)) {
        for (const key of keys) if (Object.hasOwn(backing, key)) result[key] = copy(backing[key]);
      } else {
        for (const [key, fallback] of Object.entries(keys)) {
          result[key] = Object.hasOwn(backing, key) ? copy(backing[key]) : copy(fallback);
        }
      }
      return result;
    },
    async set(values) {
      // A rejected write must leave persisted data unchanged, as an actual
      // failed checkpoint would. Pass a copy so hooks cannot mutate SW state.
      if (setHook) await setHook(copy(values));
      for (const [key, value] of Object.entries(values)) backing[key] = copy(value);
      writes.push(copy(values));
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete backing[key];
    }
  };
}

function makeHarness(options = {}) {
  const local = options.local || {};
  const session = options.session || {};
  const downloadItems = options.downloadItems || new Map();
  const plans = [...(options.downloadPlans || [])];
  const localWrites = [];
  const sessionWrites = [];
  const downloadCalls = [];
  const cancelCalls = [];
  const removeFileCalls = [];
  const filenameSuggestions = [];
  const apiCalls = [];
  const alarmCalls = [];
  const logs = [];
  let nextDownloadId = 1;
  let nextJobId = 1;

  const events = {
    message: event(),
    downloadChanged: event(),
    determiningFilename: event(),
    alarm: event(),
    installed: event(),
    startup: event(),
    tabRemoved: event(),
    tabUpdated: event()
  };

  function determineFilename(item) {
    return new Promise((resolve, reject) => {
      let calls = 0;
      let firstArgs;
      let synchronous = true;
      const returned = events.determiningFilename.listener(copy(item), (...args) => {
        calls += 1;
        if (calls === 1) firstArgs = copy(args);
        setImmediate(() => {
          if (calls !== 1) reject(new Error(`suggest called ${calls} times`));
          else resolve({ returned, args: firstArgs, calls, synchronous });
        });
      });
      synchronous = false;
      // Chrome requires true only when suggest will run asynchronously. A
      // synchronous listener may return undefined or true.
      if (calls === 0) assert.equal(returned, true, "async filename listener must return true");
      else assert.ok(returned === undefined || returned === true, "invalid synchronous listener return");
      setImmediate(() => {
        if (!calls) reject(new Error("filename suggestion timed out"));
      });
    });
  }

  const chrome = {
    runtime: {
      id: "test",
      getURL(value = "") { return "chrome-extension://test/" + value; },
      onMessage: events.message,
      onInstalled: events.installed,
      onStartup: events.startup
    },
    storage: {
      local: storageArea(local, localWrites, options.localSetHook),
      session: storageArea(session, sessionWrites)
    },
    downloads: {
      onChanged: events.downloadChanged,
      onDeterminingFilename: events.determiningFilename,
      async download(request) {
        apiCalls.push({ operation: "download", url: request.url });
        downloadCalls.push(copy(request));
        const plan = plans.shift() || {};
        if (plan.reject) throw new Error("mock_download_rejected");
        const id = plan.id ?? nextDownloadId++;
        const item = {
          id,
          url: request.url,
          finalUrl: request.url,
          filename: request.filename,
          state: "in_progress",
          mime: "image/jpeg",
          byExtensionId: "test",
          startTime: new Date().toISOString(),
          ...copy(plan.item || {})
        };
        downloadItems.set(id, item);
        // Chrome waits for an asynchronous suggest callback before resolving
        // download(). This exposes lock inversions in the service worker.
        const suggestion = await determineFilename(item);
        filenameSuggestions.push({
          id, sourceFilename: request.filename, args: suggestion.args,
          latestFilename: suggestion.args[0]?.filename || request.filename
        });
        if (suggestion.args[0]?.filename) item.filename = suggestion.args[0].filename;
        if (plan.pending) return new Promise(() => {});
        return id;
      },
      async search(query) {
        if (options.searchHook) await options.searchHook(copy(query));
        if (Object.hasOwn(query, "id")) {
          const item = downloadItems.get(query.id);
          return item ? [copy(item)] : [];
        }
        let items = [...downloadItems.values()];
        if (query.url) items = items.filter(item => item.url === query.url);
        return copy(items.slice(0, query.limit || items.length));
      },
      async cancel(id) {
        cancelCalls.push(id);
        const item = downloadItems.get(id);
        // Chrome cannot cancel a download that has already completed. Preserve
        // the final native state to expose completion/cancellation races.
        if (!item || item.state !== "in_progress") throw new Error("mock_download_not_in_progress");
        Object.assign(item, { state: "interrupted", error: "USER_CANCELED" });
      },
      async removeFile(id) {
        removeFileCalls.push(id);
        apiCalls.push({ operation: "removeFile", id });
        if (options.removeFileHook) await options.removeFileHook(id);
        const item = downloadItems.get(id);
        if (!item || item.state !== "complete" || item.exists === false) throw new Error("mock_file_not_available");
        // removeFile removes the artifact but retains Chrome download history.
        item.exists = false;
        apiCalls.push({ operation: "removeFileComplete", id });
      }
    },
    alarms: {
      onAlarm: events.alarm,
      async create(name, details) { alarmCalls.push({ operation: "create", name, details: copy(details) }); },
      async clear(name) { alarmCalls.push({ operation: "clear", name }); return true; }
    },
    action: {
      async setBadgeText() {},
      async setBadgeBackgroundColor() {}
    },
    tabs: {
      onRemoved: events.tabRemoved,
      onUpdated: events.tabUpdated
    }
  };

  let context;
  context = vm.createContext({
    chrome,
    URL,
    crypto: { randomUUID() { return "job-" + nextJobId++; } },
    console: {
      log(...values) { logs.push(values.join(" ")); },
      error(...values) { logs.push(values.join(" ")); }
    },
    importScripts(name) {
      assert.equal(name, "core.js");
      vm.runInContext(coreSource, context, { filename: "extension/core.js" });
    }
  });
  vm.runInContext(backgroundSource, context, { filename: "extension/background.js" });

  return {
    local,
    session,
    downloadItems,
    downloadCalls,
    cancelCalls,
    removeFileCalls,
    filenameSuggestions,
    apiCalls,
    alarmCalls,
    localWrites,
    sessionWrites,
    logs,
    events,
    send(message, sender = extensionSender) {
      return new Promise(resolve => {
        const keepChannelOpen = events.message.listener(copy(message), copy(sender), resolve);
        assert.equal(keepChannelOpen, true);
      });
    },
    state() { return copy(local.state); },
    setDownload(id, changes) {
      const item = downloadItems.get(id);
      assert.ok(item, "download item must exist");
      Object.assign(item, copy(changes));
    },
    determineFilename(item) {
      return determineFilename(item);
    }
  };
}

function siteSender(overrides = {}) {
  return {
    tab: { id: 7 },
    url: "https://blog.naver.com/alice/123",
    frameId: 0,
    documentId: "doc-1",
    ...overrides
  };
}

function scan(count = 1) {
  return {
    post: { url: "https://blog.naver.com/alice/123" },
    title: "Test post",
    images: Array.from({ length: count }, (_, index) => ({
      src: imageRoot + "image-" + (index + 1) + ".jpg?type=w80",
      preview: imageRoot + "image-" + (index + 1) + ".jpg?type=w80",
      width: 1200,
      height: 800
    }))
  };
}

async function waitFor(predicate, label) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.fail("timed out waiting for " + label);
}

function taskStatuses(state) {
  return state.jobs.flatMap(job => job.tasks.map(task => task.status));
}

async function storeScan(h, count = 1, sender = siteSender()) {
  const response = await h.send({ type: "SITE_SCAN", scan: scan(count) }, sender);
  assert.equal(response.ok, true);
  return h.session[`scan:${sender.tab.id}`].scan;
}

async function startManual(h, count = 1, options = {}) {
  const storedScan = await storeScan(h, count, options.sender || siteSender());
  const response = await h.send({
    type: "DOWNLOAD",
    tabId: 7,
    postKey: storedScan.post.key,
    ids: options.ids || storedScan.images.map(image => image.id),
    ...(Object.hasOwn(options, "folder") ? { folder: options.folder } : {})
  });
  return { response, scan: storedScan };
}

test("SITE_SCAN stores initial and updated scans without starting work", async () => {
  const h = makeHarness();
  const initial = await h.send({ type: "SITE_SCAN", scan: scan() }, siteSender());

  assert.equal(initial.ok, true);
  assert.equal(initial.data.count, 1);
  assert.equal(h.downloadCalls.length, 0);
  assert.equal(h.session["scan:7"].scan.post.key, "alice_123");
  assert.equal(h.state().jobs.length, 0);

  const updated = await h.send({ type: "SITE_SCAN", scan: scan(2) }, siteSender());
  assert.equal(updated.ok, true);
  assert.equal(updated.data.count, 2);
  assert.equal(h.session["scan:7"].scan.images.length, 2);
  assert.equal(h.downloadCalls.length, 0);
  assert.equal(h.state().jobs.length, 0);
});

test("legacy saved autoDownload true cannot make SITE_SCAN start work", async () => {
  const h = makeHarness({
    local: { state: { settings: { autoDownload: true, quality: "original", folder: "Legacy" }, jobs: [], history: { old: 1 }, logs: [] } }
  });
  const stored = await storeScan(h);

  assert.equal(stored.post.key, "alice_123");
  assert.equal(h.downloadCalls.length, 0);
  assert.equal(h.state().jobs.length, 0);
  assert.deepEqual(h.state().settings, { folder: "Legacy" });
  assert.equal(Object.hasOwn(h.state(), "history"), false);
});

test("manual DOWNLOAD starts work and a native id is not completion", async () => {
  const h = makeHarness();
  const { response } = await startManual(h);

  assert.equal(response.ok, true);
  assert.equal(response.data.queued, 1);
  assert.equal(response.data.folder, "NaverBlog");
  assert.equal(typeof response.data.jobId, "string");
  assert.equal(h.downloadCalls.length, 1);
  assert.deepEqual(taskStatuses(h.state()), ["downloading"]);
  const id = h.state().jobs[0].tasks[0].downloadId;
  h.setDownload(id, { state: "complete", mime: "image/png", fileSize: 321 });
  h.events.downloadChanged.emit({ id, state: { current: "complete" } });
  const view = await h.send({ type: "GET_VIEW", tabId: 7 });

  assert.equal(view.ok, true);
  assert.deepEqual(taskStatuses(h.state()), ["complete"]);
  assert.equal(h.state().jobs[0].tasks[0].bytes, 321);
  assert.ok(h.logs.every(line => /^[\x00-\x7f]*$/.test(line)));
});

test("a complete HTML response is removed before fallback", async () => {
  const h = makeHarness({
    downloadPlans: [
      { id: 10, item: { state: "complete", mime: "text/html", fileSize: 99 } },
      { id: 11 }
    ]
  });
  await startManual(h);

  assert.equal(h.downloadCalls.length, 1);
  assert.deepEqual(h.removeFileCalls, [10]);
  assert.equal(h.downloadItems.get(10).exists, false);
  assert.equal(h.state().jobs[0].tasks[0].status, "queued");
  assert.equal(h.state().jobs[0].tasks[0].error, "NON_IMAGE_RESPONSE");

  await h.send({ type: "GET_VIEW", tabId: 7 });
  assert.equal(h.downloadCalls.length, 2);
  assert.deepEqual(h.apiCalls.map(call => call.operation), ["download", "removeFile", "removeFileComplete", "download"]);
  assert.equal(h.state().jobs[0].tasks[0].attempt, 1);
  assert.equal(h.state().jobs[0].tasks[0].status, "downloading");

  h.setDownload(11, { state: "complete", mime: "image/webp", fileSize: 500 });
  h.events.downloadChanged.emit({ id: 11, state: { current: "complete" } });
  await h.send({ type: "GET_VIEW", tabId: 7 });
  assert.equal(h.state().jobs[0].tasks[0].status, "complete");
});

test("post-start search or checkpoint failure retains the issued native id", async t => {
  for (const failure of ["search", "storage checkpoint"]) {
    await t.test(failure, async () => {
      let injected = false;
      const h = makeHarness({
        downloadPlans: [{ id: 61 }],
        searchHook(query) {
          if (failure === "search" && !injected && query.id === 61) {
            injected = true;
            throw new Error("mock_search_failure_once");
          }
        },
        localSetHook(values) {
          // Fail only the first checkpoint after a native id was issued.
          // Earlier queued/starting checkpoints must actually persist.
          const hasIssuedId = values.state?.jobs?.some(job => job.tasks.some(task => task.downloadId === 61));
          if (failure === "storage checkpoint" && !injected && hasIssuedId) {
            injected = true;
            throw new Error("mock_checkpoint_failure_once");
          }
        }
      });
      await startManual(h);
      assert.equal(injected, true, "failure hook must be exercised");
      assert.equal(h.downloadCalls.length, 1);
      let task = h.state().jobs[0].tasks[0];
      assert.equal(task.downloadId, 61);
      assert.equal(task.status, "downloading");
      assert.equal(task.attempt, 0);

      // Exercise both popup reconciliation and the actual recovery listener.
      const view = await h.send({ type: "GET_VIEW", tabId: 7 });
      assert.equal(view.ok, true);
      h.events.alarm.emit({ name: "queue-recovery" });
      assert.equal((await h.send({ type: "GET_VIEW", tabId: 7 })).ok, true);
      assert.equal(h.downloadCalls.length, 1);

      const restarted = makeHarness({ local: h.local, session: h.session, downloadItems: h.downloadItems });
      assert.equal((await restarted.send({ type: "GET_VIEW", tabId: 7 })).ok, true);
      task = restarted.state().jobs[0].tasks[0];
      assert.equal(task.downloadId, 61);
      assert.equal(task.status, "downloading");
      assert.equal(task.attempt, 0);
      assert.equal(restarted.downloadCalls.length, 0);

      restarted.setDownload(61, { state: "complete", mime: "image/jpeg", fileSize: 125 });
      restarted.events.downloadChanged.emit({ id: 61, state: { current: "complete" } });
      await restarted.send({ type: "GET_VIEW", tabId: 7 });
      assert.equal(restarted.state().jobs[0].tasks[0].status, "complete");
      assert.equal(restarted.downloadCalls.length, 0);
    });
  }
});

test("HTML cleanup must finish before an event-driven fallback starts", async () => {
  let releaseRemoval;
  const removal = new Promise(resolve => { releaseRemoval = resolve; });
  const h = makeHarness({ removeFileHook() { return removal; }, downloadPlans: [{ id: 71 }, { id: 72 }] });
  await startManual(h);
  h.setDownload(71, { state: "complete", mime: "text/html", exists: true });
  h.events.downloadChanged.emit({ id: 71, state: { current: "complete" } });
  try {
    await waitFor(() => h.removeFileCalls.length === 1, "HTML cleanup request");
    assert.equal(h.downloadCalls.length, 1, "fallback must await file removal");
    assert.equal(h.downloadItems.get(71).exists, true);
  } finally {
    // Always release the fixture so a failing assertion leaves no blocked SW.
    releaseRemoval();
  }
  assert.equal((await h.send({ type: "GET_VIEW", tabId: 7 })).ok, true);
  assert.equal(h.downloadItems.get(71).exists, false);
  assert.equal(h.downloadCalls.length, 2);
  assert.deepEqual(h.apiCalls.map(call => call.operation), ["download", "removeFile", "removeFileComplete", "download"]);
  assert.deepEqual(h.removeFileCalls, [71]);
});

test("failed HTML removal is terminal and cannot spawn a fallback", async () => {
  const h = makeHarness({
    removeFileHook() { throw new Error("mock_remove_file_denied"); },
    downloadPlans: [{ id: 81, item: { state: "complete", mime: "text/html", exists: true } }]
  });
  await startManual(h);
  assert.deepEqual(h.removeFileCalls, [81]);
  assert.equal(h.state().jobs[0].tasks[0].status, "failed");
  assert.equal(h.downloadItems.get(81).exists, true);

  h.events.alarm.emit({ name: "queue-recovery" });
  await h.send({ type: "GET_VIEW", tabId: 7 });
  assert.equal(h.downloadCalls.length, 1);
  assert.deepEqual(h.removeFileCalls, [81]);
  assert.equal(h.state().jobs[0].tasks[0].status, "failed");
});

test("restart after HTML cleanup uses the next candidate without removing again", async () => {
  const first = makeHarness({ downloadPlans: [{ id: 101 }] });
  await startManual(first);
  assert.equal(first.state().jobs[0].tasks[0].status, "downloading");
  // Model native completion/removal surviving a stopped worker while storage
  // still contains the last checkpoint from before completion was processed.
  first.setDownload(101, { state: "complete", mime: "text/html", exists: false });
  const restarted = makeHarness({
    local: first.local,
    session: first.session,
    downloadItems: first.downloadItems,
    downloadPlans: [{ id: 102 }]
  });
  assert.equal((await restarted.send({ type: "GET_VIEW", tabId: 7 })).ok, true);
  const task = restarted.state().jobs[0].tasks[0];
  assert.deepEqual(restarted.removeFileCalls, []);
  assert.equal(restarted.downloadCalls.length, 1);
  assert.equal(task.attempt, 1);
  assert.equal(task.downloadId, 102);
  assert.equal(task.status, "downloading");
  assert.notEqual(restarted.downloadCalls[0].url, first.downloadCalls[0].url);

  restarted.setDownload(102, { state: "complete", mime: "image/jpeg", fileSize: 256 });
  restarted.events.downloadChanged.emit({ id: 102, state: { current: "complete" } });
  await restarted.send({ type: "GET_VIEW", tabId: 7 });
  assert.equal(restarted.state().jobs[0].tasks[0].status, "complete");
  assert.equal(restarted.downloadCalls.length, 1);
});

test("ambiguous MIME fails without deleting or downloading another candidate", async t => {
  for (const mime of [undefined, "", "application/octet-stream", "application/x-unknown"]) {
    await t.test(mime === undefined ? "missing MIME" : mime || "empty MIME", async () => {
      const h = makeHarness({ downloadPlans: [{ id: 91, item: { state: "complete", mime, exists: true } }] });
      await startManual(h);
      assert.equal(h.state().jobs[0].tasks[0].status, "failed");
      assert.equal(h.downloadCalls.length, 1);
      assert.deepEqual(h.removeFileCalls, []);
      assert.equal(h.downloadItems.get(91).exists, true);

      h.events.alarm.emit({ name: "queue-recovery" });
      await h.send({ type: "GET_VIEW", tabId: 7 });
      assert.equal(h.downloadCalls.length, 1);
      assert.deepEqual(h.removeFileCalls, []);
    });
  }
});

test("network and server interruptions use fallback candidates", async t => {
  for (const reason of ["NETWORK_FAILED", "SERVER_FAILED"]) {
    await t.test(reason, async () => {
      const h = makeHarness({ downloadPlans: [{ id: 20 }, { id: 21 }] });
      await startManual(h);
      h.setDownload(20, { state: "interrupted", error: reason });
      h.events.downloadChanged.emit({ id: 20, state: { current: "interrupted" } });
      await h.send({ type: "GET_VIEW", tabId: 7 });

      const task = h.state().jobs[0].tasks[0];
      assert.equal(h.downloadCalls.length, 2);
      assert.equal(task.attempt, 1);
      assert.equal(task.downloadId, 21);
      assert.equal(task.status, "downloading");
      assert.equal(h.filenameSuggestions.length, 2);
      assert.ok(h.filenameSuggestions.every(call => call.sourceFilename === task.filename));
      assert.ok(h.filenameSuggestions.every(call => call.latestFilename === task.filename));
    });
  }
});

test("user cancellation and file errors never use fallback candidates", async t => {
  for (const reason of ["USER_CANCELED", "FILE_NO_SPACE"]) {
    await t.test(reason, async () => {
      const h = makeHarness({ downloadPlans: [{ id: 30 }, { id: 31 }] });
      await startManual(h);
      h.setDownload(30, { state: "interrupted", error: reason });
      h.events.downloadChanged.emit({ id: 30, state: { current: "interrupted" } });
      await h.send({ type: "GET_VIEW", tabId: 7 });

      const task = h.state().jobs[0].tasks[0];
      assert.equal(h.downloadCalls.length, 1);
      assert.equal(task.status, "failed");
      assert.equal(task.error, reason);
    });
  }
});

test("simultaneous manual requests create only one active task per post image", async () => {
  const h = makeHarness();
  const stored = await storeScan(h);
  const message = { type: "DOWNLOAD", tabId: 7, postKey: stored.post.key, ids: stored.images.map(image => image.id) };
  const [first, second] = await Promise.all([
    h.send(message),
    h.send(message)
  ]);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(h.downloadCalls.length, 1);
  assert.equal(h.state().jobs.length, 1);
  assert.equal(h.state().jobs[0].tasks.length, 1);
});

test("manual download queues exactly the selected current image ids", async () => {
  const h = makeHarness();
  const stored = await storeScan(h, 2);
  const selected = stored.images[1].id;
  const response = await h.send({
    type: "DOWNLOAD",
    tabId: 7,
    postKey: "alice_123",
    ids: [selected]
  });

  assert.equal(response.ok, true);
  assert.equal(response.data.queued, 1);
  assert.equal(h.downloadCalls.length, 1);
  assert.equal(h.state().jobs[0].tasks[0].image.id, selected);
});

test("manual download rejects unknown or malformed selected ids atomically", async t => {
  const current = imageRoot + "image-1.jpg";
  const cases = [
    ["unknown only", ["https://postfiles.pstatic.net/path/unknown.jpg"]],
    ["mixed current and unknown", [current, "unknown"]],
    ["mixed current and non-string", [current, 42]]
  ];

  for (const [name, ids] of cases) {
    await t.test(name, async () => {
      const h = makeHarness();
      await storeScan(h, 2);

      const response = await h.send({ type: "DOWNLOAD", tabId: 7, postKey: "alice_123", ids });
      assert.equal(response.ok, false);
      assert.equal(response.error, "REQUEST_FAILED");
      assert.equal(h.downloadCalls.length, 0);
      assert.equal(h.state().jobs.length, 0);
    });
  }
});

test("queue starts at most three downloads and refills one slot", async () => {
  const h = makeHarness();
  await startManual(h, 5);

  assert.equal(h.downloadCalls.length, 3);
  assert.equal(taskStatuses(h.state()).filter(status => status === "downloading").length, 3);
  assert.equal(taskStatuses(h.state()).filter(status => status === "queued").length, 2);

  const completedId = h.state().jobs[0].tasks[0].downloadId;
  h.setDownload(completedId, { state: "complete", mime: "image/jpeg", fileSize: 10 });
  h.events.downloadChanged.emit({ id: completedId, state: { current: "complete" } });
  await h.send({ type: "GET_VIEW", tabId: 7 });

  assert.equal(h.downloadCalls.length, 4);
  assert.equal(taskStatuses(h.state()).filter(status => status === "downloading").length, 3);
  assert.equal(taskStatuses(h.state()).filter(status => status === "complete").length, 1);
  assert.equal(taskStatuses(h.state()).filter(status => status === "queued").length, 1);
});

test("cancel stops queued and in-progress work without starting fallback", async () => {
  const h = makeHarness();
  await startManual(h, 5);
  const before = h.state();
  const activeIds = before.jobs[0].tasks.map(task => task.downloadId).filter(id => id !== null);

  const response = await h.send({ type: "CANCEL", jobId: before.jobs[0].id });
  assert.equal(response.ok, true);
  assert.deepEqual(taskStatuses(h.state()), ["canceled", "canceled", "canceled", "canceled", "canceled"]);
  assert.deepEqual([...h.cancelCalls].sort((a, b) => a - b), [...activeIds].sort((a, b) => a - b));
  assert.equal(h.downloadCalls.length, 3);

  for (const id of activeIds) h.events.downloadChanged.emit({ id, state: { current: "interrupted" } });
  await h.send({ type: "GET_VIEW", tabId: 7 });
  assert.equal(h.downloadCalls.length, 3);
  assert.deepEqual(taskStatuses(h.state()), ["canceled", "canceled", "canceled", "canceled", "canceled"]);
});

test("schema v2 migration cancels legacy automatic active jobs before recovery", async () => {
  const source = scan();
  const imageId = imageRoot + "image-1.jpg";
  const local = {
    state: {
      settings: { autoDownload: true, quality: "original", folder: "Legacy" },
      history: { [`alice_123|${imageId}`]: 1 },
      logs: [],
      jobs: [{
        id: "legacy-auto", tabId: 7, documentId: "doc-1", automatic: true,
        post: { key: "alice_123", url: source.post.url }, title: source.title,
        createdAt: 1, folder: "Legacy", quality: "original",
        tasks: [{
          image: { id: imageId, src: source.images[0].src, preview: source.images[0].preview, width: 1200, height: 800, index: 1 },
          candidates: [imageId + "?type=w3840", imageId], attempt: 0,
          status: "downloading", downloadId: 88, error: "", bytes: 0
        }, {
          image: { id: imageRoot + "image-2.jpg", src: imageRoot + "image-2.jpg?type=w80", index: 2 },
          candidates: [imageRoot + "image-2.jpg?type=w3840", imageRoot + "image-2.jpg"], attempt: 0,
          status: "queued", downloadId: null, error: "", bytes: 0
        }]
      }]
    }
  };
  const downloadItems = new Map([[88, {
    id: 88, url: imageId, state: "in_progress", mime: "image/jpeg",
    byExtensionId: "test", startTime: new Date().toISOString()
  }]]);
  const h = makeHarness({ local, downloadItems });
  const view = await h.send({ type: "GET_VIEW", tabId: 7 });

  assert.equal(view.ok, true);
  assert.equal(h.state().schemaVersion, 2);
  assert.deepEqual(h.state().settings, { folder: "Legacy" });
  assert.equal(Object.hasOwn(h.state(), "history"), false);
  assert.deepEqual(h.state().jobs[0].tasks.map(task => task.status), ["canceled", "canceled"]);
  assert.ok(h.state().jobs[0].tasks.every(task => task.error === "USER_CANCELED"));
  assert.deepEqual(h.cancelCalls, [88]);
  assert.equal(h.downloadCalls.length, 0);
});

test("CANCEL after native image completion preserves completion before its event runs", async () => {
  const h = makeHarness();
  await startManual(h);
  const job = h.state().jobs[0];
  const id = job.tasks[0].downloadId;
  // No onChanged event: CANCEL must use native final state, not stale SW state.
  h.setDownload(id, { state: "complete", mime: "image/png", fileSize: 456, exists: true });
  const response = await h.send({ type: "CANCEL", jobId: job.id });
  assert.equal(response.ok, true);
  assert.equal(h.state().jobs[0].tasks[0].status, "complete");
  assert.equal(h.state().jobs[0].tasks[0].bytes, 456);
  assert.deepEqual(h.removeFileCalls, []);

  h.events.downloadChanged.emit({ id, state: { current: "complete" } });
  const rescanned = await h.send({ type: "SITE_SCAN", scan: scan() }, siteSender({ documentId: "doc-2" }));
  assert.equal(rescanned.ok, true);
  await h.send({ type: "GET_VIEW", tabId: 7 });
  assert.equal(h.downloadCalls.length, 1);
  assert.equal(h.state().jobs.length, 1);
  assert.equal(h.state().jobs[0].tasks[0].status, "complete");
});

test("SITE_CLEAR preserves another frame or document snapshot", async () => {
  const h = makeHarness();
  const owner = siteSender({ frameId: 5, documentId: "main-document" });
  await h.send({ type: "SITE_SCAN", scan: scan() }, owner);

  const parentClear = await h.send(
    { type: "SITE_CLEAR" },
    siteSender({ frameId: 0, documentId: "parent-document" })
  );
  assert.equal(parentClear.ok, true);
  let view = await h.send({ type: "GET_VIEW", tabId: 7 });
  assert.equal(view.data.scan.post.key, "alice_123");

  const staleDocumentClear = await h.send(
    { type: "SITE_CLEAR" },
    siteSender({ frameId: 5, documentId: "stale-document" })
  );
  assert.equal(staleDocumentClear.ok, true);
  view = await h.send({ type: "GET_VIEW", tabId: 7 });
  assert.equal(view.data.scan.post.key, "alice_123");

  const ownerClear = await h.send({ type: "SITE_CLEAR" }, owner);
  assert.equal(ownerClear.ok, true);
  view = await h.send({ type: "GET_VIEW", tabId: 7 });
  assert.equal(view.data.scan, null);
});

test("fresh worker recovers the dispatch gap using only its own download", async () => {
  const local = {};
  const session = {};
  const downloadItems = new Map();
  const first = makeHarness({
    local,
    session,
    downloadItems,
    downloadPlans: [{ id: 41, pending: true }]
  });
  const stored = await storeScan(first);
  first.send({ type: "DOWNLOAD", tabId: 7, postKey: stored.post.key, ids: stored.images.map(image => image.id) });
  await waitFor(() => first.downloadCalls.length === 1 && local.state?.jobs?.[0]?.tasks?.[0]?.status === "starting", "persisted starting task");

  const owned = copy(downloadItems.get(41));
  downloadItems.delete(41);
  downloadItems.set(40, {
    id: 40,
    url: owned.url,
    state: "complete",
    mime: "image/jpeg",
    byExtensionId: "another-extension",
    startTime: owned.startTime
  });
  downloadItems.set(41, owned);

  const restarted = makeHarness({ local, session, downloadItems });
  await restarted.send({ type: "GET_VIEW", tabId: 7 });
  const recovered = restarted.state().jobs[0].tasks[0];

  assert.equal(restarted.downloadCalls.length, 0);
  assert.equal(recovered.downloadId, 41);
  assert.equal(recovered.status, "downloading");

  restarted.setDownload(41, { state: "complete", mime: "image/jpeg", fileSize: 77 });
  restarted.events.downloadChanged.emit({ id: 41, state: { current: "complete" } });
  await restarted.send({ type: "GET_VIEW", tabId: 7 });
  assert.equal(restarted.state().jobs[0].tasks[0].status, "complete");
});

test("folder-only settings persist across restart and GET_VIEW exposes no retired settings", async () => {
  const local = {};
  const session = {};
  const first = makeHarness({ local, session });
  const saved = await first.send({
    type: "SAVE_SETTINGS",
    settings: { folder: "Photos\\Trip" }
  });

  assert.equal(saved.ok, true);
  assert.deepEqual(copy(saved.data), { folder: "Photos/Trip" });
  for (const folder of ["/absolute", "C:\\absolute", "safe/../escape"]) {
    const settings = { folder };
    const response = await first.send({ type: "SAVE_SETTINGS", settings });
    assert.equal(response.ok, false, JSON.stringify(settings));
    assert.equal(response.error, "REQUEST_FAILED");
  }

  const restarted = makeHarness({ local, session });
  const view = await restarted.send({ type: "GET_VIEW", tabId: 7 });
  assert.equal(view.ok, true);
  assert.deepEqual(copy(view.data.settings), { folder: "Photos/Trip" });
});

test("legacy original quality migrates to fixed w3840-first manual requests", async () => {
  const local = { state: { settings: { autoDownload: false, quality: "original", folder: "Migrated" }, jobs: [], history: {}, logs: [] } };
  const h = makeHarness({ local });
  const { response } = await startManual(h);
  const task = h.state().jobs[0].tasks[0];

  assert.equal(response.ok, true);
  assert.deepEqual(h.state().settings, { folder: "Migrated" });
  assert.match(task.candidates[0], /[?&]type=w3840(?:&|$)/);
  assert.equal(h.downloadCalls[0].url, task.candidates[0]);
});

test("nested Korean folder and popup override reach the native filename API", async () => {
  const h = makeHarness();
  await h.send({ type: "SAVE_SETTINGS", settings: { folder: "Old\\Folder" } });
  const { response } = await startManual(h, 1, { folder: "사진\\여행" });
  const expected = "사진/여행/alice_123/001_image-1.jpg";

  assert.equal(response.ok, true);
  assert.equal(response.data.folder, "사진/여행");
  assert.equal(h.state().settings.folder, "사진/여행");
  assert.equal(h.state().jobs[0].folder, "사진/여행");
  assert.equal(h.state().jobs[0].tasks[0].filename, expected);
  assert.equal(h.downloadCalls[0].filename, expected);
  assert.equal(h.downloadCalls[0].saveAs, false);
  assert.equal(h.downloadCalls[0].conflictAction, "uniquify");
  assert.equal(h.filenameSuggestions[0].sourceFilename, expected);
  assert.equal(h.filenameSuggestions[0].latestFilename, expected);
  assert.deepEqual(h.filenameSuggestions[0].args, [{ filename: expected, conflictAction: "uniquify" }]);
});

test("saved folder changes do not alter queued job snapshots but affect new requests", async () => {
  const h = makeHarness();
  await h.send({ type: "SAVE_SETTINGS", settings: { folder: "Old" } });
  const stored = await storeScan(h, 5);
  const first = await h.send({ type: "DOWNLOAD", tabId: 7, postKey: stored.post.key, ids: stored.images.slice(0, 4).map(image => image.id) });
  assert.equal(first.ok, true);
  assert.equal(h.downloadCalls.length, 3);

  const saved = await h.send({ type: "SAVE_SETTINGS", settings: { folder: "New\\Path" } });
  assert.equal(saved.ok, true);
  const second = await h.send({ type: "DOWNLOAD", tabId: 7, postKey: stored.post.key, ids: [stored.images[4].id] });
  assert.equal(second.ok, true);
  assert.equal(h.state().jobs[0].folder, "Old");
  assert.equal(h.state().jobs[1].folder, "New/Path");

  const firstId = h.state().jobs[0].tasks[0].downloadId;
  h.setDownload(firstId, { state: "complete", mime: "image/jpeg" });
  h.events.downloadChanged.emit({ id: firstId, state: { current: "complete" } });
  await h.send({ type: "GET_VIEW", tabId: 7 });
  assert.match(h.downloadCalls[3].filename, /^Old\//);

  const secondId = h.state().jobs[0].tasks[1].downloadId;
  h.setDownload(secondId, { state: "complete", mime: "image/jpeg" });
  h.events.downloadChanged.emit({ id: secondId, state: { current: "complete" } });
  await h.send({ type: "GET_VIEW", tabId: 7 });
  assert.match(h.downloadCalls[4].filename, /^New\/Path\//);
});

test("invalid DOWNLOAD folder is atomic for settings, jobs, and native calls", async () => {
  const h = makeHarness();
  await h.send({ type: "SAVE_SETTINGS", settings: { folder: "Safe" } });
  const stored = await storeScan(h);
  const before = h.state();

  const response = await h.send({
    type: "DOWNLOAD", tabId: 7, postKey: stored.post.key,
    ids: stored.images.map(image => image.id), folder: "safe/../escape"
  });
  assert.equal(response.ok, false);
  assert.equal(response.error, "REQUEST_FAILED");
  assert.equal(h.downloadCalls.length, 0);

  const view = await h.send({ type: "GET_VIEW", tabId: 7 });
  assert.equal(view.ok, true);
  assert.deepEqual(h.state(), before);
});

test("filename listener suggests once for unrelated downloads and uses cold persisted task snapshots", async () => {
  const unrelatedHarness = makeHarness();
  const unrelated = await unrelatedHarness.determineFilename({
    id: 900, url: "https://example.test/file.jpg", finalUrl: "https://example.test/file.jpg",
    filename: "file.jpg", byExtensionId: "another-extension"
  });
  assert.equal(unrelated.calls, 1);
  assert.deepEqual(unrelated.args, []);

  const candidate = imageRoot + "image-1.jpg?type=w3840";
  const expected = "Cold/경로/alice_123/001_image-1.jpg";
  const local = { state: {
    schemaVersion: 2, settings: { folder: "Cold/경로" }, logs: [], jobs: [{
      id: "cold-job", tabId: 7, post: { key: "alice_123", url: "https://blog.naver.com/alice/123" },
      title: "Cold", createdAt: 1, folder: "Cold/경로",
      tasks: [{
        image: { id: imageRoot + "image-1.jpg", src: imageRoot + "image-1.jpg?type=w80", index: 1 },
        candidates: [candidate, imageRoot + "image-1.jpg"], attempt: 0,
        status: "starting", downloadId: null, startedAt: Date.now(), error: "", bytes: 0
      }]
    }]
  } };
  const cold = makeHarness({ local });
  const own = await cold.determineFilename({
    id: 901, url: candidate, finalUrl: candidate,
    filename: "image-1.jpg", byExtensionId: "test"
  });
  assert.equal(own.calls, 1);
  assert.equal(own.returned, true, "cold asynchronous lookup must keep the Chrome callback open");
  assert.deepEqual(own.args, [{ filename: expected, conflictAction: "uniquify" }]);
});

test("native filename deltas and final completion persist task.savedFilename", async () => {
  const h = makeHarness();
  await startManual(h);
  const task = h.state().jobs[0].tasks[0];
  const nativeFilename = "C:\\Users\\tester\\Downloads\\NaverBlog\\alice_123\\001_image-1 (1).jpg";
  h.setDownload(task.downloadId, { filename: nativeFilename });
  h.events.downloadChanged.emit({ id: task.downloadId, filename: { current: nativeFilename } });
  await h.send({ type: "GET_VIEW", tabId: 7 });
  assert.equal(h.state().jobs[0].tasks[0].status, "downloading");
  assert.equal(h.state().jobs[0].tasks[0].savedFilename, nativeFilename);

  const movedFilename = "C:\\Users\\tester\\Downloads\\NaverBlog\\alice_123\\001_image-1 (2).jpg";
  h.setDownload(task.downloadId, {
    state: "complete", mime: "image/jpeg", fileSize: 42, filename: movedFilename
  });
  h.events.downloadChanged.emit({ id: task.downloadId, state: { current: "complete" } });
  await h.send({ type: "GET_VIEW", tabId: 7 });

  assert.equal(h.state().jobs[0].tasks[0].savedFilename, movedFilename);
  assert.equal(h.downloadCalls[0].saveAs, false);
  assert.equal(h.downloadCalls[0].conflictAction, "uniquify");
});

test("message origins keep site scans and extension controls separate", async () => {
  const h = makeHarness();
  const badScan = await h.send({ type: "SITE_SCAN", scan: scan() }, extensionSender);
  const badControl = await h.send({ type: "GET_VIEW", tabId: 7 }, siteSender());
  assert.equal(badScan.ok, false);
  assert.equal(badScan.error, "REQUEST_FAILED");
  assert.equal(badControl.ok, false);
  assert.equal(badControl.error, "REQUEST_FAILED");
});
