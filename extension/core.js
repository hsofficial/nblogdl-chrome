/* SPDX-License-Identifier: GPL-3.0-only
 * Classic script shared by content scripts, the popup, and the service worker.
 */
(function () {
  "use strict";

  const BLOG_HOSTS = new Set(["blog.naver.com", "m.blog.naver.com"]);
  const BODY_SELECTORS = [".se-main-container", "#postViewArea", ".post_ct"];
  const EXCLUDED = "#comment, #comments, #commentArea, #commentList, .comment, .comments, .u_cbox, .post_comment, .blog-profile, .profile, .widget, .sidebar, script, template";

  function getPostIdentity(value) {
    try {
      const url = new URL(value);
      if (!/^https?:$/.test(url.protocol) || !BLOG_HOSTS.has(url.hostname) || url.port || url.username || url.password) return null;
      let blogId, logNo;
      if (/^\/PostView\.naver\/?$/i.test(url.pathname)) {
        // Repeated identity parameters are ambiguous; never choose one silently.
        if (url.searchParams.getAll("blogId").length !== 1 || url.searchParams.getAll("logNo").length !== 1) return null;
        blogId = url.searchParams.get("blogId");
        logNo = url.searchParams.get("logNo");
      } else {
        const parts = /^\/([^/]+)\/([0-9]+)\/?$/.exec(url.pathname);
        if (!parts) return null;
        blogId = decodeURIComponent(parts[1]);
        logNo = parts[2];
      }
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(blogId) || !/^[1-9][0-9]{0,19}$/.test(logNo)) return null;
      return { key: blogId + "_" + logNo, blogId, logNo, url: "https://blog.naver.com/" + blogId + "/" + logNo };
    } catch {
      return null;
    }
  }

  function normalizeImageUrl(value, baseUrl) {
    if (typeof value !== "string" || !value.trim()) return null;
    try {
      const url = new URL(value.trim(), baseUrl);
      const host = url.hostname;
      if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port) return null;
      if (!(host === "pstatic.net" || host.endsWith(".pstatic.net") || host === "blogfiles.naver.net" || host === "postfiles.naver.net")) return null;
      url.protocol = "https:";
      url.hash = "";
      return url.href;
    } catch {
      return null;
    }
  }

  function getImageCandidates(src, quality) {
    const normalized = normalizeImageUrl(src);
    if (!normalized) return [];
    const url = new URL(normalized);
    // Keep the spelling/order of other query fields, including signed values.
    // URLSearchParams rewrites spaces and escapes when any field is changed.
    const fields = url.search.slice(1).split("&").filter(field => {
      try { return decodeURIComponent(field.split("=", 1)[0].replace(/\+/g, " ")) !== "type"; }
      catch { return true; }
    }).filter(Boolean);
    url.search = fields.length ? "?" + fields.join("&") : "";
    const original = url.href;
    url.search = (url.search ? url.search + "&" : "?") + "type=w3840";
    const sized = url.href;
    return [...new Set(quality === "w3840" ? [sized, original] : [original, sized])];
  }

  function sanitizeSegment(value, fallback = "image") {
    function clean(input) {
      let result = String(input == null ? "" : input).normalize("NFC")
        .replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, "_")
        .replace(/\.\.+/g, "_").trim().replace(/^[. ]+|[. ]+$/g, "");
      // Array.from truncates by code point, so surrogate pairs stay intact.
      result = Array.from(result).slice(0, 80).join("").replace(/[. ]+$/g, "");
      if (/^(con|prn|aux|nul|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3])(?:\.|$)/i.test(result)) {
        result = "_" + Array.from(result).slice(0, 79).join("");
      }
      return result;
    }
    return clean(value) || clean(fallback) || "image";
  }

  function normalizeFolder(value) {
    if (value == null || value === "") return "NaverBlog";
    if (typeof value !== "string") throw new Error("Invalid relative folder");
    const path = value.trim().replace(/\\/g, "/");
    if (!path) return "NaverBlog";
    if (/^(\/|[A-Za-z]:)/.test(path)) throw new Error("Absolute folder is not allowed");
    const parts = path.split("/");
    if (parts.some(part => !part.trim() || part.trim() === "." || part.trim() === "..")) throw new Error("Invalid folder segment");
    return parts.map(part => sanitizeSegment(part)).join("/");
  }

  function buildFilename(post, image, folder, quality) {
    const src = normalizeImageUrl(image.src || image.id);
    let name = "image";
    if (src) {
      const tail = new URL(src).pathname.split("/").pop();
      try { name = decodeURIComponent(tail) || name; } catch { name = tail || name; }
    }
    const extension = /\.(jpg|jpeg|png|gif|webp|bmp|avif|tif|tiff)$/i.exec(name);
    const stem = extension ? name.slice(0, -extension[0].length) : name.replace(/\.[^.]*$/, "");
    const index = Number.isSafeInteger(image.index) && image.index > 0 ? image.index : 1;
    return normalizeFolder(folder) + "/" + sanitizeSegment(post.key) + "/" + String(index).padStart(3, "0") + "_" + sanitizeSegment(stem) + (extension ? extension[0].toLowerCase() : ".jpg");
  }

  function collectImages(document, baseUrl) {
    let location;
    try { location = new URL(baseUrl || document.URL); } catch { return null; }
    if (!BLOG_HOSTS.has(location.hostname) || !/^https?:$/.test(location.protocol) || location.username || location.password || location.port) return null;
    let post = getPostIdentity(location.href);
    if (!post) {
      // Only a PostView frame may borrow identity from page metadata. Home/list
      // pages often advertise the latest post and must never become a scan.
      if (!/^\/PostView\.naver\/?$/i.test(location.pathname)) return null;
      const identities = new Map();
      for (const node of document.querySelectorAll('link[rel="canonical"], meta[property="og:url"]')) {
        const raw = node.getAttribute("href") || node.getAttribute("content");
        try {
          const url = new URL(raw, location.href);
          const identity = url.hostname === location.hostname ? getPostIdentity(url.href) : null;
          if (identity) identities.set(identity.key, identity);
        } catch { /* Ignore malformed page metadata. */ }
      }
      if (identities.size !== 1) return null;
      post = identities.values().next().value;
    }
    let body = null;
    for (const selector of BODY_SELECTORS) {
      const roots = [...document.querySelectorAll(selector)];
      if (roots.length > 1) return null;
      if (roots.length === 1) { body = roots[0]; break; }
    }
    if (!body) return null;
    const titleNode = document.querySelector('meta[property="og:title"]');
    const title = (titleNode && titleNode.getAttribute("content") || document.title || "").trim();
    const records = new Map();
    const dimension = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;
    for (const node of body.querySelectorAll("[data-linkdata], img")) {
      if (node.closest(EXCLUDED)) continue;
      const isImage = node.tagName.toLowerCase() === "img";
      const image = isImage ? node : node.querySelector("img");
      const metadataNode = node.hasAttribute("data-linkdata") ? node : node.closest("[data-linkdata]");
      let metadata = {};
      if (metadataNode && body.contains(metadataNode)) {
        try {
          const parsed = JSON.parse(metadataNode.getAttribute("data-linkdata"));
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) metadata = parsed;
        } catch { /* Broken link metadata must not suppress a valid image. */ }
      }
      // Ignore arbitrary links: only explicit image metadata or actual images
      // qualify. Never follow href values, which may point to another post.
      if (image && image.closest(EXCLUDED)) continue;
      if (!image && node.getAttribute("data-linktype") && node.getAttribute("data-linktype") !== "img") continue;
      const displayed = image && (normalizeImageUrl(image.currentSrc, location.href) || normalizeImageUrl(image.getAttribute("src"), location.href));
      const src = normalizeImageUrl(metadata.src, location.href) || (image && (
        normalizeImageUrl(image.getAttribute("data-lazy-src"), location.href) ||
        normalizeImageUrl(image.getAttribute("data-src"), location.href) || displayed));
      if (!src) continue;
      const id = getImageCandidates(src, "original")[0];
      const width = dimension(metadata.originalWidth);
      const height = dimension(metadata.originalHeight);
      const naturalWidth = dimension(image && image.naturalWidth);
      const naturalHeight = dimension(image && image.naturalHeight);
      let record = records.get(id);
      if (!record) {
        record = { image: { id, src: id, preview: displayed || id, width: 0, height: 0, index: records.size + 1 }, width: 0, height: 0, naturalWidth: 0, naturalHeight: 0 };
        records.set(id, record);
      }
      // Later duplicates can supply original dimensions unavailable on the first
      // lazy thumbnail. Metadata always wins over thumbnail natural dimensions.
      record.width = Math.max(record.width, width);
      record.height = Math.max(record.height, height);
      record.naturalWidth = Math.max(record.naturalWidth, naturalWidth);
      record.naturalHeight = Math.max(record.naturalHeight, naturalHeight);
      record.image.width = record.width || record.naturalWidth;
      record.image.height = record.height || record.naturalHeight;
      if (displayed && record.image.preview === id) record.image.preview = displayed;
    }
    return { post, title, images: [...records.values()].map(record => record.image) };
  }

  globalThis.NBlogCore = Object.freeze({ getPostIdentity, normalizeImageUrl, getImageCandidates, sanitizeSegment, normalizeFolder, buildFilename, collectImages });
})();
