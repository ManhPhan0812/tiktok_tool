(() => {
  "use strict";
  const ns = globalThis.TikTokTools = globalThis.TikTokTools || {};
  const msg = ns.messages;
  const types = msg.types;
  const validation = ns.validation;

  // Player có thể dùng DASH/MSE nên không thể lưu blob như một tệp MP4.
  // Mặc định phân tích qua Seekin; vẫn cho phép endpoint riêng tương thích.
  const ENDPOINT_KEY = "douyinEndpoint";
  const TOKEN_KEY = "douyinToken";
  const REQUEST_TIMEOUT = 25_000;
  const CACHE_TTL = 60_000;

  const cache = new Map();
  const nativeCache = new Map();

  function fail(code, message) {
    return msg.fail(code, message);
  }

  async function config() {
    try {
      const stored = await chrome.storage.local.get([ENDPOINT_KEY, TOKEN_KEY]);
      const customEndpoint = String(stored?.[ENDPOINT_KEY] || "").trim();
      return {
        endpoint: customEndpoint || ns.seekinService.endpoint,
        token: customEndpoint ? String(stored?.[TOKEN_KEY] || "").trim() : ""
      };
    } catch {
      return { endpoint: ns.seekinService.endpoint, token: "" };
    }
  }

  function messageFor(code) {
    switch (code) {
      case "INVALID_URL":
        return "URL không hợp lệ. Hãy dán link Douyin bắt đầu bằng https://.";
      case "INVALID_HOST":
        return "Chỉ hỗ trợ link thuộc douyin.com.";
      case "INVALID_PATH":
        return "Link này không phải link video Douyin. Ví dụ đúng: https://www.douyin.com/video/123, hoặc link có ?modal_id=123.";
      default:
        return "Không phân tích được link Douyin này.";
    }
  }

  function qualityNumber(quality) {
    const match = String(quality || "").match(/(\d{3,4})/);
    return match ? Number(match[1]) : 0;
  }

  // Chấp nhận ba dạng máy chủ hay trả: { code, data: { medias } }, { data: { medias } }
  // và mảng media trần. Không đoán bừa: không khớp dạng nào thì báo lỗi rõ ràng.
  // Thêm dạng dự phòng cho máy chủ thật (không phải stub test): một link tải duy
  // nhất, hoặc một mảng URL trần. Link trỏ lại trang Douyin/TikTok (máy chủ echo
  // lại link gốc) không được tính là link tải, để không tạo lựa chọn giả.
  function isPageUrl(value) {
    try {
      const host = new URL(value).hostname.toLowerCase();
      return /(^|\.)(douyin|iesdouyin|tiktok)\.com$/.test(host);
    } catch {
      return true;
    }
  }

  function extract(payload) {
    if (!payload || typeof payload !== "object") return null;
    if (Array.isArray(payload)) return { title: null, cover: null, medias: payload };
    const data = payload.data && typeof payload.data === "object" ? payload.data : payload;
    const medias = data.medias || data.media || data.videos || data.items || data.list;
    if (Array.isArray(medias)) {
      return {
        title: data.title || data.desc || null,
        cover: data.imageUrl || data.cover || data.image || null,
        duration: data.duration ?? null,
        hdLifetime: data.hdLifetime ?? null,
        medias
      };
    }
    const single = [data.downloadUrl, data.download_url, data.videoUrl, data.video_url,
      data.playUrl, data.play_url, data.url]
      .find(value => typeof value === "string" && /^https:\/\//i.test(value.trim()) && !isPageUrl(value.trim()));
    if (single) {
      return {
        title: data.title || data.desc || null,
        cover: data.imageUrl || data.cover || data.image || null,
        duration: data.duration ?? null,
        hdLifetime: data.hdLifetime ?? null,
        medias: [{
          url: single.trim(),
          quality: data.quality || data.label || "video",
          fileSize: data.fileSize || data.sizeBytes || data.dataSize || 0
        }]
      };
    }
    const urls = Array.isArray(data.urls)
      ? data.urls.filter(value => typeof value === "string" && /^https:\/\//i.test(value.trim()) && !isPageUrl(value.trim()))
      : [];
    if (urls.length) {
      return {
        title: data.title || data.desc || null,
        cover: data.imageUrl || data.cover || data.image || null,
        duration: data.duration ?? null,
        hdLifetime: data.hdLifetime ?? null,
        medias: urls.map(url => ({ url: url.trim(), quality: "video" }))
      };
    }
    return null;
  }

  function rowsFrom(medias) {
    const rows = [];
    for (const item of medias) {
      if (!item || typeof item !== "object") continue;
      const quality = String(item.quality || item.label || item.height || "").trim();
      const url = typeof item.url === "string" && /^https:\/\//i.test(item.url.trim()) ? item.url.trim() : null;
      const declaredLocked = Boolean(item.locked);
      const available = Boolean(url) && !declaredLocked;
      const sizeBytes = Number(item.fileSize || item.sizeBytes || item.dataSize || 0) || null;
      rows.push({
        key: `q${qualityNumber(quality) || rows.length}`,
        label: quality || "video",
        quality,
        available,
        locked: declaredLocked || !url,
        url: available ? url : null,
        sizeBytes,
        sizeStr: item.sizeStr || validation.formatBytes(sizeBytes) || null,
        note: declaredLocked
          ? "Bản này máy chủ để khoá (thường cần tài khoản trả phí của dịch vụ)."
          : available ? null : "Máy chủ không trả link cho bản này."
      });
    }
    rows.sort((a, b) => qualityNumber(b.quality) - qualityNumber(a.quality));
    return rows;
  }

  function originOf(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" ? `${url.protocol}//${url.host}` : null;
    } catch {
      return null;
    }
  }

  // Endpoint do người dùng đặt nằm ngoài host_permissions của extension, nên phải xin
  // quyền theo origin cụ thể (optional_host_permissions) trước khi fetch.
  async function permittedFor(origin) {
    try {
      return await chrome.permissions.contains({ origins: [`${origin}/*`] });
    } catch {
      return false;
    }
  }

  // Link rút gọn v.douyin.com/<mã> là dạng copy từ app hay gặp nhất, nhưng nó
  // không chứa videoId. Trước đây code gửi nguyên link rút gọn cho Seekin và
  // trông chờ máy chủ tự theo redirect — chưa được kiểm chứng. Nay extension
  // tự giải redirect trước (cần host_permissions cho v.douyin.com trong
  // manifest.json): lấy URL cuối rồi mới gửi cho máy chủ. Giải không được thì
  // giữ nguyên link rút gọn như cũ, không hỏng thêm trường hợp nào.
  async function resolveShortLink(parsed) {
    if (!parsed.short) return parsed;
    try {
      const response = await fetch(parsed.url, { credentials: "omit" });
      const resolved = validation.parseDouyinUrl(response.url);
      if (resolved.ok && resolved.videoId) return resolved;
    } catch {
      // Giữ link rút gọn cho máy chủ tự xử lý.
    }
    return parsed;
  }

  // Thử lấy thẳng từ Douyin trước (douyin-native.js). Thất bại thì rơi xuống
  // Seekin như cũ, không báo lỗi ở đây: link native có thể bị captcha chặn
  // trong khi Seekin vẫn phân tích được, và ngược lại. Chỉ cache kết quả
  // native thành công, để lần sau vẫn thử lại khi native từng thất bại.
  async function tryNative(parsed) {
    if (!parsed.videoId || !ns.douyinNative) return null;
    const key = `native:${parsed.videoId}`;
    const cached = nativeCache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL) return cached.data;
    let native = null;
    try {
      native = await ns.douyinNative.resolveNative(parsed);
    } catch {
      native = null;
    }
    if (!native?.ok || !Array.isArray(native.medias)) return null;
    const rows = rowsFrom(native.medias);
    const available = rows.filter(row => row.available);
    if (!available.length) return null;
    const data = {
      platform: "douyin",
      videoId: parsed.videoId,
      title: native.title,
      cover: native.cover,
      duration: native.duration ?? null,
      rows,
      availableCount: available.length,
      defaultVariant: available[0].key,
      source: "native",
      provider: "Douyin",
      resolvedAt: Date.now()
    };
    nativeCache.set(key, { at: Date.now(), data });
    return data;
  }

  async function analyze(payload = {}) {
    let parsed = validation.parseDouyinUrl(payload.url);
    if (!parsed.ok) return fail(parsed.code, messageFor(parsed.code));
    parsed = await resolveShortLink(parsed);

    const nativeData = await tryNative(parsed);
    if (nativeData) return msg.ok(nativeData);

    const { endpoint, token } = await config();
    const cacheKey = JSON.stringify([endpoint, token, parsed.videoId || parsed.url]);
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_TTL) return msg.ok(cached.data);
    const isSeekin = ns.seekinService.matches(endpoint);
    const origin = originOf(endpoint);
    if (!origin) {
      return fail("NOT_CONFIGURED", "douyinEndpoint phải là URL https hợp lệ, ví dụ https://your-host.example/media/download.");
    }
    if (!(await permittedFor(origin))) {
      return {
        ok: false,
        error: {
          code: "PERMISSION_REQUIRED",
          message: `Cần cấp quyền truy cập ${origin} để gọi máy chủ tải Douyin.`,
          origin
        }
      };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    let response;
    let text;
    try {
      const body = JSON.stringify({ url: parsed.url });
      const signedHeaders = isSeekin ? await ns.seekinService.headers(endpoint, body) : {};
      response = await fetch(endpoint, {
        method: "POST",
        signal: controller.signal,
        credentials: "omit",
        headers: {
          "content-type": "application/json",
          accept: "*/*",
          ...signedHeaders,
          ...(token ? { authorization: token } : {})
        },
        body
      });
      text = await response.text();
    } catch (error) {
      const aborted = error?.name === "AbortError";
      return fail(
        aborted ? "TIMEOUT" : "UPSTREAM",
        aborted
          ? "Máy chủ tải Douyin phản hồi quá lâu. Hãy thử lại."
          : `Không gọi được máy chủ tải Douyin: ${String(error?.message || error).slice(0, 120)}`
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      return fail("UPSTREAM", `Máy chủ tải Douyin trả HTTP ${response.status}.`);
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return fail("UPSTREAM", "Máy chủ tải Douyin trả dữ liệu không phải JSON.");
    }
    if (json?.code && String(json.code) !== "0000") {
      const hint = isSeekin && String(json.code) === "5016"
        ? " Seekin chưa phân tích được video này. Hãy thử lại trên seekin.ai hoặc phân tích lại sau."
        : "";
      return fail("UPSTREAM", `${isSeekin ? "Seekin" : "Máy chủ"} báo lỗi ${json.code}: ${json.msg || json.message || "không rõ lý do"}.${hint}`);
    }
    const extracted = extract(json);
    if (!extracted) {
      return fail("UPSTREAM", "Máy chủ trả JSON nhưng không có danh sách bản tải (medias).");
    }
    const rows = rowsFrom(extracted.medias);
    if (!rows.some(row => row.available)) {
      return fail("NO_SOURCE", "Máy chủ không trả bản tải được cho video này (mọi bản đều khoá hoặc thiếu link).");
    }

    const available = rows.filter(row => row.available);
    const data = {
      platform: "douyin",
      videoId: parsed.videoId || null,
      title: extracted.title,
      cover: extracted.cover,
      duration: extracted.duration,
      rows,
      availableCount: available.length,
      defaultVariant: available[0].key,
      source: "proxy",
      provider: isSeekin ? "Seekin" : new URL(endpoint).hostname,
      hdLifetime: extracted.hdLifetime,
      resolvedAt: Date.now()
    };
    cache.set(cacheKey, { at: Date.now(), data });
    return msg.ok(data);
  }

  function fileNameFor(data, row) {
    const id = validation.sanitizeFileName(data.videoId || "video", "video");
    const quality = validation.sanitizeFileName(row.quality || row.label || "video", "video");
    return `Douyin/${id}_${quality}.mp4`;
  }

  async function download(payload = {}) {
    // analyze dùng cache theo URL + cấu hình và kiểm tra TTL cả khi bấm tải.
    const resolved = await analyze({ url: payload.url });
    if (!resolved.ok) return resolved;
    const entry = resolved.data;
    const row = entry.rows.find(item => item.key === payload.variant)
      || entry.rows.find(item => item.key === entry.defaultVariant);
    if (!row || !row.available || !row.url) {
      return fail("NO_SOURCE", row?.note || "Bản này không tải được cho video đang chọn.");
    }
    const filename = fileNameFor(entry, row);
    try {
      const downloadId = await chrome.downloads.download({
        url: row.url,
        filename,
        saveAs: false,
        conflictAction: "uniquify"
      });
      return msg.ok({ downloadId, filename, variant: row.key, label: row.label, videoId: entry.videoId });
    } catch (error) {
      return fail("NO_SOURCE", `Không tạo được lệnh tải: ${String(error?.message || error).slice(0, 120)}`);
    }
  }

  function clearCache() {
    cache.clear();
    nativeCache.clear();
  }

  ns.douyinService = Object.freeze({
    analyze,
    download,
    extract,
    rowsFrom,
    clearCache,
    config,
    ENDPOINT_KEY,
    TOKEN_KEY
  });
})();

