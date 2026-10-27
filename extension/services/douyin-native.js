(() => {
  "use strict";
  const ns = globalThis.TikTokTools = globalThis.TikTokTools || {};

  // Lấy link tải thẳng từ dữ liệu của chính Douyin, không qua máy chủ trung gian.
  // Hai nguồn, thử theo thứ tự:
  //   1. API web mà chính trang Douyin dùng: iesdouyin.com/web/api/v2/aweme/iteminfo/
  //   2. HTML trang video douyin.com/video/<id> (dữ liệu nhúng trong trang).
  // Cả hai đều trả video.play_addr.url_list; bản có watermark chứa "playwm",
  // đổi thành "play" là được bản không watermark. Module này không tự quyết
  // định fallback: trả ok:false thì caller (douyin.js) rơi xuống ttget như cũ.
  const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  const REQUEST_TIMEOUT = 15_000;
  const ITEMINFO_URL = "https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/";

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

  // Lấy URL tải đầu tiên hợp lệ trong url_list, bỏ link trỏ lại trang Douyin.
  function pickUrl(list) {
    if (!Array.isArray(list)) return null;
    for (const raw of list) {
      if (typeof raw !== "string") continue;
      const url = toNoWatermark(raw);
      if (url && !isPageUrl(url)) return url;
    }
    return null;
  }

  // Một aweme có thể có nhiều bản bit_rate (mỗi bản một gear_name như 720p/1080p);
  // không có thì dùng play_addr duy nhất, đặt tên "Gốc" thay vì đoán độ phân giải.
  function videoFromAweme(aweme) {
    const item = aweme?.aweme_detail || aweme;
    const video = item?.video;
    if (!video || typeof video !== "object") return null;
    const medias = [];
    const seen = new Set();
    const push = (url, quality) => {
      if (url && !seen.has(url)) {
        seen.add(url);
        medias.push({ url, quality: String(quality || "").trim() || "Gốc" });
      }
    };
    if (Array.isArray(video.bit_rate)) {
      for (const entry of video.bit_rate) {
        if (!entry || typeof entry !== "object") continue;
        push(pickUrl(entry.play_addr?.url_list), entry.gear_name || entry.quality_type);
      }
    }
    push(pickUrl(video.play_addr?.url_list), "Gốc");
    push(pickUrl(video.download_addr?.url_list), "Gốc");
    if (!medias.length) return null;
    return {
      title: item.desc || item.title || null,
      cover: pickUrl(video.origin_cover?.url_list)
        || pickUrl(video.dynamic_cover?.url_list)
        || pickUrl(video.cover?.url_list)
        || null,
      duration: video.duration ?? item.duration ?? null,
      medias
    };
  }

  function extractFromItemInfo(json) {
    if (!json || typeof json !== "object") return null;
    const data = json.data && typeof json.data === "object" ? json.data : json;
    const list = Array.isArray(data.item_list) ? data.item_list
      : Array.isArray(data.aweme_list) ? data.aweme_list
      : data.aweme_detail ? [data.aweme_detail]
      : data.item ? [data.item]
      : null;
    if (!list) return null;
    for (const entry of list) {
      const found = videoFromAweme(entry);
      if (found) return found;
    }
    return null;
  }

  function unescapeJsonText(text) {
    return String(text || "")
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\\//g, "/");
  }

  // HTML trang video không có một schema ổn định để parse JSON trọn vẹn, nên
  // quét các trường đã biết theo thứ tự ưu tiên: play_addr (danh sách) trước,
  // rồi playAddr/downloadAddr đơn, cuối cùng mới dựng link từ vid. Link dựng
  // từ vid chỉ là dự phòng chưa kiểm chứng thực tế, không dùng khi đã có link.
  function extractFromPageHtml(html) {
    if (typeof html !== "string" || !html) return null;
    const text = unescapeJsonText(html);
    const candidates = [];
    const collect = (url) => {
      const clean = toNoWatermark(url);
      if (clean && !isPageUrl(clean) && !candidates.includes(clean)) candidates.push(clean);
    };
    for (const match of text.matchAll(/"play_addr"\s*:\s*\{\s*"url_list"\s*:\s*\[([^\]]*)\]/g)) {
      for (const urlMatch of match[1].matchAll(/"([^"]+)"/g)) collect(urlMatch[1]);
    }
    for (const match of text.matchAll(/"(?:playAddr|downloadAddr)"\s*:\s*"([^"]+)"/g)) collect(match[1]);
    if (candidates.length) {
      return {
        title: null,
        cover: null,
        duration: null,
        medias: candidates.map((url, index) => ({ url, quality: index === 0 ? "Gốc" : `Gốc ${index + 1}` }))
      };
    }
    const vid = (text.match(/"vid"\s*:\s*"([^"]+)"/) || [])[1];
    if (vid) {
      return {
        title: null,
        cover: null,
        duration: null,
        medias: [{ url: `https://aweme.snssdk.com/aweme/v1/play/?video_id=${vid}&ratio=720p&line=0`, quality: "Gốc" }]
      };
    }
    return null;
  }

  async function fetchWithTimeout(fetchFn, url, options, timeout = REQUEST_TIMEOUT) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      return await fetchFn(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function resolveNative(input, fetchFn = globalThis.fetch) {
    const videoId = input?.videoId;
    if (!videoId || typeof fetchFn !== "function") return { ok: false, reason: "NO_ID" };
    const canonical = `https://www.douyin.com/video/${videoId}`;
    let lastReason = "NO_SOURCE";
    // Nguồn 1: API iteminfo của Douyin.
    try {
      const response = await fetchWithTimeout(fetchFn, `${ITEMINFO_URL}?item_ids=${encodeURIComponent(videoId)}`, {
        credentials: "include",
        headers: {
          accept: "application/json",
          referer: canonical,
          "user-agent": USER_AGENT
        }
      });
      if (response?.ok) {
        const json = await response.json().catch(() => null);
        const found = extractFromItemInfo(json);
        if (found) return { ok: true, source: "iteminfo", ...found };
        lastReason = "ITEMINFO_EMPTY";
      } else if (response) {
        lastReason = `ITEMINFO_HTTP_${response.status}`;
      }
    } catch (error) {
      lastReason = error?.name === "AbortError" ? "ITEMINFO_TIMEOUT" : "ITEMINFO_NETWORK";
    }
    // Nguồn 2: HTML trang video. Nếu trang trả về trang xác minh (captcha) thì
    // dừng ở đây với lý do rõ ràng, caller vẫn có thể thử ttget sau đó.
    try {
      const response = await fetchWithTimeout(fetchFn, canonical, {
        credentials: "include",
        headers: {
          accept: "text/html,application/xhtml+xml",
          referer: "https://www.douyin.com/",
          "user-agent": USER_AGENT
        }
      });
      if (!response?.ok) return { ok: false, reason: response ? `PAGE_HTTP_${response.status}` : lastReason };
      const html = await response.text();
      if (/验证码|slide-captcha|captcha/i.test(html)) return { ok: false, reason: "CAPTCHA" };
      const found = extractFromPageHtml(html);
      if (found) return { ok: true, source: "page", ...found };
      return { ok: false, reason: "PAGE_NO_SOURCE" };
    } catch (error) {
      return { ok: false, reason: error?.name === "AbortError" ? "PAGE_TIMEOUT" : "PAGE_NETWORK" };
    }
  }

  ns.douyinNative = Object.freeze({
    resolveNative,
    extractFromItemInfo,
    extractFromPageHtml,
    videoFromAweme,
    toNoWatermark,
    pickUrl
  });
})();
