(() => {
  "use strict";
  const ns = globalThis.TikTokTools;
  const { messages: msg, player, mirror, speed, cleanMode, backgroundPlay, capture, settingsApi } = ns;
  const types = msg.types;

  const videos = new Set();
  let settings = settingsApi.defaults;
  let activeVideo = null;
  let frame = null;
  let settingsRevision = 0;
  let lastStoredRate = settings.playbackRate;

  const host = document.createElement("div");
  host.id = "tiktok-tools-control";
  host.style.cssText = "all:initial!important;position:fixed!important;right:24px!important;bottom:24px!important;z-index:2147483647!important;";
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = `
    <style>
      :host([hidden]) { display: none !important; }
      button { all: unset; box-sizing: border-box; display: flex; align-items: center;
        gap: 9px; padding: 12px 16px; border: 1px solid #ffffff36; border-radius: 14px;
        background: #171820; color: #fff; box-shadow: 0 5px 24px #0005;
        cursor: pointer; font: 600 14px/1.4 system-ui, sans-serif; }
      button:hover { background: #292c37; }
      button:focus-visible { outline: 3px solid #5de2d4; outline-offset: 3px; }
      button[aria-pressed="true"] { border-color: #5de2d4; color: #8cf1e6; }
      img { width: 24px; height: 24px; padding: 3px; box-sizing: border-box;
        border-radius: 6px; background: #f6ece1; object-fit: contain; flex: none; }
    </style>
    <button type="button" aria-pressed="false" title="Lật ngang video đang xem (Alt + Shift + H)">
      <img src="${chrome.runtime.getURL("assets/icons/icon-32.png")}" width="24" height="24" alt="" aria-hidden="true"><span>Lật video</span>
    </button>`;
  const button = shadow.querySelector("button");
  const label = shadow.querySelector("span");
  document.documentElement.append(host);

  function refresh() {
    frame = null;
    const present = new Set(player.mediaElements());
    for (const video of videos) {
      if (!present.has(video)) {
        visibility.unobserve(video);
        mirror.forget(video);
        videos.delete(video);
      }
    }
    let best = 0;
    activeVideo = null;
    for (const video of present) {
      if (!videos.has(video)) {
        videos.add(video);
        visibility.observe(video);
      }
      mirror.apply(video, player.renderTargets(video));
      speed.apply(video);
      const value = player.score(video);
      if (value > best) {
        best = value;
        activeVideo = video;
      }
    }
    updateControl();
  }

  function updateControl() {
    const fullscreen = document.fullscreenElement;
    const parent = fullscreen && !(fullscreen instanceof HTMLVideoElement) ? fullscreen : document.documentElement;
    if (host.parentNode !== parent) parent.append(host);
    host.hidden = !settings.showFloatingButton || !activeVideo || fullscreen instanceof HTMLVideoElement;
    const mirrored = mirror.isMirrored(activeVideo);
    button.setAttribute("aria-pressed", String(mirrored));
    label.textContent = mirrored ? "Khôi phục chiều gốc" : "Lật video";
  }

  function schedule() {
    if (frame === null) frame = requestAnimationFrame(refresh);
  }

  function refreshNow() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    refresh();
  }

  function status() {
    const video = activeVideo;
    return {
      available: Boolean(video),
      mirrored: mirror.isMirrored(video),
      videoCount: videos.size,
      rate: speed.current(),
      enhanced: video ? player.isEnhanced(video) : false,
      videoId: player.videoId(),
      canonicalUrl: player.canonicalUrl(),
      background: backgroundPlay.state(),
      cleanMode: cleanMode.isEnabled(),
      settings: { ...settings },
      url: location.href,
      visibility: document.visibilityState
    };
  }

  function toggle(video = activeVideo) {
    if (!video) return status();
    mirror.toggle(video, player.renderTargets(video));
    updateControl();
    return status();
  }

  async function captureFrame(payload = {}) {
    const video = activeVideo;
    if (!video) {
      throw Object.assign(new Error("Chưa có video nào đang xem."), { code: "NO_VIDEO" });
    }
    let frame;
    let source = "video-frame";
    if (payload.mode === "region") {
      const rect = player.visibleRect(video);
      const screenshot = await chrome.runtime.sendMessage({
        type: types.CAPTURE_REGION,
        payload: { rect },
        requestId: msg.nextRequestId("cap")
      });
      if (!screenshot?.ok) {
        throw Object.assign(new Error(screenshot?.error?.message || "Không chụp được vùng video."), {
          code: screenshot?.error?.code || "CAPTURE_FAILED"
        });
      }
      frame = await capture.cropTab(screenshot.data.dataUrl, rect, window.devicePixelRatio,
        { width: innerWidth, height: innerHeight });
      source = "tab-region";
    } else {
      try {
        frame = await capture.fromVideo(video, mirror.isMirrored(video));
      } catch (error) {
        // Popup sẽ đề nghị phương án thay thế đúng bản chất.
        throw Object.assign(error, { fallback: true });
      }
    }
    const filename = frameName(source);
    await saveImage(frame.dataUrl, filename);
    return { filename, width: frame.width, height: frame.height, source };
  }

  function frameName(source) {
    const id = ns.validation.sanitizeFileName(player.videoId() || "video", "video");
    const suffix = source === "tab-region" ? "vung-hien-thi" : "khung-hinh";
    const now = new Date();
    const pad = value => String(value).padStart(2, "0");
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `tiktok_${id}_${stamp}_${suffix}.png`;
  }

  // Tên tệp của thẻ <a download> được trình duyệt tôn trọng, khác với data: URL
  // truyền qua chrome.downloads.download (bị đổi thành download.png). Dùng blob URL
  // vì Chrome chặn tải trực tiếp data: URL từ trang.
  async function saveImage(dataUrl, filename) {
    const blob = await (await fetch(dataUrl)).blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    link.style.display = "none";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function applySettings() {
    mirror.configure(settings.autoMirror, videos, player.renderTargets);
    cleanMode.apply(settings.cleanMode);
    if (settings.playbackRate !== lastStoredRate) {
      lastStoredRate = settings.playbackRate;
      speed.configure(settings.playbackRate, videos);
    }
    backgroundPlay.configure(settings.backgroundPlay, () => activeVideo);
    schedule();
  }

  function onSettings(changes, area) {
    if (area !== "local" || !changes[settingsApi.storageKey]) return;
    settingsRevision += 1;
    settings = settingsApi.normalizeSettings(changes[settingsApi.storageKey].newValue);
    applySettings();
  }

  function handleMessage(message, sendResponse) {
    const type = message?.type;
    const payload = message?.payload ?? {};
    switch (type) {
      case types.PLAYER_STATUS:
        refreshNow();
        sendResponse(msg.ok(status()));
        return true;
      case types.MIRROR_TOGGLE:
        refreshNow();
        sendResponse(activeVideo
          ? msg.ok(toggle())
          : msg.fail("NO_VIDEO", "Chưa thấy video đang xem trên trang."));
        return true;
      case types.SPEED_SET: {
        const rate = speed.set(payload.rate, videos);
        sendResponse(msg.ok({ ...status(), rate }));
        return true;
      }
      case types.RESOLVE_VIDEO: {
        const wanted = payload.videoId || player.videoId();
        const info = wanted ? ns.pageState.describe(wanted) : null;
        if (!info) {
          sendResponse(msg.fail("NO_SOURCE", "Không tìm thấy dữ liệu video của trang này."));
        } else {
          sendResponse(msg.ok({ ...info, pageVideoId: player.videoId(), pageUrl: location.href }));
        }
        return true;
      }
      case types.CAPTURE_FRAME:
        captureFrame(payload)
          .then(result => sendResponse(msg.ok(result)))
          .catch(error => sendResponse(msg.fail(error.code || "CAPTURE_FAILED", error.message)));
        return true;
      default:
        return false;
    }
  }

  const visibility = new IntersectionObserver(schedule, { threshold: [0, 0.25, 0.5, 0.75, 1] });
  const mutations = new MutationObserver(records => {
    if (records.some(record => {
      if (record.target === host) return false;
      if (record.type === "childList" || record.attributeName === "src") return true;
      return record.target.matches?.("video") || record.target.closest?.("tt-vod-sr-wrap")
        || Boolean(record.target.querySelector?.("video"));
    })) schedule();
  });
  mutations.observe(document.documentElement, {
    childList: true, subtree: true, attributes: true, attributeFilter: ["src", "style", "class", "hidden"]
  });
  button.addEventListener("click", () => toggle());
  document.addEventListener("scroll", schedule, { passive: true, capture: true });
  window.addEventListener("resize", schedule, { passive: true });
  document.addEventListener("fullscreenchange", schedule);
  for (const event of ["play", "pause", "loadedmetadata", "loadstart", "emptied"]) {
    document.addEventListener(event, schedule, true);
  }
  document.addEventListener("ratechange", speed.onRateChange, true);
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => handleMessage(message, sendResponse));

  // Đăng ký listener trước khi đọc để không mất thay đổi settings đồng thời.
  const initialRevision = settingsRevision;
  chrome.storage.onChanged.addListener(onSettings);
  chrome.storage.local.get(settingsApi.storageKey).then(result => {
    if (settingsRevision !== initialRevision) return;
    settings = settingsApi.normalizeSettings(result[settingsApi.storageKey]);
    // Giữ mốc cũ để applySettings thật sự áp dụng tốc độ đã lưu.
    applySettings();
  }).catch(() => {
    // Giá trị mặc định vẫn cho phép lật video thủ công.
    applySettings();
  });
  refresh();
})();
