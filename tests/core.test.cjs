"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
require("../extension/core.js");
const core = globalThis.NBlogCore;

// Minimal DOM implements only the selectors the scanner uses. These fixtures
// test extraction behavior without installing a DOM or browser dependency.
class Element {
  constructor(tag, attributes = {}, children = [], size = {}) {
    this.tagName = tag.toUpperCase();
    this.attributes = attributes;
    this.children = children;
    this.parent = null;
    Object.assign(this, { naturalWidth: 0, naturalHeight: 0, currentSrc: "" }, size);
    for (const child of children) child.parent = this;
  }
  getAttribute(name) { return this.attributes[name] ?? null; }
  hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
  matches(selector) {
    return selector.split(",").some(raw => {
      const part = raw.trim();
      if (part.startsWith("#")) return this.attributes.id === part.slice(1);
      if (part.startsWith(".")) return (this.attributes.class || "").split(/\s+/).includes(part.slice(1));
      const parsed = /^([\w-]+)?(?:\[([\w-]+)(?:="([^"]*)")?\])?$/.exec(part);
      return !!parsed && (!parsed[1] || this.tagName.toLowerCase() === parsed[1]) &&
        (!parsed[2] || this.hasAttribute(parsed[2]) && (parsed[3] === undefined || this.getAttribute(parsed[2]) === parsed[3]));
    });
  }
  querySelectorAll(selector) {
    const found = [];
    for (const child of this.children) {
      if (child.matches(selector)) found.push(child);
      found.push(...child.querySelectorAll(selector));
    }
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { return this.matches(selector) ? this : this.parent && this.parent.closest(selector); }
  contains(element) { return element === this || this.children.some(child => child.contains(element)); }
}
const img = (src, attributes = {}, size = {}) => new Element("img", { src, ...attributes }, [], size);
const meta = (property, content) => new Element("meta", { property, content });
function page(children, url = "https://blog.naver.com/alice/123", title = "Example post") {
  const document = new Element("document", {}, children);
  document.URL = url;
  document.title = title;
  return document;
}
const body = (children, attributes = { class: "se-main-container" }) => new Element("div", attributes, children);
const imageUrl = "https://postfiles.pstatic.net/path/photo.JPG";

test("classic script publishes the exact shared API without module globals", () => {
  const context = vm.createContext({ URL });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../extension/core.js"), "utf8"), context);
  assert.deepEqual(Object.keys(context.NBlogCore).sort(), ["buildFilename", "collectImages", "getImageCandidates", "getPostIdentity", "normalizeFolder", "normalizeImageUrl", "sanitizeSegment"].sort());
});

test("post identity accepts only unambiguous Naver single post URLs", () => {
  const expected = { key: "alice_123", blogId: "alice", logNo: "123", url: "https://blog.naver.com/alice/123" };
  for (const url of ["https://blog.naver.com/alice/123", "http://m.blog.naver.com/alice/123/?x=1", "https://blog.naver.com/PostView.naver?blogId=alice&logNo=123&redirect=Dlog", "https://m.blog.naver.com/PostView.naver?logNo=123&blogId=alice"]) {
    assert.deepEqual(core.getPostIdentity(url), expected);
  }
  for (const url of ["https://blog.naver.com/alice", "https://blog.naver.com/PostList.naver?blogId=alice&logNo=123", "https://blog.naver.com.evil.test/alice/123", "https://evil.test@blog.naver.com/alice/123", "https://blog.naver.com:444/alice/123", "ftp://blog.naver.com/alice/123", "https://blog.naver.com/a%2Fb/123", "https://blog.naver.com/a%20b/123", "https://blog.naver.com/alice/0", "https://blog.naver.com/alice/-1", "https://blog.naver.com/alice/12x", "https://blog.naver.com/PostView.naver?blogId=alice&logNo=123&logNo=456", "https://blog.naver.com/PostView.naver?blogId=..&logNo=123"]) {
    assert.equal(core.getPostIdentity(url), null, url);
  }
});

test("image normalization enforces hosts, HTTPS, credentials, and safe schemes", () => {
  assert.equal(core.normalizeImageUrl("//postfiles.pstatic.net/a.jpg?type=w80#x", "https://blog.naver.com/alice/123"), "https://postfiles.pstatic.net/a.jpg?type=w80");
  assert.equal(core.normalizeImageUrl("/a.png", "http://blogfiles.naver.net/a/b"), "https://blogfiles.naver.net/a.png");
  for (const host of ["pstatic.net", "a.b.pstatic.net", "blogfiles.naver.net", "postfiles.naver.net"]) assert.equal(core.normalizeImageUrl("http://" + host + "/a.jpg"), "https://" + host + "/a.jpg");
  for (const url of ["https://pstatic.net.evil.test/a", "https://evilpstatic.net/a", "https://a.blogfiles.naver.net/a", "https://user:pass@pstatic.net/a", "https://pstatic.net:444/a", "data:image/png;base64,abc", "blob:https://pstatic.net/a", "javascript:alert(1)", "", null, {}]) assert.equal(core.normalizeImageUrl(url), null);
});

test("candidate quality order removes every type and preserves other query bytes", () => {
  const original = imageUrl + "?token=a%20b&flag=&signature=%2f";
  const src = imageUrl + "?type=w80&token=a%20b&%74ype=w200&flag=&signature=%2f";
  const sized = original + "&type=w3840";
  assert.deepEqual(core.getImageCandidates(src, "original"), [original, sized]);
  assert.deepEqual(core.getImageCandidates(src, "w3840"), [sized, original]);
  assert.deepEqual(core.getImageCandidates(sized, "w3840"), [sized, original]);
  assert.deepEqual(core.getImageCandidates("https://evil.test/image.jpg", "original"), []);
});

test("Windows-safe segments and relative folders prevent traversal and reserved names", () => {
  assert.equal(core.sanitizeSegment('  a<>:"/\\|?*b. '), "a_________b");
  assert.equal(core.sanitizeSegment("CON.jpg"), "_CON.jpg");
  assert.equal(core.sanitizeSegment("lpt1"), "_lpt1");
  assert.equal(core.sanitizeSegment(".."), "_");
  assert.equal(core.sanitizeSegment("", "backup"), "backup");
  assert.equal(core.sanitizeSegment("\ud834\udd1e".repeat(100)), "\ud834\udd1e".repeat(80));
  assert.equal(core.sanitizeSegment("a".repeat(79) + ".b"), "a".repeat(79));
  assert.equal(core.normalizeFolder(), "NaverBlog");
  assert.equal(core.normalizeFolder(" Photos\\Trip /CON "), "Photos/Trip/_CON");
  for (const folder of ["/tmp", "\\server\\share", "C:\\temp", "C:relative", "x/../y", "./x", "x/.", "x//y", "x/ .. /y", "x/", 42]) {
    assert.throws(() => core.normalizeFolder(folder), error => error instanceof Error && /^[\x00-\x7f]+$/.test(error.message));
  }
});

test("filenames use safe source stems and recognized extensions", () => {
  const post = core.getPostIdentity("https://blog.naver.com/alice/123");
  assert.equal(core.buildFilename(post, { src: imageUrl + "?type=w80", index: 2 }, "Downloads/Blog", "original"), "Downloads/Blog/alice_123/002_photo.jpg");
  assert.equal(core.buildFilename(post, { src: "https://pstatic.net/CON.PNG", index: 12 }, "", "w3840"), "NaverBlog/alice_123/012__CON.png");
  assert.equal(core.buildFilename(post, { src: "https://pstatic.net/a%2Fb.exe", index: 1 }), "NaverBlog/alice_123/001_a_b.jpg");
});

test("modern body scans merge size variants and later metadata while preserving order", () => {
  const first = img(imageUrl + "?type=w80&token=1", {}, { naturalWidth: 80, naturalHeight: 60 });
  const second = new Element("a", { "data-linkdata": JSON.stringify({ src: imageUrl + "?type=w1200&token=1", originalWidth: "4000", originalHeight: 3000 }), "data-linktype": "img" }, [img(imageUrl + "?type=w1200&token=1")]);
  const other = img("data:image/png;base64,abc", { "data-lazy-src": "https://blogfiles.naver.net/second.png" });
  const scan = core.collectImages(page([img("https://pstatic.net/avatar.jpg"), body([first, second, other]) ]));
  assert.equal(scan.title, "Example post");
  assert.deepEqual(scan.images, [
    { id: imageUrl + "?token=1", src: imageUrl + "?token=1", preview: imageUrl + "?type=w80&token=1", width: 4000, height: 3000, index: 1 },
    { id: "https://blogfiles.naver.net/second.png", src: "https://blogfiles.naver.net/second.png", preview: "https://blogfiles.naver.net/second.png", width: 0, height: 0, index: 2 }
  ]);
});

test("Naver viewer fixture keeps 37 photos in order and excludes the middle sticker", () => {
  const photoSrc = number => `https://postfiles.pstatic.net/edament/224426042469/photo_${String(number).padStart(2, "0")}.jpg`;
  const photo = number => new Element("a", {
    "data-linktype": "img",
    "data-linkdata": JSON.stringify({ src: photoSrc(number) + "?type=w3840", originalWidth: 4000, originalHeight: 3000, linkUse: false })
  }, [img(photoSrc(number) + "?type=w80")]);
  const stickerSrc = "https://storep-phinf.pstatic.net/ogq_6457f729fb5ef/original_9.png";
  const sticker = new Element("a", {
    class: "__se_sticker_link __se_link",
    "data-linktype": "sticker",
    "data-linkdata": JSON.stringify({ src: stickerSrc + "?type=p100_100", packCode: "ogq_6457f729fb5ef", seq: "9" })
  }, [img(stickerSrc + "?type=p100_100", { class: "se-sticker-image" })]);
  const children = Array.from({ length: 37 }, (_, index) => photo(index + 1));
  children.splice(9, 0, sticker);

  const scan = core.collectImages(page([body(children)], "https://blog.naver.com/edament/224426042469"));
  assert.equal(scan.images.length, 37);
  assert.deepEqual(scan.images.map(image => image.src), Array.from({ length: 37 }, (_, index) => photoSrc(index + 1)));
  assert.deepEqual(scan.images.slice(8, 10).map(image => ({ src: image.src, index: image.index })), [
    { src: photoSrc(9), index: 9 },
    { src: photoSrc(10), index: 10 }
  ]);
  assert.ok(scan.images.every(image => image.src !== stickerSrc));
});

test("component semantics exclude non-photos without URL, size, or extension heuristics", () => {
  const wrappedSrc = "https://postfiles.pstatic.net/path/wrapped-photo.jpg";
  const photoLink = (src, size = {}, metadata = {}) => new Element("a", {
    "data-linktype": "img",
    "data-linkdata": JSON.stringify({ src: src + "?type=w3840", linkUse: false, ...metadata })
  }, [new Element("span", {}, [img(src + "?type=w80", {}, size)])]);
  const wrappedPhoto = photoLink(wrappedSrc, {}, { originalWidth: 2400 });
  const excluded = [
    new Element("div", { "data-linktype": "video", "data-linkdata": JSON.stringify({ src: "https://postfiles.pstatic.net/path/video-poster.jpg" }) }, [new Element("span", {}, [img("https://postfiles.pstatic.net/path/video-poster.jpg")])]),
    new Element("a", { "data-linktype": "oglink", "data-linkdata": JSON.stringify({ src: "https://postfiles.pstatic.net/path/og-thumbnail.jpg" }) }, [img("https://postfiles.pstatic.net/path/og-thumbnail.jpg")]),
    img("https://storep-phinf.pstatic.net/ogq/standalone.png", { class: "se-sticker-image" }),
    new Element("div", { class: "se-sticker" }, [img("https://storep-phinf.pstatic.net/ogq/wrapped.png")]),
    new Element("div", { class: "se-module-sticker" }, [img("https://storep-phinf.pstatic.net/ogq/module.png")])
  ];
  const allowed = [
    wrappedPhoto,
    photoLink("https://storep-phinf.pstatic.net/photos/legit-small.png", { naturalWidth: 16, naturalHeight: 16 }),
    photoLink("https://storep-phinf.pstatic.net/photos/legit-animation.gif", { naturalWidth: 24, naturalHeight: 24 }),
    img("https://postfiles.pstatic.net/legacy/plain-image.jpg")
  ];

  const scan = core.collectImages(page([body([...allowed, ...excluded])]));
  assert.deepEqual(scan.images.map(image => ({ src: image.src, index: image.index })), [
    { src: wrappedSrc, index: 1 },
    { src: "https://storep-phinf.pstatic.net/photos/legit-small.png", index: 2 },
    { src: "https://storep-phinf.pstatic.net/photos/legit-animation.gif", index: 3 },
    { src: "https://postfiles.pstatic.net/legacy/plain-image.jpg", index: 4 }
  ]);
  assert.equal(scan.images[0].width, 2400, "photo metadata must survive anchor and child deduplication");
});

test("legacy editor handles lazy attributes and malformed metadata; widgets and links are excluded", () => {
  for (const attributes of [{ id: "postViewArea" }, { class: "post_ct" }]) {
    const document = page([body([
      new Element("a", { "data-linkdata": "{broken", href: "https://pstatic.net/unrelated.jpg" }, [img(imageUrl, {}, { naturalWidth: 320, naturalHeight: 200 })]),
      img("https://evil.test/image.jpg", { "data-src": "//postfiles.naver.net/lazy.gif" }),
      new Element("div", { class: "u_cbox" }, [img("https://pstatic.net/comment.jpg")]),
      new Element("div", { class: "widget" }, [img("https://pstatic.net/widget.jpg")]),
      new Element("a", { href: "https://pstatic.net/unrelated.jpg" }),
      new Element("a", { "data-linkdata": JSON.stringify({ src: "https://pstatic.net/metadata.webp", originalWidth: 1200 }), "data-linktype": "img" }),
      img("https://evil.test/blocked.jpg")
    ], attributes)]);
    const scan = core.collectImages(document);
    assert.equal(scan.images.length, 3);
    assert.equal(scan.images[0].width, 320);
    assert.equal(scan.images[1].src, "https://postfiles.naver.net/lazy.gif");
    assert.equal(scan.images[2].width, 1200);
  }
});

test("canonical fallback is same-host, unambiguous, and limited to PostView frames", () => {
  const roots = () => [body([img(imageUrl)])];
  const canonical = new Element("link", { rel: "canonical", href: "https://blog.naver.com/alice/123" });
  const og = meta("og:url", "https://blog.naver.com/alice/123");
  assert.equal(core.collectImages(page([canonical, og, ...roots()], "https://blog.naver.com/PostView.naver")).post.key, "alice_123");
  assert.equal(core.collectImages(page([canonical, ...roots()], "https://blog.naver.com/alice")), null);
  assert.equal(core.collectImages(page([canonical, ...roots()], "https://m.blog.naver.com/PostView.naver")), null);
  assert.equal(core.collectImages(page([canonical, meta("og:url", "https://blog.naver.com/bob/456"), ...roots()], "https://blog.naver.com/PostView.naver")), null);
  assert.equal(core.collectImages(page(roots(), "https://evil.test/alice/123")), null);
  assert.equal(core.collectImages(page([])), null);
  assert.equal(core.collectImages(page([body([]), body([])])), null);
  assert.deepEqual(core.collectImages(page([body([])])).images, []);
});

function scannerHarness() {
  let now = 0, sequence = 0;
  const timers = new Map();
  const sent = [], logs = [], listeners = {};
  const result = { post: { key: "alice_123" }, title: "Private title", images: [] };
  const runtime = { id: "test-extension", lastError: null, onMessage: { addListener(fn) { listeners.message = fn; } }, sendMessage(message, callback) { sent.push(message); callback(); } };
  const context = vm.createContext({
    NBlogCore: { collectImages() { return result; } }, chrome: { runtime, storage: { onChanged: { addListener(fn) { listeners.storage = fn; } } } },
    document: { documentElement: {}, addEventListener(name, fn) { listeners[name] = fn; } }, location: { href: "https://blog.naver.com/alice/123" },
    console: { info(message) { logs.push(message); }, warn(message) { logs.push(message); } },
    Date: { now() { return now; } }, addEventListener(name, fn) { listeners[name] = fn; },
    setTimeout(fn, delay) { const id = ++sequence; timers.set(id, { fn, at: now + delay }); return id; }, clearTimeout(id) { timers.delete(id); },
    setInterval(fn) { listeners.interval = fn; return ++sequence; }, clearInterval() { listeners.interval = null; },
    MutationObserver: class { constructor(fn) { listeners.mutation = fn; } observe() {} disconnect() { listeners.disconnected = true; } }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../extension/content.js"), "utf8"), context);
  function advance(duration) {
    const end = now + duration;
    while (true) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].fn();
    }
    now = end;
  }
  return { context, runtime, result, sent, logs, listeners, advance };
}

test("content scanning deduplicates, honors explicit scans, ignores settings, and bounds debounce", () => {
  const h = scannerHarness();
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].type, "SITE_SCAN");
  h.listeners.mutation(); h.advance(800);
  assert.equal(h.sent.length, 1);
  h.listeners.message({ type: "SCAN" }, {}, () => {});
  assert.equal(h.sent.length, 2);
  assert.equal(h.listeners.storage, undefined, "content script must not subscribe to settings changes");
  h.result.images.push({ index: 1 });
  for (let i = 0; i < 6; i++) { h.listeners.mutation(); h.advance(500); }
  assert.equal(h.sent.length, 3);
  h.context.location.href = "https://blog.naver.com/alice/456";
  h.result.post.key = "alice_456";
  h.listeners.interval();
  assert.equal(h.sent.length, 4);
  assert.ok(h.logs.every(message => /^[\x00-\x7f]*$/.test(message) && !message.includes("Private title") && !message.includes("https:")));
});

