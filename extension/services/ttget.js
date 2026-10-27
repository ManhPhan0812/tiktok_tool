(() => {
  "use strict";
  const ns = globalThis.TikTokTools = globalThis.TikTokTools || {};

  // Provider trực tiếp cho Douyin (Seekin đã bị xóa): sau bắt từ trang
  // đang xem -> native, analyze gọi thẳng API này. API public của
  // ttget.com, quan sát từ network log của trang: POST form l=<link
  // Douyin> tới go.ttget.com/info, trả { data: { cover, desc, pages:
  // [[{ type, label, link, link2, direct_link }, ...]] } }. Chỉ lấy bản
  // không watermark và bản audio.
  //
  // Header `tw` là token phiên của riêng trang ttget trong trình duyệt
  // của người dùng và xoay theo phiên (hai lần bắt network log trong
  // cùng một ngày đã cho hai giá trị khác nhau), lại nằm trong repo
  // public, nên KHÔNG hardcode vào code. Extension chỉ gửi `tw` khi
  // người dùng đã lưu nó vào storage với khóa ttgetToken (ví dụ từ
  // console của service worker: chrome.storage.local.set({ ttgetToken:
  // "<token mới>" })); không có token thì gọi như trước, và nếu ttget
  // đòi token thì douyin.js sẽ báo rõ để người dùng cập nhật.
  const endpoint = "https://go.ttget.com/info";
  const TOKEN_KEY = "ttgetToken";
  const REQUEST_TIMEOUT = 25_000;

  function isTtgetUrl(value) {
    try {
      const host = new URL(value).hostname.toLowerCase();
      return host === "ttget.com" || host === "dl.ttget.com";
    } catch {
      return false;
    }
  }

  function qualityFromLabel(label) {
    const text = String(label || "");
    const resolution = text.match(/(\d{3,4})\s*x\s*(\d{3,4})/);
    if (resolution) return `${resolution[2]}p`;
    if (/hd/i.test(text)) return "HD";
    return "Gốc";
  }

  // Trả null cho bản có watermark; bản "No Watermark" vẫn chứa chuỗi
  // "Watermark" nên phải kiểm tra "No Watermark" trước.
  function extract(payload) {
    if (!payload || typeof payload !== "object") return null;
    const data = payload.data && typeof payload.data === "object" ? payload.data : null;
    if (!data || !Array.isArray(data.pages)) return null;
    const medias = [];
    const seenUrls = new Set();
    for (const page of data.pages) {
      if (!Array.isArray(page)) continue;
      for (const item of page) {
        if (!item || typeof item !== "object") continue;
        const label = String(item.label || "");
        let quality = null;
        if (item.type === "music") {
          quality = "Audio";
        } else if (item.type === "video" && /no watermark/i.test(label)) {
          quality = qualityFromLabel(label);
        } else {
          continue;
        }
        const url = [item.direct_link, item.link2, item.link]
          .find(value => typeof value === "string" && /^https:\/\//i.test(value.trim()) && isTtgetUrl(value.trim()));
        if (!url || seenUrls.has(url.trim())) continue;
        seenUrls.add(url.trim());
        medias.push({ url: url.trim(), quality, fileSize: 0 });
      }
    }
    if (!medias.length) return null;
    return {
      title: data.desc || null,
      cover: data.cover || null,
      duration: null,
      medias
    };
  }

  async function storedToken() {
    try {
      if (typeof chrome === "undefined" || !chrome.storage?.local) return "";
      const stored = await chrome.storage.local.get([TOKEN_KEY]);
      return String(stored?.[TOKEN_KEY] || "").trim();
    } catch {
      return "";
    }
  }

  // tokenOverride chỉ dùng cho test; chạy thật thì lấy từ storage.
  async function resolve(url, fetchImpl = fetch, tokenOverride) {
    const token = typeof tokenOverride === "string" ? tokenOverride.trim() : await storedToken();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        signal: controller.signal,
        credentials: "omit",
        referrer: "https://ttget.com/",
        headers: {
          accept: "*/*",
          "accept-language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          lang: "vi",
          ...(token ? { tw: token } : {})
        },
        body: `l=${encodeURIComponent(url)}`
      });
      if (!response.ok) return { ok: false, reason: `HTTP_${response.status}` };
      let json;
      try {
        json = await response.json();
      } catch {
        return { ok: false, reason: "NON_JSON" };
      }
      const extracted = extract(json);
      if (!extracted) return { ok: false, reason: "NO_PAGES" };
      return { ok: true, ...extracted };
    } catch (error) {
      return { ok: false, reason: error?.name === "AbortError" ? "TIMEOUT" : "FETCH_FAILED" };
    } finally {
      clearTimeout(timer);
    }
  }

  ns.ttgetService = Object.freeze({ endpoint, TOKEN_KEY, extract, resolve });
})();
