(() => {
  "use strict";
  const ns = globalThis.TikTokTools = globalThis.TikTokTools || {};
  const msg = ns.messages;
  const types = msg.types;
  const validation = ns.validation;

  const CACHE_TTL = 90_000;
  const RESOLVE_TIMEOUT = 25_000;
  const POLL_INTERVAL = 500;
  const VARIANTS = ["hd", "noLogo", "logo", "mp3"];
  const SESSION_KEY = "tiktokToolsJobs";

  // URL CDN có chữ ký và hết hạn nhanh, nên chỉ cache trong bộ nhớ và thời gian ngắn.
  const cache = new Map();
  const jobs = new Map();

  function unavailable(reason) {
    return { available: false, reason };
  }

  function rowFrom(variant, extra = {}) {
    return {
      available: true,
      url: variant.url,
      width: variant.width || null,
      height: variant.height || null,
      bitrate: variant.bitrate || null,
      sizeBytes: variant.dataSize || null,
      codec: variant.codec || null,
      ext: "mp4",
      ...extra
    };
  }

  function resolutionLabel(variant) {
    // Video dọc 720×960 vẫn được gọi là 720p theo cạnh ngắn.
    const shortSide = Math.min(variant.width || 0, variant.height || 0);
    if (shortSide) return `${shortSide}p`;
    if (variant.quality) return String(variant.quality).replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    return "video";
  }

  function proxyRow({ sizeBytes, label, note, watermark, ext = "mp4" }) {
    return {
      available: true,
      url: null,
      via: "proxy",
      ext,
      label,
      note,
      watermark,
      sizeBytes: sizeBytes || null
    };
  }

  // Bốn định dạng của tikwm: hdplay (HD), play (bản chuẩn), wmplay (có logo), music (âm thanh).
  // Đo thật: hdplay thường là H.265/HEVC với phân giải cao hơn play (H.264), nên tệp HD
  // có thể nhỏ hơn tệp chuẩn dù nét hơn.
  function buildProxyRows(api) {
    const rows = {
      hd: api.hdplay
        ? proxyRow({
          sizeBytes: api.hdSize,
          label: "HD",
          watermark: false,
          note: "Bản HD do TikTok tạo, thường là H.265/HEVC nên nhỏ hơn nhưng nét hơn bản chuẩn; máy thiếu bộ giải mã HEVC có thể không mở được."
        })
        : unavailable("Video này không có bản HD riêng."),
      noLogo: api.play
        ? proxyRow({
          sizeBytes: api.size,
          label: "Chuẩn",
          watermark: false,
          note: "Bản chuẩn không logo, thường là H.264 nên mở được trên mọi máy."
        })
        : unavailable("Video này không có bản phát tiêu chuẩn."),
      logo: api.wmplay && api.wmSize > 0
        ? proxyRow({
          sizeBytes: api.wmSize,
          label: "logo",
          watermark: true,
          note: "Bản có logo do TikTok tạo."
        })
        : unavailable("Video này không có bản có logo: dịch vụ trả lại đúng tệp không logo."),
      mp3: api.music
        ? proxyRow({
          ext: "mp3",
          label: "mp3",
          watermark: null,
          note: "Tệp âm thanh (music) TikTok cấp cho video; không phải bản trích từ video nên có thể chỉ có nhạc nền."
        })
        : unavailable("Video này không có tệp âm thanh riêng.")
    };

    if (rows.hd.available && api.play && api.hdplay === api.play) {
      rows.hd = unavailable("Bản HD trùng đúng tệp với bản chuẩn.");
    }
    return rows;
  }

  // Dự phòng khi không gọi được dịch vụ ngoài: dùng dữ liệu trang và tải trực tiếp.
  function buildDirectRows(info) {
    const variants = Array.isArray(info.variants) ? info.variants : [];
    const best = variants[0] || null;
    const standard = variants.find(variant => validation.isH264Codec(variant.codec)) || best;
    const hd = best && standard && best.url !== standard.url ? best : null;
    const apiNote = info.apiError ? ` Chưa lấy được link từ tikwm.com: ${info.apiError}` : "";

    const rows = {
      hd: hd
        ? rowFrom(hd, { label: resolutionLabel(hd), watermark: false, watermarkEvidence: "playback-rendition", via: "direct" })
        : unavailable("Chưa có bản phân giải cao hơn bản không logo tiêu chuẩn."),
      noLogo: standard
        ? rowFrom(standard, { label: resolutionLabel(standard), watermark: false, watermarkEvidence: "playback-rendition", via: "direct" })
        : unavailable("Trang không cung cấp nguồn phát cho video này."),
      logo: info.logoUrl
        ? rowFrom({ url: info.logoUrl, ext: "mp4" }, { label: "logo", watermark: true, via: "direct" })
        : unavailable(`Cần dịch vụ ngoài để lấy bản có logo.${apiNote}`),
      // TikTok web không phát luồng audio riêng; tệp âm thanh chỉ có qua tikwm.com.
      mp3: unavailable(`Cần dịch vụ ngoài để lấy tệp âm thanh.${apiNote}`)
    };

    if (rows.hd.available && rows.noLogo.available && rows.hd.url === rows.noLogo.url) {
      rows.hd = unavailable("Bản HD trùng đúng tệp với bản không logo tiêu chuẩn.");
    }
    return rows;
  }

  function finish(info) {
    const rows = info.api ? buildProxyRows(info.api) : buildDirectRows(info);
    const available = Object.values(rows).filter(row => row.available).length;
    const canonicalUrl = info.canonicalUrl
      || (info.videoId && info.author ? `https://www.tiktok.com/@${info.author}/video/${info.videoId}` : null);
    const data = {
      videoId: String(info.videoId || ""),
      author: info.author || null,
      nickname: info.nickname || null,
      desc: info.desc || null,
      duration: info.duration || info.api?.duration || null,
      canonicalUrl,
      rows,
      availableCount: available,
      source: info.api ? "tikwm" : "page",
      sourceError: info.apiError || null,
      defaultVariant: rows.hd.available ? "hd" : rows.noLogo.available ? "noLogo" : null,
      resolvedAt: Date.now()
    };
    cache.set(data.videoId, { at: Date.now(), data });
    return data;
  }

  function messageFor(code) {
    switch (code) {
      case "INVALID_URL":
        return "URL không hợp lệ. Hãy dán link TikTok bắt đầu bằng https://.";
      case "INVALID_HOST":
        return "Chỉ hỗ trợ link thuộc tiktok.com.";
      case "INVALID_PATH":
        return "Link này không phải link video TikTok. Ví dụ đúng: https://www.tiktok.com/@user/video/123.";
      case "UNSUPPORTED_PLATFORM":
        return "Link Douyin được xử lý ở mục tải Douyin riêng và cần cấu hình máy chủ (xem docs/DOUYIN-DOWNLOAD.md).";
      default:
        return "Không phân tích được URL này.";
    }
  }

  async function askTab(tabId, videoId) {
    try {
      return await chrome.tabs.sendMessage(tabId, {
        type: types.RESOLVE_VIDEO,
        payload: { videoId },
        requestId: msg.nextRequestId("resolve")
      });
    } catch {
      return null;
    }
  }

  async function resolveInTab(url, videoId) {
    let tab;
    try {
      tab = await chrome.tabs.create({ url, active: false });
    } catch {
      return { info: null, reason: "TAB_FAILED" };
    }
    const started = Date.now();
    let emptyResponses = 0;
    try {
      while (Date.now() - started < RESOLVE_TIMEOUT) {
        const current = await chrome.tabs.get(tab.id).catch(() => null);
        if (!current) return { info: null, reason: "TAB_CLOSED" };
        const id = videoId || validation.videoIdFromUrl(current.url || "");
        if (current.status === "complete" && id) {
          const response = await askTab(tab.id, id);
          if (response?.ok) return { info: response.data, reason: null };
          // Trang đã tải xong mà vẫn không có dữ liệu: báo sớm thay vì chờ hết giờ.
          if (response && !response.ok) {
            emptyResponses += 1;
            if (emptyResponses >= 3) return { info: null, reason: "NO_SOURCE" };
          }
        }
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
      }
      return { info: null, reason: "TIMEOUT" };
    } finally {
      await chrome.tabs.remove(tab.id).catch(() => {});
    }
  }

  function canonicalFrom(parsed, api) {
    if (parsed.author && parsed.canonicalUrl) return parsed.canonicalUrl;
    if (api?.author && api?.videoId) return `https://www.tiktok.com/@${api.author}/video/${api.videoId}`;
    return parsed.canonicalUrl || parsed.url;
  }

  async function resolve(payload = {}) {
    const parsed = validation.parseVideoUrl(payload.url);
    if (!parsed.ok) return msg.fail(parsed.code, messageFor(parsed.code));

    if (parsed.videoId) {
      const cached = cache.get(parsed.videoId);
      if (cached && Date.now() - cached.at < CACHE_TTL) return msg.ok(cached.data);
    }

    const target = parsed.short ? parsed.url : parsed.canonicalUrl;
    // tikwm.com trả đủ bốn định dạng (HD, chuẩn, logo, âm thanh) và link của nó tải được
    // mà không cần Referer, nên đây là tuyến chính. Dữ liệu trang chỉ dùng khi dịch vụ lỗi.
    const api = await ns.proxyService.resolve(target, parsed.videoId || null);
    if (api.ok) {
      const data = api.data;
      return msg.ok(finish({
        videoId: parsed.videoId || data.videoId,
        author: data.author || null,
        nickname: data.nickname || null,
        duration: data.duration || null,
        canonicalUrl: canonicalFrom(parsed, data),
        api: data
      }));
    }

    // API lỗi: đọc dữ liệu trang để vẫn tải trực tiếp được. Tab đang mở là nhanh nhất.
    if (parsed.videoId) {
      const tabs = await chrome.tabs.query({ url: "https://www.tiktok.com/*" }).catch(() => []);
      for (const tab of tabs) {
        if (String(tab.url || "").includes(parsed.videoId)) {
          const response = await askTab(tab.id, parsed.videoId);
          if (response?.ok) return msg.ok(finish({ ...response.data, apiError: api.error?.message || null }));
        }
      }
    }

    const { info, reason } = await resolveInTab(target, parsed.videoId || null);
    if (info) return msg.ok(finish({ ...info, apiError: api.error?.message || null }));
    if (reason === "TIMEOUT") {
      return msg.fail("TIMEOUT", "TikTok phản hồi quá lâu. Hãy thử lại hoặc mở video trong một tab rồi phân tích lại.");
    }
    return msg.fail(
      "NO_SOURCE",
      `${api.error?.message || "Không lấy được link từ dịch vụ ngoài."} Không tìm thấy nguồn dự phòng trong trang TikTok. Hãy tải lại TikTok Tools tại chrome://extensions rồi thử phân tích lại.`
    );
  }

  function fileNameFor(entry, variantKey) {
    const author = validation.sanitizeFileName(entry.author || "tiktok", "tiktok");
    const id = validation.sanitizeFileName(entry.videoId, "video");
    const suffix = variantKey === "noLogo" ? "khong-logo" : variantKey;
    const ext = entry.rows?.[variantKey]?.ext || "mp4";
    return `TikTok/${author}_${id}_${suffix}.${ext}`;
  }

  async function persist() {
    try {
      await chrome.storage.session.set({ [SESSION_KEY]: [...jobs.values()] });
    } catch {
      // storage.session có thể không khả dụng ở bản rất cũ; job vẫn chạy trong bộ nhớ.
    }
  }

  async function restore() {
    try {
      const stored = await chrome.storage.session.get(SESSION_KEY);
      for (const job of stored?.[SESSION_KEY] || []) jobs.set(job.downloadId, job);
    } catch {
      // bỏ qua
    }
  }

  restore();

  async function beginDownload(url, filename) {
    return chrome.downloads.download({ url, filename, saveAs: false, conflictAction: "uniquify" });
  }

  // Lấy link qua tikwm.com: chỉ gọi khi người dùng thực sự yêu cầu tải.
  async function proxyUrlFor(job) {
    const proxied = await ns.proxyService.resolve(job.pageUrl, job.videoId);
    if (!proxied.ok) return { error: proxied.error };
    const url = ns.proxyService.urlFor(proxied.data, job.variant);
    if (!url) return { error: { code: "NO_SOURCE", message: "Dịch vụ ngoài không có định dạng này cho video." } };
    return {
      url,
      sizeBytes: job.variant === "hd" ? proxied.data.hdSize
        : job.variant === "logo" ? proxied.data.wmSize
          : job.variant === "mp3" ? null : proxied.data.size,
      duration: proxied.data.duration
    };
  }

  async function start(payload = {}) {
    let entry = payload.videoId ? cache.get(String(payload.videoId))?.data : null;
    if (!entry) {
      const resolved = await resolve({ url: payload.url });
      if (!resolved.ok) return resolved;
      entry = resolved.data;
    }
    const wanted = VARIANTS.includes(payload.variant) ? payload.variant : entry.defaultVariant || "noLogo";
    const variantKey = wanted;
    const row = entry.rows[variantKey];
    if (!row || !row.available) {
      return msg.fail("NO_SOURCE", row?.reason || "Định dạng này không khả dụng cho video đang chọn.");
    }
    for (const job of jobs.values()) {
      if (job.videoId === entry.videoId && job.variant === variantKey && job.state === "downloading") {
        return msg.fail("DUPLICATE", "Đang tải đúng định dạng này rồi, không tạo thêm bản sao.");
      }
    }
    const filename = fileNameFor(entry, variantKey);
    const job = {
      videoId: entry.videoId,
      variant: variantKey,
      // Chrome có thể đổi tên tệp thực tế; giữ tên yêu cầu riêng để đổi tuyến vẫn đúng.
      targetName: filename,
      filename,
      pageUrl: entry.canonicalUrl || payload.url || null,
      state: "downloading",
      startedAt: Date.now(),
      bytesReceived: 0,
      totalBytes: row.sizeBytes || 0,
      via: "direct",
      fallback: false,
      retryPending: false,
      routeError: null,
      error: null,
      errorCode: null
    };

    let url = row.url;
    if (row.via === "proxy") {
      const proxied = await proxyUrlFor(job);
      if (proxied.error) return msg.fail(proxied.error.code, proxied.error.message);
      url = proxied.url;
      job.via = "proxy";
      job.totalBytes = proxied.sizeBytes || 0;
    }
    let downloadId;
    try {
      downloadId = await beginDownload(url, filename);
    } catch (error) {
      return msg.fail("UNSUPPORTED", `Trình duyệt không nhận lệnh tải: ${error.message}`);
    }
    job.downloadId = downloadId;
    jobs.set(downloadId, job);
    persist();
    return msg.ok({ downloadId, filename, variant: variantKey, videoId: entry.videoId, via: job.via });
  }

  // CDN của TikTok trả 403 khi request không có Referer hợp lệ. Khi đó thử lại một lần
  // qua tikwm.com (dịch vụ ngoài) và nói rõ trong trạng thái là đã đổi tuyến.
  let retrying = false;

  async function retryThroughProxy(job) {
    if (retrying || job.fallback || job.retryPending || job.via === "proxy") return false;
    job.retryPending = true;
    retrying = true;
    try {
      const proxied = await proxyUrlFor(job);
      if (proxied.error) {
        job.fallback = true;
        job.errorCode = proxied.error.code;
        job.error = proxied.error.message;
        job.routeError = proxied.error.message;
        persist();
        return false;
      }
      let newId;
      try {
        newId = await beginDownload(proxied.url, job.targetName || job.filename);
      } catch (error) {
        job.fallback = true;
        job.errorCode = "UNSUPPORTED";
        job.error = `Không tải được qua tikwm.com: ${error.message}`;
        job.routeError = job.error;
        persist();
        return false;
      }
      const oldId = job.downloadId;
      jobs.delete(oldId);
      await chrome.downloads.erase({ id: oldId }).catch(() => {});
      job.downloadId = newId;
      job.via = "proxy";
      job.fallback = true;
      job.state = "downloading";
      job.error = null;
      job.errorCode = null;
      job.routeError = null;
      job.bytesReceived = 0;
      job.totalBytes = proxied.sizeBytes || 0;
      jobs.set(newId, job);
      persist();
      return true;
    } catch (error) {
      job.fallback = true;
      job.errorCode = "PROXY_FAILED";
      job.error = `Không đổi được tuyến tải: ${error?.message || error}`;
      job.routeError = job.error;
      persist();
      return false;
    } finally {
      retrying = false;
      job.retryPending = false;
    }
  }

  // CDN của TikTok trả 403 khi request không có Referer hợp lệ, mà cả downloads API
  // lẫn fetch từ extension đều không gắn được Referer. Nói thẳng lý do thay vì để mã lỗi.
  const ERROR_HINTS = {
    SERVER_FORBIDDEN: "TikTok CDN từ chối tải trực tiếp (403) và không tải được qua tikwm.com lần này. Thử lại sau hoặc dùng nút tải của TikTok.",
    SERVER_UNAUTHORIZED: "CDN yêu cầu đăng nhập. Đăng nhập TikTok rồi thử lại.",
    PROXY_FAILED: "Dịch vụ tikwm.com không trả được link. Kiểm tra mạng rồi thử lại.",
    SERVER_BAD_CONTENT: "CDN trả về nội dung không phải video. Thử phân tích lại.",
    NETWORK_FAILED: "Kết nối tới CDN bị ngắt. Kiểm tra mạng rồi thử lại.",
    NETWORK_TIMEOUT: "CDN phản hồi quá lâu. Thử lại sau.",
    FILE_NO_SPACE: "Ổ đĩa không đủ chỗ trống.",
    FILE_ACCESS_DENIED: "Không ghi được tệp vào thư mục Downloads.",
    USER_CANCELED: "Bạn đã huỷ tải.",
    CRASH: "Trình duyệt dừng tác vụ tải giữa chừng."
  };

  function describeError(code) {
    if (!code) return null;
    return ERROR_HINTS[code] || `Tải bị dừng: ${code}`;
  }

  async function status() {
    const items = await chrome.downloads.search({}).catch(() => []);
    const byId = new Map(items.map(item => [item.id, item]));
    const result = [];
    for (const job of jobs.values()) {
      const item = byId.get(job.downloadId);
      if (item) {
        job.state = item.state;
        job.bytesReceived = item.bytesReceived;
        job.totalBytes = item.totalBytes || job.totalBytes;
        job.filename = item.filename || job.filename;
        // Giữ lý do cụ thể đã ghi khi đổi tuyến (ví dụ PROXY_FAILED) thay vì ghi đè.
        if (item.error && !job.routeError) {
          job.errorCode = item.error;
          job.error = describeError(item.error);
        }
      }
      // onChanged có thể không tới nếu service worker vừa bị đánh thức, nên kiểm tra
      // cả ở đây: bị CDN chặn vì thiếu Referer thì đổi tuyến sang tikwm.com một lần.
      if (job.state === "interrupted" && job.errorCode === "SERVER_FORBIDDEN" && !job.fallback && !job.retryPending) {
        retryThroughProxy(job);
      }
      result.push({ ...job });
    }
    return msg.ok(result);
  }

  async function cancel(payload = {}) {
    const id = Number(payload.downloadId);
    if (!Number.isInteger(id) || !jobs.has(id)) return msg.fail("BAD_REQUEST", "Không tìm thấy tác vụ tải này.");
    await chrome.downloads.cancel(id).catch(() => {});
    jobs.delete(id);
    persist();
    return msg.ok({ cancelled: id });
  }

  chrome.downloads?.onChanged?.addListener(changes => {
    const job = jobs.get(changes.id);
    if (!job) return;
    if (changes.state) job.state = changes.state.current;
    if (changes.error) {
      job.errorCode = changes.error.current;
      job.error = describeError(changes.error.current);
    }
    if (changes.filename) job.filename = changes.filename.current;
    if (changes.bytesReceived) job.bytesReceived = changes.bytesReceived.current;
    persist();
    // Bị CDN chặn vì thiếu Referer: chuyển sang tikwm.com đúng một lần.
    if (job.state === "interrupted" && job.errorCode === "SERVER_FORBIDDEN" && !job.fallback) {
      retryThroughProxy(job);
    }
  });

  ns.downloadsService = Object.freeze({
    resolve,
    start,
    status,
    cancel,
    buildProxyRows,
    buildDirectRows,
    // Dùng cho kiểm thử và khi cần bỏ kết quả phân tích đã cache.
    clearCache() {
      cache.clear();
    }
  });
})();