test("invalidated extension context stops observation without exposing error text", () => {
  const h = scannerHarness();
  h.runtime.sendMessage = () => { throw new Error("Extension context invalidated: private title and URL"); };
  h.listeners.message({ type: "SCAN" }, {}, () => {});
  assert.equal(h.listeners.disconnected, true);
  assert.equal(h.listeners.interval, null);
  assert.ok(h.logs.every(message => !message.includes("private")));
  const count = h.sent.length;
  h.listeners.mutation(); h.advance(5000);
  assert.equal(h.sent.length, count);
});

test("background rejection clears the snapshot so an unchanged scan can retry", () => {
  const h = scannerHarness();
  h.runtime.sendMessage = (message, callback) => {
    h.sent.push(message);
    callback({ ok: false, error: "Private URL and title" });
  };
  h.listeners.message({ type: "SCAN" }, {}, () => {});
  assert.equal(h.sent.length, 2);
  h.runtime.sendMessage = (message, callback) => { h.sent.push(message); callback({ ok: true }); };
  h.listeners.mutation(); h.advance(800);
  assert.equal(h.sent.length, 3);
  h.listeners.mutation(); h.advance(800);
  assert.equal(h.sent.length, 3);
  assert.ok(h.logs.includes("[NBlog] Scan rejected by background"));
  assert.ok(h.logs.every(message => !message.includes("Private")));
});
