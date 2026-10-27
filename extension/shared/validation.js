(() => {
  "use strict";
  const ns = globalThis.TikTokTools = globalThis.TikTokTools || {};

  const videoPath = /^\/@([^/]+)\/video\/(\d{6,25})\/?$/;
  const directVideoPath = /^\/(?:video\/(\d{6,25})\/?|v\/(\d{6,25})\.html\/?|(?:player\/v1|embed\/v2)\/(\d{6,25})\/?)$/;
  const sharePath = /^\/t\/[a-z0-9_-]+\/?$/i;
  const shortHosts = new Set(["vm.tiktok.com", "vt.tiktok.com"]);
  const tiktokHost = /^(?:[a-z0-9-]+\.)*tiktok\.com$/;
  // iesdouyin.com là host share chính thức của Douyin (dạng
  // https://www.iesdouyin.com/share/video/<id>/). Trước đây isDouyinUrl() không
  // nhận host này nên popup rơi vào luồng TikTok và báo UNSUPPORTED_PLATFORM,
  // dù parseDouyinUrl() vẫn xử lý được link đó.
  const douyinHost = /^(?:[a-z0-9-]+\.)*(?:douyin|iesdouyin)\.com$/;
  // Nguồn duy nhất cho danh sách host: `shared/platform.js` đọc bảng này để dựng
  // hồ sơ nền tảng, nên thêm nền tảng mới chỉ cần thêm một dòng ở đây.
  const hostPatterns = Object.freeze({ tiktok: tiktokHost, douyin: douyinHost });

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

  function isDouyinUrl(url) {
    return douyinHost.test(hostOf(url));
  }

  function isTikTokTabUrl(url) {
    if (typeof url !== "string") return false;
    return /^https:\/\/(?:[a-z0-9-]+\.)*tiktok\.com\//i.test(url);
  }

  // Tab mà content script có thể chạy: TikTok và Douyin, luôn phải là https.
  function isSupportedTabUrl(url) {
    if (typeof url !== "string" || !/^https:\/\//i.test(url)) return false;
    const host = hostOf(url);
    return tiktokHost.test(host) || douyinHost.test(host);
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
    // Douyin xem được bằng extension nhưng chưa hỗ trợ tải; trả mã riêng để popup
    // nói đúng lý do thay vì báo "chỉ hỗ trợ tiktok.com".
    if (douyinHost.test(host)) return { ok: false, code: "UNSUPPORTED_PLATFORM" };
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

  // Douyin có nhiều dạng link: /video/<id>, ?modal_id=<id>, iesdouyin /share/video/<id>
  // và link rút gọn v.douyin.com/<mã>. Chỉ lấy được id khi link có id; link rút gọn
  // được chuyển nguyên cho máy chủ người dùng cấu hình tự theo dõi redirect.
  const douyinShortHost = new Set(["v.douyin.com"]);
  const douyinHosts = /^(?:[a-z0-9-]+\.)*(?:douyin|iesdouyin)\.com$/;

  function parseDouyinUrl(input) {
    if (typeof input !== "string") return { ok: false, code: "INVALID_URL" };
    let raw = input.trim();
    if (!raw || raw.length > 2048) return { ok: false, code: "INVALID_URL" };
    const links = [...new Set((raw.match(/https?:\/\/[^\s<>"\[\]]+/gi) || [])
      .map(value => value.replace(/[)\]},.!?;。]+$/, "")))];
    if (links.length > 1) return { ok: false, code: "INVALID_URL" };
    if (links.length === 1) raw = links[0];
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
    // Chuỗi không phải URL (ví dụ "xin chào") vẫn có thể qua được new URL: báo INVALID_URL
    // thay vì đổ lỗi cho host.
    if (!host.includes(".") || /[^a-z0-9.-]/.test(host)) return { ok: false, code: "INVALID_URL" };
    if (!douyinHosts.test(host)) return { ok: false, code: "INVALID_HOST" };
    if (douyinShortHost.has(host)) {
      if (url.pathname === "/" || url.pathname.length < 2) return { ok: false, code: "INVALID_PATH" };
      url.hash = "";
      return { ok: true, short: true, videoId: null, url: url.href };
    }
    const fromQuery = ["modal_id", "aweme_id", "item_id", "vid"]
      .map(key => url.searchParams.get(key))
      .find(value => /^\d{6,25}$/.test(value || ""));
    const fromPath = (url.pathname.match(/\/video\/(\d{6,25})/) || url.pathname.match(/\/share\/video\/(\d{6,25})/) || [])[1];
    const videoId = fromQuery || fromPath;
    if (!videoId) return { ok: false, code: "INVALID_PATH" };
    return {
      ok: true,
      short: false,
      videoId,
      canonicalUrl: `https://www.douyin.com/video/${videoId}`,
      url: `https://www.douyin.com/video/${videoId}`
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
    parseDouyinUrl,
    videoIdFromUrl,
    isTikTokUrl,
    isDouyinUrl,
    isTikTokTabUrl,
    isSupportedTabUrl,
    hostPatterns,
    isH264Codec,
    hostOf,
    sanitizeFileName,
    formatBytes
  });
})();

