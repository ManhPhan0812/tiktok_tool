(() => {
  "use strict";
  const ns = globalThis.TikTokTools = globalThis.TikTokTools || {};

  // API Douyin tự host của người dùng (bản local trên máy cá nhân hoặc bản
  // trên VPS, cùng một API kiểu JoeanAmier/TikTokDownloader chế độ Web API):
  // POST <base>/douyin/detail với body JSON { detail_id: "<aweme_id>" },
  // trả { data: { desc, height, width, duration, downloads, music_url,
  // dynamic_cover, static_cover } }. `downloads` là link play trực tiếp
  // đã ký của Douyin (aweme/v1/play, is_play_url=1), music_url là file mp3.
  //
  // KHÔNG hardcode base URL hay token vào code: repo là public, còn API
  // của người dùng có thể chạy ở localhost, VPS, port bất kỳ, và token
  // xác thực là bí mật riêng. Extension chỉ đọc hai khóa storage sau
  // (đặt từ console của service worker, giống khóa ttgetToken trước đây):
  //   chrome.storage.local.set({ douyinLocalBase: "http://127.0.0.1:5556" })
  //   chrome.storage.local.set({ douyinLocalToken: "<token>" })
  // Không đặt base thì đường này không chạy, luồng cũ giữ nguyên. Token
  // chỉ gửi khi đã đặt; API không yêu cầu token thì gọi không cần header.
  // Base URL có thể là origin (http://host:port) hoặc nguyên endpoint
  // .../douyin/detail, đều chuẩn hoá về origin trước khi nối path.
  const BASE_KEY = "douyinLocalBase";
  const TOKEN_KEY = "douyinLocalToken";
  const REQUEST_TIMEOUT = 25_000;

  function normalizeBase(value) {
    const text = String(value || "").trim().replace(/\/+$/, "");
    if (!text) return "";
    try {
      const url = new URL(text);
      if (url.protocol !== "http:" && url.protocol !== "https:") return "";
      const path = url.pathname.replace(/\/douyin\/detail\/?$/, "").replace(/\/+$/, "");
      return `${url.protocol}//${url.host}${path}`;
    } catch {
      return "";
    }
  }

  async function storedConfig() {
    try {
      if (typeof chrome === "undefined" || !chrome.storage?.local) return { base: "", token: "" };
      const stored = await chrome.storage.local.get([BASE_KEY, TOKEN_KEY]);
      return {
        base: normalizeBase(stored?.[BASE_KEY]),
        token: String(stored?.[TOKEN_KEY] || "").trim()
      };
    } catch {
      return { base: "", token: "" };
    }
  }

  // duration của API này là chuỗi "HH:MM:SS"; popup hiển thị theo giây.
  function durationToSeconds(value) {
    if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
    const match = String(value || "").match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
    if (!match) return null;
    return match[3] !== undefined
      ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
      : Number(match[1]) * 60 + Number(match[2]);
  }

  function extract(payload) {
    if (!payload || typeof payload !== "object") return null;
    const data = payload.data && typeof payload.data === "object" ? payload.data : null;
    if (!data) return null;
    const videoUrl = typeof data.downloads === "string" ? data.downloads.trim() : "";
    if (!/^https:\/\//i.test(videoUrl)) return null;
    const medias = [{
      url: videoUrl,
      quality: data.height ? `${data.height}p` : "Gốc",
      fileSize: 0
    }];
    const musicUrl = typeof data.music_url === "string" ? data.music_url.trim() : "";
    if (/^https:\/\//i.test(musicUrl)) {
      medias.push({ url: musicUrl, quality: "Audio", fileSize: 0 });
    }
    return {
      title: data.desc || null,
      cover: data.dynamic_cover || data.static_cover || null,
      duration: durationToSeconds(data.duration),
      medias
    };
  }

  // configOverride chỉ dùng cho test; chạy thật thì lấy từ storage.
  async function resolve(detailId, fetchImpl = fetch, configOverride) {
    const config = configOverride
      ? { base: normalizeBase(configOverride.base), token: String(configOverride.token || "").trim() }
      : await storedConfig();
    if (!config.base) return { ok: false, reason: "NOT_CONFIGURED" };
    if (!detailId) return { ok: false, reason: "NO_ID" };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
      const response = await fetchImpl(`${config.base}/douyin/detail`, {
        method: "POST",
        signal: controller.signal,
        credentials: "omit",
        headers: {
          accept: "*/*",
          "content-type": "application/json",
          ...(config.token ? { token: config.token } : {})
        },
        body: JSON.stringify({ detail_id: String(detailId) })
      });
      if (!response.ok) return { ok: false, reason: `HTTP_${response.status}` };
      let json;
      try {
        json = await response.json();
      } catch {
        return { ok: false, reason: "NON_JSON" };
      }
      const extracted = extract(json);
      if (!extracted) return { ok: false, reason: "NO_DOWNLOADS" };
      return { ok: true, ...extracted };
    } catch (error) {
      return { ok: false, reason: error?.name === "AbortError" ? "TIMEOUT" : "FETCH_FAILED" };
    } finally {
      clearTimeout(timer);
    }
  }

  ns.localApiService = Object.freeze({
    BASE_KEY,
    TOKEN_KEY,
    normalizeBase,
    durationToSeconds,
    extract,
    resolve,
    storedConfig
  });
})();
