/* SPDX-License-Identifier: GPL-3.0-only */
(function () {
  "use strict";
  if (!globalThis.NBlogCore || !globalThis.chrome || !chrome.runtime) {
    console.warn("[NBlog] Content initialization unavailable");
    return;
  }
  let stopped = false;
  let timer = null;
  let pendingSince = null;
  let lastSnapshot = null;
  let lastUrl = location.href;
  let observer;
  let navigationTimer;

  function stop() {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    clearInterval(navigationTimer);
    if (observer) observer.disconnect();
    console.info("[NBlog] Content context unavailable; scanning stopped");
  }

  function failed(error) {
    // Examine errors privately: raw messages can contain URLs or page data.
    if (!chrome.runtime.id || /context invalidated|extension context/i.test(String(error && error.message || ""))) stop();
    else console.warn("[NBlog] Scan delivery failed");
  }

  function scan(force = false) {
    clearTimeout(timer);
    timer = null;
    pendingSince = null;
    if (stopped) return;
    if (!chrome.runtime.id) { stop(); return; }
    let result;
    try { result = NBlogCore.collectImages(document, location.href); }
    catch { console.warn("[NBlog] Scan extraction failed"); return; }
    if (!result) {
      if (lastSnapshot !== null) {
        // This document no longer contains a single post. The worker checks
        // document/frame ownership before clearing a possibly newer scan.
        try { chrome.runtime.sendMessage({ type: "SITE_CLEAR" }, () => {
          const error = chrome.runtime.lastError;
          if (error) failed(error);
        }); } catch (error) { failed(error); }
      }
      lastSnapshot = null;
      return;
    }
    const snapshot = JSON.stringify(result);
    if (!force && snapshot === lastSnapshot) return;
    // Mark before dispatch so concurrent mutations cannot send the same scan.
    lastSnapshot = snapshot;
    try {
      chrome.runtime.sendMessage({ type: "SITE_SCAN", scan: result }, reply => {
        const error = chrome.runtime.lastError;
        if (error) {
          if (lastSnapshot === snapshot) lastSnapshot = null;
          failed(error);
        } else if (reply && reply.ok === false) {
          // Transport success does not imply the worker accepted the scan.
          // Never expose its error text, and permit the next mutation to retry.
          if (lastSnapshot === snapshot) lastSnapshot = null;
          console.warn("[NBlog] Scan rejected by background");
        }
      });
      console.info("[NBlog] Scan sent; images=" + result.images.length);
    } catch (error) {
      if (lastSnapshot === snapshot) lastSnapshot = null;
      failed(error);
    }
  }

  function schedule() {
    if (stopped) return;
    const now = Date.now();
    if (pendingSince === null) pendingSince = now;
    clearTimeout(timer);
    // A continuously animating document still receives a scan every 3 seconds.
    timer = setTimeout(() => scan(), Math.max(0, Math.min(800, 3000 - (now - pendingSince))));
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === "SCAN") {
      scan(true);
      sendResponse({ ok: !stopped });
    }
  });
  observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ["src", "srcset", "sizes", "data-src", "data-lazy-src", "data-linkdata", "href", "content", "class", "id"]
  });
  document.addEventListener("load", schedule, true);
  addEventListener("popstate", () => scan());
  addEventListener("hashchange", () => scan());
  // Isolated content scripts cannot reliably intercept page-world pushState.
  // Poll only the URL; DOM parsing runs only when navigation actually changes it.
  navigationTimer = setInterval(() => {
    if (stopped) return;
    if (!chrome.runtime.id) { stop(); return; }
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      scan();
    }
  }, 1000);
  console.info("[NBlog] Content scanner initialized");
  scan();
})();
