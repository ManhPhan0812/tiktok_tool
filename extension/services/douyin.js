(() => {
  "use strict";
  const ns = globalThis.TikTokTools = globalThis.TikTokTools || {};
  const msg = ns.messages;
  const types = msg.types;
  const validation = ns.validation;

  // Player có thể dùng DASH/MSE nên không thể lưu blob như một tệp MP4.
  // Seekin đã bị xóa khỏi tool: mặc định phân tích trực tiếp qua ttget.com
  // (services/ttget.js); vẫn cho phép endpoint riêng tương thích nếu người
  // dùng đã đặt douyinEndpoint trong storage.
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
        endpoint: customEndpoint,
        token: customEndpoint ? String(stored?.[TOKEN_KEY] || "").trim() : ""
      };
    } catch {
      return { endpoint: "", token: "" };
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
  // không chứa videoId. Trước đây code gửi nguyên link rút gọn cho máy chủ và
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
  // ttget, không báo lỗi ở đây: link native có thể bị captcha chặn
  // trong khi ttget vẫn phân tích được, và ngược lại. Chỉ cache kết quả
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

  // API Douyin tự host của người dùng (services/localapi.js): POST
  // /douyin/detail với detail_id, trả link play trực tiếp + nhạc. Chỉ
  // chạy khi người dùng đã đặt douyinLocalBase trong storage; chưa đặt
  // thì trả null để luồng cũ chạy y như trước. Lỗi thiếu quyền host thì
  // báo thẳng (fatal) để popup xin quyền theo origin rồi thử lại, giống
  // đường endpoint riêng; lỗi mạng/upstream thì không fatal để còn rơi
  // xuống native/ttget, tránh việc VPS tắt là mất luôn đường tải.
  function localErrorFor(reason) {
    switch (reason) {
      case "TIMEOUT":
        return fail("TIMEOUT", "API Douyin tự host phản hồi quá lâu. Hãy thử lại.");
      case "NON_JSON":
        return fail("UPSTREAM", "API Douyin tự host trả dữ liệu không phải JSON.");
      case "NO_DOWNLOADS":
        return fail("NO_SOURCE", "API Douyin tự host không trả link tải cho video này.");
      default:
        if (typeof reason === "string" && reason.startsWith("HTTP_")) {
          return fail("UPSTREAM", `API Douyin tự host trả HTTP ${reason.slice(5)}. Kiểm tra lại token trong storage (douyinLocalToken) rồi thử lại.`);
        }
        return fail("UPSTREAM", "Không gọi được API Douyin tự host. Hãy thử lại.");
    }
  }

  // Khác originOf của đường endpoint riêng (chỉ nhận https): API tự host
  // thường chạy http trên localhost hoặc VPS nên phải chấp nhận cả http.
  function originOfLocal(base) {
    try {
      const url = new URL(base);
      return (url.protocol === "http:" || url.protocol === "https:")
        ? `${url.protocol}//${url.host}`
        : null;
    } catch {
      return null;
    }
  }

  async function tryLocal(parsed) {
    if (!parsed?.videoId || !ns.localApiService) return null;
    const { base, token } = await ns.localApiService.storedConfig();
    if (!base) return null;
    const origin = originOfLocal(base);
    if (!origin) {
      return {
        ok: false,
        fatal: true,
        error: fail("NOT_CONFIGURED", "douyinLocalBase phải là URL http(s) hợp lệ, ví dụ http://127.0.0.1:5556.")
      };
    }
    if (!(await permittedFor(origin))) {
      return {
        ok: false,
        fatal: true,
        error: {
          ok: false,
          error: {
            code: "PERMISSION_REQUIRED",
            message: `Cần cấp quyền truy cập ${origin} để gọi API Douyin tự host.`,
            origin
          }
        }
      };
    }
    let result = null;
    try {
      // Truyền lại cấu hình vừa đọc để resolve không đọc storage lần nữa.
      result = await ns.localApiService.resolve(parsed.videoId, undefined, { base, token });
    } catch {
      return { ok: false, fatal: false, error: localErrorFor("FETCH_FAILED") };
    }
    if (!result?.ok) return { ok: false, fatal: false, error: localErrorFor(result?.reason) };
    const rows = rowsFrom(result.medias);
    const available = rows.filter(row => row.available);
    if (!available.length) {
      return { ok: false, fatal: false, error: fail("NO_SOURCE", "API Douyin tự host không trả bản tải được cho video này.") };
    }
    return {
      ok: true,
      data: {
        platform: "douyin",
        videoId: parsed.videoId,
        title: result.title,
        cover: result.cover,
        duration: result.duration ?? null,
        rows,
        availableCount: available.length,
        defaultVariant: available[0].key,
        source: "local",
        provider: new URL(base).host,
        resolvedAt: Date.now()
      }
    };
  }

  // Gắn dòng chẩn đoán của API tự host vào lỗi cuối cùng, để lần sau
  // popup hiện rõ là API đã chạy và lỗi gì, thay vì chỉ thấy lỗi của
  // ttget. localError ở đây là response lỗi nguyên vẹn của tryLocal
  // (dạng { ok: false, error: { code, message } }). Chỉ gắn khi có
  // lỗi local thật; không có lỗi local thì trả nguyên lỗi cuối như cũ.
  // Thông điệp local không chứa giá trị base hay token nên gắn vào đây
  // không lộ bí mật.
  function withLocalNote(error, localError) {
    const note = localError?.error?.message;
    if (!note || !error || error.ok) return error;
    return {
      ...error,
      error: {
        ...error.error,
        message: `${error.error.message} API tự host cũng đã thử và lỗi: ${note}`
      }
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

    // Thứ tự mới: bắt từ trang -> API tự host (nếu đã cấu hình) -> native
    // -> provider. API tự host lỗi mạng thì rơi tiếp xuống native/ttget;
    // chỉ lỗi thiếu quyền host hoặc base URL sai mới dừng lại để người
    // dùng sửa cấu hình hoặc cấp quyền. Lỗi không-fatal của API tự host
    // được giữ lại: nếu bước cuối cũng thất bại, dòng lỗi đó được gắn
    // thêm vào thông báo cuối để lần sau không phải đoán là API đã
    // chạy hay chưa (chẩn đoán, không đổi thứ tự rơi xuống).
    const localData = await tryLocal(parsed);
    if (localData?.ok) return msg.ok(localData.data);
    if (localData?.fatal) return localData.error;
    const localError = localData?.error || null;

    const nativeData = await tryNative(parsed);
    if (nativeData) return msg.ok(nativeData);

    // Provider mặc định là
    // ttget.com trực tiếp; chỉ khi người dùng đã đặt endpoint riêng thì
    // mới gọi endpoint đó thay cho ttget, và lỗi của nó được trả thẳng
    // (không rơi xuống ttget sau endpoint riêng). Không còn đường Seekin
    // nào trong chuỗi này, nên lỗi 5016 của Seekin không thể xuất hiện nữa.
    const { endpoint, token } = await config();
    if (endpoint) {
      const proxy = await tryProxy(parsed, endpoint, token);
      if (proxy.ok) return msg.ok(proxy.data);
      return withLocalNote(proxy.error, localError);
    }
    const ttget = await tryTtget(parsed);
    if (ttget.ok) return msg.ok(ttget.data);
    return withLocalNote(ttget.error, localError);
  }

  // Đường endpoint riêng do người dùng đặt (không phải Seekin, không ký
  // HMAC). Trả { ok, data } hoặc { ok: false, error }.
  async function tryProxy(parsed, endpoint, token) {
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
      response = await fetch(endpoint, {
        method: "POST",
        signal: controller.signal,
        credentials: "omit",
        headers: {
          "content-type": "application/json",
          accept: "*/*",
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
      return { ok: false, error: fail("UPSTREAM", `Máy chủ báo lỗi ${json.code}: ${json.msg || json.message || "không rõ lý do"}.`) };
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
      provider: new URL(endpoint).hostname,
      hdLifetime: extracted.hdLifetime,
      resolvedAt: Date.now()
    };
    cache.set(cacheKey, { at: Date.now(), data });
    return { ok: true, data };
  }

  // Provider trực tiếp ttget.com (services/ttget.js). Host ttget nằm trong
  // host_permissions của manifest nên fetch thẳng từ service worker.
  // Lỗi được dịch ra thông điệp rõ ràng thay vì lỗi của provider cũ, vì
  // ttget hay bị chặn ở cổng kiểm tra bảo mật hơn là trả JSON lỗi.
  function ttgetErrorFor(reason) {
    switch (reason) {
      case "TIMEOUT":
        return fail("TIMEOUT", "ttget.com phản hồi quá lâu. Hãy thử lại.");
      case "NON_JSON":
        return fail("UPSTREAM", "ttget.com trả dữ liệu không phải JSON (có thể là trang kiểm tra bảo mật, cần token tw mới).");
      case "NO_PAGES":
        return fail("NO_SOURCE", "ttget.com không trả bản tải cho video này.");
      default:
        if (typeof reason === "string" && reason.startsWith("HTTP_")) {
          return fail("UPSTREAM", `ttget.com chặn yêu cầu (HTTP ${reason.slice(5)}). Có thể cần token tw mới: lưu vào storage ttgetToken rồi thử lại.`);
        }
        return fail("UPSTREAM", "Không gọi được ttget.com. Hãy thử lại.");
    }
  }

  async function tryTtget(parsed) {
    if (!ns.ttgetService) {
      return { ok: false, error: fail("UPSTREAM", "Chưa nạp được dịch vụ ttget.com. Hãy tải lại extension.") };
    }
    let result = null;
    try {
      result = await ns.ttgetService.resolve(parsed.url);
    } catch {
      return { ok: false, error: ttgetErrorFor("FETCH_FAILED") };
    }
    if (!result?.ok) return { ok: false, error: ttgetErrorFor(result?.reason) };
    if (!Array.isArray(result.medias)) return { ok: false, error: ttgetErrorFor("NO_PAGES") };
    const rows = rowsFrom(result.medias);
    const available = rows.filter(row => row.available);
    if (!available.length) {
      return { ok: false, error: fail("NO_SOURCE", "ttget.com không trả bản tải được cho video này.") };
    }
    return {
      ok: true,
      data: {
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
      }
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

