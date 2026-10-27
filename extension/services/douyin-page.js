(() => {
  "use strict";
  const ns = globalThis.TikTokTools = globalThis.TikTokTools || {};
  const SOURCE = "tiktok-tools-douyin-capture";
  const HOOK_PATH = "services/douyin-page-hook.js";

  // Bắt link từ chính trang Douyin đang mở, thay vì fetch lại từ service
  // worker (đường đó không có session/ký của user nên hay bị chặn).
  // Thứ tự ưu tiên, từ chắc chắn nhất tới suy diễn nhất:
  //   1. Dữ liệu hook bắt được từ request mà trang tự gọi (đã có cookie/ký).
  //   2. <video> đang phát có currentSrc là http (không phải blob).
  //   3. play_addr trong các thẻ <script> của trang, chỉ khi đang ở trang
  //      video đơn (/video/<id> hoặc ?modal_id=) để khỏi bắt nhầm video khác
  //      trong feed.
  const byVideoId = new Map();
  let latest = null;

  function toNoWatermark(value) {
    if (typeof value !== "string") return null;
    const url = value.trim();
    if (!/^https:\/\//i.test(url)) return null;
    return url.replace("/playwm/", "/play/");
  }

  function isPageUrl(value) {
    try {
      const host = new URL(value).hostname.toLowerCase();
      return /(^|\.)(douyin|iesdouyin|tiktok)\.com$/.test(host);
    } catch {
      return true;
    }
  }

  function pickUrl(list) {
    if (!Array.isArray(list)) return null;
    for (const raw of list) {
      const url = toNoWatermark(raw);
      if (url && !isPageUrl(url)) return url;
    }
    return null;
  }

  function dedupeMedias(medias) {
    const seen = new Set();
    return (medias || []).filter(item => {
      if (!item?.url || seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
  }

  function remember(captured) {
    if (!captured || !Array.isArray(captured.medias) || !captured.medias.length) return;
    const clean = {
      videoId: captured.videoId ? String(captured.videoId) : null,
      title: captured.title || null,
      cover: captured.cover || null,
      duration: captured.duration ?? null,
      medias: dedupeMedias(captured.medias.map(item => ({
        url: toNoWatermark(item.url),
        quality: String(item.quality || "").trim() || "Gốc"
      })).filter(item => item.url && !isPageUrl(item.url)))
    };
    if (!clean.medias.length) return;
    latest = clean;
    if (clean.videoId) byVideoId.set(clean.videoId, clean);
  }

  // Chèn hook MAIN world một lần. Content script chạy ở document_idle nên
  // hook có thể lỡ request lúc tải trang lần đầu; bù lại nó bắt được mọi
  // request sau đó (lướt feed, mở modal, chuyển video).
  function injectHook() {
    try {
      if (document.querySelector("script[data-tiktok-tools-hook]")) return;
      const script = document.createElement("script");
      script.dataset.tiktokToolsHook = "1";
      script.src = chrome.runtime.getURL(HOOK_PATH);
      script.onload = () => script.remove();
      (document.documentElement || document.head).appendChild(script);
    } catch {
      // Không chèn được thì các lớp dưới vẫn chạy.
    }
  }

  function onMessage(event) {
    if (event?.source !== window) return;
    const data = event.data;
    if (!data || data.source !== SOURCE || !data.captured) return;
    remember(data.captured);
  }

  function videoIdFromPage() {
    const fromPath = (location.pathname || "").match(/\/video\/(\d{6,25})/)?.[1];
    if (fromPath) return fromPath;
    try {
      const params = new URLSearchParams(location.search || "");
      for (const key of ["modal_id", "aweme_id", "item_id"]) {
        const value = params.get(key);
        if (/^\d{6,25}$/.test(value || "")) return value;
      }
    } catch {
      // location.search lỗi thì bỏ qua, dùng các nguồn khác.
    }
    return null;
  }

  function videoIdNear(video) {
    if (!video) return null;
    let node = video;
    for (let depth = 0; depth < 6 && node; depth += 1) {
      const link = node.closest?.("a[href]");
      const href = link?.getAttribute?.("href") || "";
      const match = href.match(/\/video\/(\d{6,25})/);
      if (match) return match[1];
      node = node.parentElement;
    }
    return null;
  }

  function elementUrl(video) {
    if (!video) return null;
    const src = video.currentSrc || video.src || "";
    if (!/^https:\/\//i.test(src)) return null;
    if (/uuu_265/.test(src)) return null;
    return toNoWatermark(src);
  }

  function pickVideo(preferred) {
    if (preferred && preferred.tagName === "VIDEO") return preferred;
    const videos = [...document.querySelectorAll("video")];
    for (const video of videos) {
      if (elementUrl(video)) return video;
    }
    return videos.find(video => !video.paused) || videos[0] || null;
  }

  function unescapeJsonText(text) {
    return String(text || "")
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\\//g, "/");
  }

  // Quét play_addr trong script của trang. Chỉ gọi khi đã biết videoId của
  // trang video đơn, vì trang feed chứa dữ liệu của nhiều video.
  function scriptUrls() {
    const texts = [];
    for (const script of document.querySelectorAll("script")) {
      const text = script.textContent || "";
      if (text.includes("play_addr") || text.includes("playAddr")) texts.push(text);
    }
    if (!texts.length) return [];
    const joined = unescapeJsonText(texts.join("\n"));
    const candidates = [];
    const collect = (url) => {
      const clean = toNoWatermark(url);
      if (clean && !isPageUrl(clean) && !candidates.includes(clean)) candidates.push(clean);
    };
    for (const match of joined.matchAll(/"play_addr"\s*:\s*\{\s*"url_list"\s*:\s*\[([^\]]*)\]/g)) {
      for (const urlMatch of match[1].matchAll(/"([^"]+)"/g)) collect(urlMatch[1]);
    }
    for (const match of joined.matchAll(/"(?:playAddr|downloadAddr)"\s*:\s*"([^"]+)"/g)) collect(match[1]);
    return candidates;
  }

  function capture(preferredVideo) {
    const videoId = videoIdFromPage();
    if (videoId && byVideoId.has(videoId)) {
      const found = byVideoId.get(videoId);
      return { ...found, source: "page-hook" };
    }
    const video = pickVideo(preferredVideo);
    const fromElement = elementUrl(video);
    if (fromElement) {
      const id = videoId || videoIdNear(video);
      return {
        videoId: id,
        title: null,
        cover: null,
        duration: null,
        medias: [{ url: fromElement, quality: "Gốc" }],
        source: "video-element"
      };
    }
    // Không có hook, không có link http trên <video> (thường là blob/MSE):
    // chỉ dùng script khi biết chắc video nào, tránh bắt nhầm video trong feed.
    if (videoId) {
      const urls = scriptUrls();
      if (urls.length) {
        return {
          videoId,
          title: null,
          cover: null,
          duration: null,
          medias: urls.map((url, index) => ({ url, quality: index === 0 ? "Gốc" : `Gốc ${index + 1}` })),
          source: "page-script"
        };
      }
    }
    if (latest && !videoId) {
      return { ...latest, source: "page-hook" };
    }
    return null;
  }

  try {
    window.addEventListener("message", onMessage);
  } catch {
    // Không đăng ký được listener thì capture vẫn dùng được lớp 2 và 3.
  }
  injectHook();

  ns.douyinPage = Object.freeze({
    capture,
    remember,
    videoIdFromPage,
    elementUrl,
    scriptUrls,
    toNoWatermark
  });
})();
