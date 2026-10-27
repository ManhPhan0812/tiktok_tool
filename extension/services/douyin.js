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

  // Hỏi content script của tab đang mở: nó bắt link từ chính trang Douyin
  // (hook request của trang, <video> đang phát, hoặc script của trang) nên
  // có session và chữ ký của user, khác hẳn fetch từ service worker. Hỏi
  // không được (tab không phải Douyin, content script chưa sẵn, video blob
  // mà chưa có dữ liệu hook) thì trả null để rơi xuống các đường sau.
  // Nếu user đã dán một link khác với video đang xem thì không dùng kết
  // quả bắt từ trang, tránh tải nhầm video.
  async function tryPageCapture(parsed, tabId) {
    if (!Number.isInteger(tabId)) return null;
    let response = null;
    try {
      response = await Promise.race([
        chrome.tabs.sendMessage(tabId, {
          type: msg.types.DOUYIN_PAGE_CAPTURE,
          payload: {},
          requestId: msg.nextRequestId("douyin-page")
        }),
        new Promise(resolve => setTimeout(() => resolve(null), 5000))
      ]);
    } catch {
      return null;
    }
    if (!msg.isResponse(response) || !response.ok) return null;
    const captured = response.data;
    if (!captured || !Array.isArray(captured.medias) || !captured.medias.length) return null;
    if (parsed?.videoId && captured.videoId && parsed.videoId !== captured.videoId) return null;
    const rows = rowsFrom(captured.medias);
    const available = rows.filter(row => row.available);
    if (!available.length) return null;
    return {
      platform: "douyin",
      videoId: captured.videoId || parsed?.videoId || null,
      title: captured.title,
      cover: captured.cover,
      duration: captured.duration ?? null,
      rows,
      availableCount: available.length,
      defaultVariant: available[0].key,
      source: "page",
      provider: "Douyin (trang đang xem)",
      resolvedAt: Date.now()
    };
  }

  async function analyze(payload = {}) {
    // Ô trống (popup gửi khi bấm "Dùng video đang xem" trên tab Douyin mà
    // không có canonicalUrl): bỏ qua bước parse, chỉ thử bắt từ trang.
    let parsed = null;
    if (payload.url && String(payload.url).trim()) {
      const initial = validation.parseDouyinUrl(payload.url);
      if (!initial.ok) return fail(initial.code, messageFor(initial.code));
      parsed = await resolveShortLink(initial);
    }

    const pageData = await tryPageCapture(parsed, payload.tabId);
    if (pageData) return msg.ok(pageData);
    if (!parsed) {
      return fail("INVALID_URL", "Hãy mở một video Douyin trên tab đang xem rồi bấm Phân tích, hoặc dán link Douyin.");
    }

    const nativeData = await tryNative(parsed);
    if (nativeData) return msg.ok(nativeData);

    const { endpoint, token } = await config();
    const isSeekin = ns.seekinService.matches(endpoint);
    const proxy = await tryProxy(parsed, endpoint, token, isSeekin);
    if (proxy.ok) return msg.ok(proxy.data);
    // Seekin 5016 trên video thật (ví dụ 7669768092729363764) là trường
    // hợp ttget sinh ra để cứu: chỉ chạy khi endpoint đang là Seekin mặc
    // định, không chạy sau endpoint riêng do người dùng đặt. ttget thất
    // bại thì trả lại đúng lỗi Seekin như cũ, không thay bằng lỗi mới.
    if (isSeekin) {
      const ttgetData = await tryTtget(parsed);
      if (ttgetData) return msg.ok(ttgetData);
    }
    return proxy.error;
  }

  // Đường máy chủ cấu hình được (mặc định Seekin). Trả { ok, data } hoặc
  // { ok: false, error } để analyze còn thử đường dự phòng trước khi báo.
  async function tryProxy(parsed, endpoint, token, isSeekin) {
    const cacheKey = JSON.stringify([endpoint, token, parsed.videoId || parsed.url]);
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_TTL) return { ok: true, data: cached.data };
    const origin = originOf(endpoint);
    if (!origin) {
      return { ok: false, error: fail("NOT_CONFIGURED", "douyinEndpoint phải là URL https hợp lệ, ví dụ https://your-host.example/media/download.") };
    }
    if (!(await permittedFor(origin))) {
      return {
        ok: false,
        error: {
          ok: false,
          error: {
            code: "PERMISSION_REQUIRED",
            message: `Cần cấp quyền truy cập ${origin} để gọi máy chủ tải Douyin.`,
            origin
          }
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
      return {
        ok: false,
        error: fail(
          aborted ? "TIMEOUT" : "UPSTREAM",
          aborted
            ? "Máy chủ tải Douyin phản hồi quá lâu. Hãy thử lại."
            : `Không gọi được máy chủ tải Douyin: ${String(error?.message || error).slice(0, 120)}`
        )
      };
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      return { ok: false, error: fail("UPSTREAM", `Máy chủ tải Douyin trả HTTP ${response.status}.`) };
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, error: fail("UPSTREAM", "Máy chủ tải Douyin trả dữ liệu không phải JSON.") };
    }
    if (json?.code && String(json.code) !== "0000") {
      const hint = isSeekin && String(json.code) === "5016"
        ? " Seekin chưa phân tích được video này. Hãy thử lại trên seekin.ai hoặc phân tích lại sau."
        : "";
      return { ok: false, error: fail("UPSTREAM", `${isSeekin ? "Seekin" : "Máy chủ"} báo lỗi ${json.code}: ${json.msg || json.message || "không rõ lý do"}.${hint}`) };
    }
    const extracted = extract(json);
    if (!extracted) {
      return { ok: false, error: fail("UPSTREAM", "Máy chủ trả JSON nhưng không có danh sách bản tải (medias).") };
    }
    const rows = rowsFrom(extracted.medias);
    if (!rows.some(row => row.available)) {
      return { ok: false, error: fail("NO_SOURCE", "Máy chủ không trả bản tải được cho video này (mọi bản đều khoá hoặc thiếu link).") };
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
    return { ok: true, data };
  }

  // Dự phòng ttget (services/ttget.js). Host ttget nằm trong
  // host_permissions của manifest nên fetch thẳng từ service worker; lỗi
  // mạng/HTTP/JSON đều trả null để analyze giữ nguyên lỗi Seekin.
  async function tryTtget(parsed) {
    if (!ns.ttgetService) return null;
    let result = null;
    try {
      result = await ns.ttgetService.resolve(parsed.url);
    } catch {
      return null;
    }
    if (!result?.ok || !Array.isArray(result.medias)) return null;
    const rows = rowsFrom(result.medias);
    const available = rows.filter(row => row.available);
    if (!available.length) return null;
    return {
      platform: "douyin",
      videoId: parsed.videoId || null,
      title: result.title,
      cover: result.cover,
      duration: result.duration ?? null,
      rows,
      availableCount: available.length,
      defaultVariant: available[0].key,
      source: "ttget",
      provider: "ttget.com",
      resolvedAt: Date.now()
    };
  }

  function fileNameFor(data, row) {
    const id = validation.sanitizeFileName(data.videoId || "video", "video");
    const quality = validation.sanitizeFileName(row.quality || row.label || "video", "video");
    // Bản audio của ttget là file âm thanh, không phải MP4.
    const ext = /audio/i.test(row.quality || row.label || "") ? "mp3" : "mp4";
    return `Douyin/${id}_${quality}.${ext}`;
  }

  async function download(payload = {}) {
    // analyze dùng cache theo URL + cấu hình và kiểm tra TTL cả khi bấm tải.
    // Giữ tabId để lần phân tích lại khi bấm tải vẫn bắt được từ trang đang
    // xem trong trường hợp lần đầu bắt bằng đường trang (ô URL trống).
    const resolved = await analyze({ url: payload.url, tabId: payload.tabId });
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

