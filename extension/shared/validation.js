(() => {
  "use strict";
  const ns = globalThis.TikTokTools = globalThis.TikTokTools || {};

  const videoPath = /^\/@([^/]+)\/video\/(\d{6,25})\/?$/;
  const directVideoPath = /^\/(?:video\/(\d{6,25})\/?|v\/(\d{6,25})\.html\/?|(?:player\/v1|embed\/v2)\/(\d{6,25})\/?)$/;
  const sharePath = /^\/t\/[a-z0-9_-]+\/?$/i;
  const shortHosts = new Set(["vm.tiktok.com", "vt.tiktok.com"]);
  const tiktokHost = /^(?:[a-z0-9-]+\.)*tiktok\.com$/;

  function hostOf(url) {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return "";
    }
  }

  function isTikTokUrl(url) {
    return tiktokHost.test(hostOf(url));
  }

  function isTikTokTabUrl(url) {
    if (typeof url !== "string") return false;
    return /^https:\/\/(?:[a-z0-9-]+\.)*tiktok\.com\//i.test(url);
  }

  // Chỉ chấp nhận https, host thuộc tiktok.com, không có cổng lạ.
  function parseVideoUrl(input) {
    if (typeof input !== "string") return { ok: false, code: "INVALID_URL" };
    let raw = input.trim();
    if (!raw || raw.length > 2048) return { ok: false, code: "INVALID_URL" };
    // Copy Link may include the share caption, Markdown or surrounding brackets.
    // Only extract a single URL so ambiguous pasted text cannot select a different clip.
    const links = [...new Set((raw.match(/https?:\/\/[^\s<>"\[\]]+/gi) || [])
      .map(value => value.replace(/[)\]},.!?;。]+$/, "")))];
    if (links.length > 1) return { ok: false, code: "INVALID_URL" };
    if (links.length === 1) raw = links[0];
    if (/^\d{6,25}$/.test(raw)) raw = `https://www.tiktok.com/video/${raw}`;
    let url;
    try {
      url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      return { ok: false, code: "INVALID_URL" };
    }
    if (url.protocol !== "https:") return { ok: false, code: "INVALID_URL" };
    if (url.port && url.port !== "443") return { ok: false, code: "INVALID_URL" };
    if (url.username || url.password) return { ok: false, code: "INVALID_URL" };
    const host = url.hostname.toLowerCase();
    if (!tiktokHost.test(host)) return { ok: false, code: "INVALID_HOST" };
    if (shortHosts.has(host) || sharePath.test(url.pathname)) {
      if (url.pathname === "/") return { ok: false, code: "INVALID_PATH" };
      url.hash = "";
      return { ok: true, short: true, url: url.href };
    }
    const match = url.pathname.match(videoPath);
    const direct = url.pathname.match(directVideoPath);
    if (!match && !direct) return { ok: false, code: "INVALID_PATH" };
    const author = match?.[1] || null;
    const videoId = match?.[2] || direct?.slice(1).find(Boolean);
    return {
      ok: true,
      short: false,
      videoId,
      author,
      canonicalUrl: author ? `https://www.tiktok.com/@${author}/video/${videoId}` : `https://www.tiktok.com/video/${videoId}`
    };
  }

  function videoIdFromUrl(value) {
    if (typeof value !== "string") return null;
    const match = value.match(/\/video\/(\d{6,25})/);
    return match ? match[1] : null;
  }

  // Chặn ký tự điều khiển, đường dẫn và ký tự cấm trên Windows; không cho chuỗi rỗng.
  function sanitizeFileName(value, fallback = "tiktok") {
    const cleaned = String(value ?? "")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/[<>:"/\\|?*]/g, "_")
      .replace(/\s+/g, " ")
      .replace(/^\.+/, "")
      .trim()
      .slice(0, 120);
    return cleaned || fallback;
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return null;
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    const digits = value >= 100 || unit === 0 ? 0 : 1;
    return `${value.toFixed(digits).replace(".", ",")} ${units[unit]}`;
  }

  // "h264"/"avc1" phát được trên mọi trình duyệt; h265 chỉ một số nền tảng.
  function isH264Codec(codec) {
    const value = String(codec || "").toLowerCase();
    return value === "h264" || value === "avc" || value === "avc1";
  }

  ns.validation = Object.freeze({
    parseVideoUrl,
    videoIdFromUrl,
    isTikTokUrl,
    isTikTokTabUrl,
    isH264Codec,
    hostOf,
    sanitizeFileName,
    formatBytes
  });
})();
