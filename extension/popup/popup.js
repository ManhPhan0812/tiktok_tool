(() => {
  "use strict";
  const ns = globalThis.TikTokTools;
  const { messages: msg, settingsApi } = ns;
  const types = msg.types;
  const $ = id => document.getElementById(id);

  const el = {
    connection: $("connection"),
    videoChip: $("video-chip"),
    mirror: $("mirror"),
    autoMirror: $("auto-mirror"),
    backgroundPlay: $("background-play"),
    backgroundNote: $("background-note"),
    cleanMode: $("clean-mode"),
    floatingButton: $("floating-button"),
    rate: $("rate"),
    rateValue: $("rate-value"),
    presets: $("presets"),
    eq: $("eq"),
    eqNote: $("eq-note"),
    capture: $("capture"),
    captureRegion: $("capture-region"),
    url: $("url"),
    analyze: $("analyze"),
    useCurrent: $("use-current"),
    downloadNote: $("download-note"),
    downloadResult: $("download-result"),
    downloadMeta: $("download-meta"),
    downloadRows: $("download-rows"),
    downloadProgress: $("download-progress"),
    error: $("error"),
    notice: $("notice"),
    theme: $("theme"),
    version: $("version")
  };

  let settings = settingsApi.defaults;
  let tabId;
  let status = null;
  let resolved = null;
  let inFlight = false;
  let rateTimer = null;
  let jobTimer = null;
  let analysisRevision = 0;
  let eqState = { supported: true, attached: false, preset: "off", missing: [], stale: false, lastError: null };
  let eqRetryTimer = null;
  let eqChanging = false;
  let eqRevision = 0;

  function showError(message) {
    el.error.textContent = message || "";
    el.error.hidden = !message;
  }

  function showNotice(message) {
    el.notice.textContent = message || "";
    el.notice.hidden = !message;
  }

  function formatRate(value) {
    return `${String(Number(value).toFixed(1)).replace(".", ",").replace(",0", "")}×`;
  }

  async function request(type, payload = {}) {
    const response = await chrome.runtime.sendMessage({
      type,
      payload: { ...payload, tabId },
      requestId: msg.nextRequestId("popup")
    });
    if (!msg.isResponse(response)) {
      throw Object.assign(new Error("Tiện ích không phản hồi kịp."), { code: "NO_RESPONSE" });
    }
    if (!response.ok) {
      throw Object.assign(new Error(response.error.message), {
        code: response.error.code,
        origin: response.error.origin
      });
    }
    return response.data;
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const light = theme === "light";
    el.theme.setAttribute("aria-pressed", String(light));
    el.theme.firstElementChild.textContent = light ? "☾" : "☀";
    el.theme.title = light ? "Chuyển sang giao diện tối" : "Chuyển sang giao diện sáng";
  }

  function renderSettings(value) {
    settings = settingsApi.normalizeSettings(value);
    el.autoMirror.checked = settings.autoMirror;
    el.backgroundPlay.checked = settings.backgroundPlay;
    el.cleanMode.checked = settings.cleanMode;
    el.floatingButton.checked = settings.showFloatingButton;
    el.eq.value = settings.equalizerPreset;
    applyTheme(settings.theme);
    el.rate.value = String(settings.playbackRate);
    updateRateUi(settings.playbackRate);
  }

  function updateRateUi(value) {
    const rate = settingsApi.clampRate(value);
    el.rateValue.textContent = formatRate(rate);
    for (const button of el.presets.querySelectorAll("button")) {
      button.setAttribute("aria-pressed", String(Number(button.dataset.rate) === rate));
    }
  }

  function setControlsEnabled(enabled) {
    // Equalizer tự quản trạng thái khoá trong renderEq vì phụ thuộc khả năng trình duyệt.
    for (const control of [el.autoMirror, el.backgroundPlay, el.cleanMode, el.floatingButton, el.rate]) {
      control.disabled = !enabled;
    }
    for (const button of el.presets.querySelectorAll("button")) button.disabled = !enabled;
  }

  function renderEq(data) {
    if (data) eqState = { ...eqState, ...data };
    const connected = Boolean(status);
    const supported = eqState.supported !== false;
    el.eq.disabled = eqChanging || !supported || !connected;
    if (eqChanging) return;
    if (!supported) {
      const missing = Array.isArray(eqState.missing) ? eqState.missing.filter(Boolean) : [];
      el.eqNote.textContent = "Trình duyệt không hỗ trợ";
      el.eq.title = [
        missing.length ? `Thiếu API: ${missing.join(", ")}.` : "",
        "Cần Chrome hoặc Edge 116 trở lên (có tabCapture và offscreen).",
        eqState.browser ? `Trình duyệt: ${eqState.browser}` : ""
      ].filter(Boolean).join(" ");
      return;
    }
    // Trạng thái cũ: giữ nguyên lựa chọn của người dùng, chỉ báo là chưa lấy được
    // trạng thái mới. Không khoá dropdown vì một lần không phản hồi.
    if (eqState.stale) {
      el.eqNote.textContent = "Không phản hồi · đang thử lại";
      el.eq.title = "Trình duyệt chưa phản hồi trạng thái Equalizer. Đang thử lại tự động; nếu kéo dài, hãy tải lại extension.";
      return;
    }
    el.eq.value = eqState.attached ? eqState.preset : "off";
    el.eqNote.textContent = eqState.attached
      ? `Đang bật · ${TikTokTools.equalizer.label(eqState.preset)}`
      : "Tắt · bản thử nghiệm";
    el.eq.title = "Cân bằng 5 dải 60 · 250 · 1k · 4k · 12k Hz. Lần đầu bật, extension chuyển âm thanh của tab qua bộ lọc.";
  }

  async function refreshEq() {
    if (eqChanging) return;
    const revision = eqRevision;
    try {
      const data = await request(types.EQ_STATUS);
      if (eqChanging || revision !== eqRevision) return;
      const canCapture = Boolean(data.workerCapture);
      renderEq({
        ...data,
        supported: data.offscreen !== false && canCapture,
        stale: false,
        lastError: null
      });
      clearTimeout(eqRetryTimer);
      eqRetryTimer = null;
    } catch (error) {
      if (eqChanging || revision !== eqRevision) return;
      // Không phản hồi KHÔNG đồng nghĩa trình duyệt không hỗ trợ: giữ nguyên kết luận
      // đã biết và chỉ đánh dấu là cũ, để người dùng không bị khoá vĩnh viễn.
      renderEq({ stale: true, lastError: error?.message || null });
      el.eq.title = [
        `Chưa lấy được trạng thái Equalizer: ${error?.message || "không rõ lỗi"}.`,
        "Đang thử lại tự động.",
        "Nếu kéo dài: tải lại extension trong chrome://extensions, rồi mở lại popup."
      ].join(" ");
      // Thử lại sớm một lần: service worker có thể vừa bị dừng và đang khởi động lại.
      if (!eqRetryTimer) {
        eqRetryTimer = setTimeout(() => {
          eqRetryTimer = null;
          refreshEq();
        }, 600);
      }
    }
  }

  function platformLabel(data) {
    const profile = TikTokTools.platform?.forUrl(data?.url || "");
    return profile ? profile.label : "TikTok";
  }

  function renderStatus(data) {
    status = data;
    const available = Boolean(data?.available);
    el.connection.textContent = `Đã kết nối tab ${platformLabel(data)}`;
    el.connection.dataset.state = "ok";
    el.videoChip.textContent = available ? "Đang xem video" : "Chưa thấy video";
    el.videoChip.dataset.state = available ? "ok" : "warn";
    el.mirror.disabled = !available;
    el.mirror.setAttribute("aria-pressed", String(Boolean(data?.mirrored)));
    el.mirror.textContent = data?.mirrored ? "Khôi phục chiều gốc" : "Lật video đang xem";
    el.capture.disabled = !available;
    setControlsEnabled(true);
    // Douyin feed/modal không có canonicalUrl (videoId không nằm trong
    // pathname) nhưng vẫn bắt được link từ trang đang xem, nên vẫn hiện nút.
    const isDouyinTab = ns.validation.isDouyinUrl(data?.url || "");
    el.useCurrent.hidden = !data?.canonicalUrl && !(isDouyinTab && data?.available);
    if (data?.canonicalUrl && !el.url.value && el.url.dataset.touched !== "1") {
      el.url.value = data.canonicalUrl;
    }
    if (typeof data?.rate === "number") {
      el.rate.value = String(data.rate);
      updateRateUi(data.rate);
    }
    if (data?.background?.blocked) {
      el.backgroundNote.textContent = "Trình duyệt đang chặn phát khi tab ẩn";
    } else {
      el.backgroundNote.textContent = "Tiếp tục phát khi chuyển tab";
    }
  }

  function renderDisconnected() {
    status = null;
    el.connection.textContent = "Chưa kết nối. Mở TikTok hoặc Douyin rồi mở lại công cụ.";
    el.connection.dataset.state = "warn";
    el.videoChip.textContent = "Chưa có video";
    el.videoChip.dataset.state = "warn";
    el.mirror.disabled = true;
    el.capture.disabled = true;
    el.captureRegion.hidden = true;
    el.useCurrent.hidden = true;
    setControlsEnabled(false);
    el.eq.disabled = true;
    el.eqNote.textContent = "Cần tab TikTok hoặc Douyin để bật";
  }

  async function poll() {
    if (document.hidden || inFlight) return;
    inFlight = true;
    try {
      try {
        renderStatus(await request(types.PLAYER_STATUS));
      } catch (error) {
        if (error.code === "NO_RECEIVER" || error.code === "NO_TAB" || error.code === "NO_RESPONSE") {
          renderDisconnected();
        } else {
          showError(error.message);
        }
      }
      // Trạng thái Equalizer phải cập nhật độc lập: trước đây nó nằm chung try với
      // PLAYER_STATUS nên chỉ cần trạng thái video lỗi là ô Equalizer đứng nguyên ở
      // "Không phản hồi · đang thử lại" mãi, dù service worker đã trả lời được.
      if (status) await refreshEq();
    } finally {
      inFlight = false;
    }
  }

  async function persist(patch) {
    showError("");
    try {
      renderSettings(await request(types.SETTINGS_PATCH, { patch }));
    } catch (error) {
      showError(error.message);
      renderSettings(settings);
    }
  }

  async function applyRate(value, persistOption = true) {
    const rate = settingsApi.clampRate(value);
    updateRateUi(rate);
    try {
      renderStatus(await request(types.SPEED_SET, { rate }));
    } catch (error) {
      if (error.code !== "NO_VIDEO") showError(error.message);
    }
    if (persistOption) await persist({ playbackRate: rate });
  }

  el.mirror.addEventListener("click", async () => {
    el.mirror.disabled = true;
    showError("");
    try {
      renderStatus(await request(types.MIRROR_TOGGLE));
    } catch (error) {
      showError(error.message);
    } finally {
      el.mirror.disabled = !status?.available;
    }
  });

  el.autoMirror.addEventListener("change", () => persist({ autoMirror: el.autoMirror.checked }));
  el.backgroundPlay.addEventListener("change", () => persist({ backgroundPlay: el.backgroundPlay.checked }));
  el.cleanMode.addEventListener("change", () => persist({ cleanMode: el.cleanMode.checked }));
  el.floatingButton.addEventListener("change", () => persist({ showFloatingButton: el.floatingButton.checked }));
  el.theme.addEventListener("click", () => persist({ theme: settings.theme === "dark" ? "light" : "dark" }));

  el.rate.addEventListener("input", () => {
    const rate = settingsApi.clampRate(el.rate.value);
    updateRateUi(rate);
    clearTimeout(rateTimer);
    rateTimer = setTimeout(() => {
      request(types.SPEED_SET, { rate }).catch(error => {
        if (error.code !== "NO_VIDEO") showError(error.message);
      });
    }, 120);
  });
  el.rate.addEventListener("change", () => applyRate(el.rate.value, true));

  for (const button of el.presets.querySelectorAll("button")) {
    button.addEventListener("click", () => {
      el.rate.value = button.dataset.rate;
      applyRate(button.dataset.rate, true);
    });
  }

  async function capture(mode) {
    const target = mode === "region" ? el.captureRegion : el.capture;
    target.disabled = true;
    showError("");
    showNotice("");
    try {
      const result = await request(types.CAPTURE_FRAME, { mode, videoId: status?.videoId });
      showNotice(`Đã lưu ${result.filename} (${result.width}×${result.height}).`);
      el.captureRegion.hidden = true;
    } catch (error) {
      showError(error.message);
      if (mode === "frame" && (error.code === "NO_FRAME" || error.code === "CAPTURE_FAILED")) {
        el.captureRegion.hidden = false;
        el.captureRegion.disabled = false;
      }
    } finally {
      target.disabled = !status?.available;
    }
  }

  el.capture.addEventListener("click", () => capture("frame"));
  el.captureRegion.addEventListener("click", () => capture("region"));

  const variantLabels = {
    hd: "Video HD",
    noLogo: "Video chuẩn (H.264)",
    logo: "Video có logo",
    mp3: "Audio MP3"
  };

  function formatDuration(seconds) {
    const total = Math.round(Number(seconds) || 0);
    if (!total) return "";
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  }

  function renderDownload(data) {
    resolved = data;
    el.downloadResult.hidden = false;
    el.downloadNote.hidden = true;
    const parts = [];
    if (data.author) parts.push(`@${data.author}`);
    parts.push(data.videoId);
    if (data.duration) parts.push(formatDuration(data.duration));
    parts.push(`${data.availableCount} lựa chọn khả dụng`);
    if (data.source) parts.push(data.source === "tikwm" ? "link từ tikwm.com" : "link từ trang");
    el.downloadMeta.textContent = parts.join(" · ");
    el.downloadRows.replaceChildren();
    for (const key of ["hd", "noLogo", "logo", "mp3"]) {
      const row = data.rows[key];
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "row-download" + (key === data.defaultVariant ? " primary" : "");
      button.dataset.variant = key;
      const name = document.createElement("span");
      name.textContent = variantLabels[key];
      const detail = document.createElement("span");
      detail.className = "detail";
      if (row.available) {
        const size = ns.validation.formatBytes(row.sizeBytes);
        detail.textContent = [
          row.via === "proxy" ? "qua tikwm.com" : null,
          row.height ? `${row.height}p` : null,
          size || (row.via === "proxy" ? null : "Chưa xác định dung lượng")
        ].filter(Boolean).join(" · ");
        if (row.note) button.title = row.note;
        button.addEventListener("click", () => startDownload(key));
      } else {
        button.disabled = true;
        button.title = row.reason;
        detail.className = "detail reason";
        detail.textContent = row.reason;
      }
      button.append(name, detail);
      item.append(button);
      el.downloadRows.append(item);
    }
  }

  // Douyin: các bản do máy chủ trả về (1080p/720p/540p…), không dùng bốn khoá của
  // TikTok vì ý nghĩa khác nhau. Bản bị khoá hiện lý do thay vì giả vờ tải được.
  function renderDouyin(data) {
    resolved = data;
    el.downloadResult.hidden = false;
    el.downloadNote.hidden = true;
    const parts = ["Douyin"];
    if (data.provider) parts.push(`qua ${data.provider}`);
    if (data.videoId) parts.push(data.videoId);
    parts.push(`${data.availableCount} bản tải được`);
    if (data.title) parts.push(String(data.title).slice(0, 60));
    el.downloadMeta.textContent = parts.join(" · ");
    el.downloadRows.replaceChildren();
    for (const row of data.rows || []) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "row-download" + (row.key === data.defaultVariant ? " primary" : "");
      button.dataset.variant = row.key;
      const name = document.createElement("span");
      name.textContent = row.available ? row.label : `${row.label} (khoá)`;
      const detail = document.createElement("span");
      detail.className = "detail";
      if (row.available) {
        detail.textContent = [row.sizeStr || ns.validation.formatBytes(row.sizeBytes), `qua ${data.provider || "máy chủ"}`]
          .filter(Boolean).join(" · ");
        button.addEventListener("click", () => startDouyinDownload(row.key));
      } else {
        button.disabled = true;
        detail.className = "detail reason";
        detail.textContent = row.note || "Không có link tải.";
        button.title = detail.textContent;
      }
      button.append(name, detail);
      item.append(button);
      el.downloadRows.append(item);
    }
  }

  async function startDouyinDownload(variant) {
    if (!resolved) return;
    showError("");
    showNotice("");
    el.downloadProgress.hidden = false;
    el.downloadProgress.textContent = "Đang bắt đầu tải…";
    try {
      const job = await request(types.DOUYIN_DOWNLOAD, {
        url: el.url.value.trim(),
        variant,
        videoId: resolved.videoId
      });
      watchDouyinDownload(job.downloadId, variant);
    } catch (error) {
      el.downloadProgress.hidden = true;
      showError(error.message);
    }
  }

  // Tải Douyin đi thẳng qua chrome.downloads (link CDN của máy chủ), nên theo dõi bằng
  // chính API đó thay vì hàng đợi job của luồng TikTok.
  function watchDouyinDownload(downloadId, variant) {
    clearInterval(jobTimer);
    const label = resolved?.rows?.find(row => row.key === variant)?.label || "video";
    jobTimer = setInterval(async () => {
      try {
        const [item] = await chrome.downloads.search({ id: downloadId });
        if (!item) {
          clearInterval(jobTimer);
          el.downloadProgress.hidden = true;
          return;
        }
        if (item.state === "complete") {
          clearInterval(jobTimer);
          el.downloadProgress.hidden = true;
          const saved = String(item.filename || "").split(/[\\/]/).pop();
          showNotice(`Đã lưu ${saved || label}`);
          return;
        }
        if (item.state === "interrupted") {
          clearInterval(jobTimer);
          el.downloadProgress.hidden = true;
          showError("Tải Douyin thất bại: link CDN có thể đã hết hạn, bấm Phân tích lại rồi tải ngay.");
          return;
        }
        const received = ns.validation.formatBytes(item.bytesReceived);
        const total = ns.validation.formatBytes(item.totalBytes);
        el.downloadProgress.textContent = `Đang tải ${label}${received ? ` · ${received}` : ""}${total ? ` / ${total}` : ""}…`;
      } catch {
        clearInterval(jobTimer);
        el.downloadProgress.hidden = true;
      }
    }, 600);
  }

  async function startDownload(variant) {
    if (!resolved) return;
    showError("");
    showNotice("");
    el.downloadProgress.hidden = false;
    el.downloadProgress.textContent = "Đang bắt đầu tải…";
    try {
      const job = await request(types.DOWNLOAD_START, {
        url: el.url.value.trim(),
        videoId: resolved.videoId,
        variant
      });
      watchJob(job.downloadId, resolved.videoId, variant);
    } catch (error) {
      el.downloadProgress.hidden = true;
      showError(error.message);
    }
  }

  async function watchJob(downloadId, videoId, variant) {
    clearInterval(jobTimer);
    let current = downloadId;
    jobTimer = setInterval(async () => {
      try {
        const jobs = await request(types.DOWNLOAD_STATUS);
        // Khi tuyến trực tiếp bị CDN chặn, background tự chuyển sang tikwm.com và tạo
        // một downloadId mới; tìm theo video + định dạng để theo dõi tiếp.
        const job = jobs.find(entry => entry.downloadId === current)
          || jobs.find(entry => entry.videoId === videoId && entry.variant === variant);
        if (!job) {
          clearInterval(jobTimer);
          el.downloadProgress.hidden = true;
          return;
        }
        current = job.downloadId;
        if (job.state === "complete") {
          clearInterval(jobTimer);
          el.downloadProgress.hidden = true;
          showNotice(`Đã lưu ${job.filename}${job.via === "proxy" ? " (qua tikwm.com)" : ""}`);
        } else if (job.state === "interrupted") {
          if (job.retryPending || (job.errorCode === "SERVER_FORBIDDEN" && !job.fallback)) {
            el.downloadProgress.textContent = "CDN chặn tải trực tiếp, đang thử qua tikwm.com…";
            return;
          }
          clearInterval(jobTimer);
          el.downloadProgress.hidden = true;
          showError(job.error || "Tải thất bại. Hãy phân tích lại rồi thử lại.");
        } else {
          const received = ns.validation.formatBytes(job.bytesReceived) || "0 B";
          const total = job.totalBytes ? ` / ${ns.validation.formatBytes(job.totalBytes)}` : "";
          const route = job.via === "proxy" ? " (qua tikwm.com)" : "";
          el.downloadProgress.textContent = `Đang tải ${variantLabels[job.variant]}${route} ${received}${total}…`;
        }
      } catch (error) {
        clearInterval(jobTimer);
        el.downloadProgress.hidden = true;
        showError(error.message);
      }
    }, 800);
  }

  async function analyze() {
    if (el.analyze.disabled) return;
    const url = el.url.value.trim();
    // Ô trống trên tab Douyin nghĩa là bắt link video đang xem từ chính trang
    // (background sẽ hỏi content script trước, rồi mới fallback sang native
    // và ttget); các trường hợp khác vẫn bắt buộc phải dán link.
    const isDouyin = url
      ? ns.validation.isDouyinUrl(url)
      : ns.validation.isDouyinUrl(status?.url || "");
    if (!url && !isDouyin) {
      showError("Hãy dán URL TikTok hoặc Douyin trước khi phân tích.");
      return;
    }
    const revision = ++analysisRevision;
    resolved = null;
    el.downloadResult.hidden = true;
    el.downloadNote.hidden = false;
    el.downloadNote.textContent = isDouyin
      ? (url ? "Đang phân tích Douyin…" : "Đang bắt link video Douyin đang xem…")
      : "Đang lấy liên kết tải từ TikWM…";
    el.downloadProgress.hidden = true;
    el.analyze.disabled = true;
    el.analyze.textContent = "Đang phân tích…";
    el.analyze.setAttribute("aria-busy", "true");
    showError("");
    showNotice("");
    const loadData = () => (isDouyin
      ? request(types.DOUYIN_ANALYZE, { url })
      : request(types.DOWNLOAD_RESOLVE, { url }));
    try {
      let data;
      try {
        data = await loadData();
      } catch (error) {
        // Endpoint tải Douyin do người dùng đặt nằm ngoài host_permissions: xin quyền
        // theo đúng origin đó một lần rồi thử lại, không xin quyền cho mọi trang.
        if (error.code !== "PERMISSION_REQUIRED" || !error.origin) throw error;
        const granted = await chrome.permissions
          .request({ origins: [`${error.origin}/*`] })
          .catch(() => false);
        if (!granted) {
          throw Object.assign(new Error(`Chưa được cấp quyền truy cập ${error.origin}.`), { code: "PERMISSION_REQUIRED" });
        }
        el.downloadNote.textContent = "Đã cấp quyền, đang gọi lại máy chủ tải Douyin…";
        data = await loadData();
      }
      if (revision !== analysisRevision) return;
      if (isDouyin) renderDouyin(data); else renderDownload(data);
    } catch (error) {
      if (revision !== analysisRevision) return;
      resolved = null;
      el.downloadResult.hidden = true;
      el.downloadNote.hidden = false;
      el.downloadNote.textContent = "Chưa lấy được nguồn tải. Bạn có thể bấm Phân tích để thử lại.";
      showError(error.message);
    } finally {
      if (revision === analysisRevision) {
        el.analyze.disabled = false;
        el.analyze.textContent = "Phân tích";
        el.analyze.removeAttribute("aria-busy");
      }
    }
  }

  function invalidateAnalysis() {
    analysisRevision++;
    clearInterval(jobTimer);
    el.analyze.disabled = false;
    el.analyze.textContent = "Phân tích";
    el.analyze.removeAttribute("aria-busy");
    el.url.dataset.touched = "1";
    resolved = null;
    el.downloadResult.hidden = true;
    el.downloadNote.hidden = false;
    el.downloadNote.textContent = "Phân tích link để xem những bản tải được. Không tự tải khi vừa dán link.";
    el.downloadProgress.hidden = true;
    showError("");
    showNotice("");
  }

  el.analyze.addEventListener("click", analyze);
  el.url.addEventListener("input", invalidateAnalysis);
  el.url.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      analyze();
    }
  });
  el.useCurrent.addEventListener("click", () => {
    if (status?.canonicalUrl) {
      invalidateAnalysis();
      el.url.value = status.canonicalUrl;
      el.url.dataset.touched = "1";
      analyze();
      return;
    }
    // Tab Douyin không có canonicalUrl (feed/modal): phân tích với ô trống
    // để background bắt link từ trang đang xem.
    if (status?.available && ns.validation.isDouyinUrl(status?.url || "")) {
      invalidateAnalysis();
      el.url.value = "";
      analyze();
    }
  });

  el.eq.addEventListener("change", async () => {
    if (eqChanging) return;
    const preset = el.eq.value;
    eqChanging = true;
    eqRevision++;
    clearTimeout(eqRetryTimer);
    eqRetryTimer = null;
    el.eq.disabled = true;
    el.eqNote.textContent = preset === "off" ? "Đang tắt…" : "Đang bật…";
    showError("");
    try {
      if (preset === "off") {
        const result = await request(types.EQ_STOP);
        renderEq({
          supported: eqState.supported,
          attached: Boolean(result?.attached),
          preset: result?.preset || "off",
          stale: false
        });
        return;
      }
      const result = await request(types.EQ_START, { preset, tabId });
      renderEq({
        supported: eqState.supported,
        attached: Boolean(result?.attached),
        preset: result?.preset || preset,
        stale: false
      });
      if (!result?.attached) {
        showError("Equalizer chưa bật được trên tab này. Hãy mở popup bằng cách bấm icon extension.");
      }
    } catch (error) {
      showError(error.message);
      renderEq({ supported: eqState.supported, attached: false, preset: "off", stale: false });
    } finally {
      eqChanging = false;
      eqRevision++;
      await refreshEq();
    }
  });

  async function init() {
    const manifest = chrome.runtime.getManifest();
    el.version.textContent = `v${manifest.version}`;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      tabId = tab?.id;
    } catch {
      tabId = undefined;
    }
    try {
      renderSettings(await request(types.SETTINGS_READ));
    } catch (error) {
      showError(error.message);
      renderSettings(settingsApi.defaults);
    }
    await poll();
    setInterval(poll, 900);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) poll();
    });
  }

  init();
})();
