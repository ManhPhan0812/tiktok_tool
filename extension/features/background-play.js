(() => {
  "use strict";
  const ns = globalThis.TikTokTools = globalThis.TikTokTools || {};

  let enabled = false;
  let getVideo = () => null;
  let onChange = () => {};
  let attached = false;
  let backgroundAt = 0;
  let snapshot = null;
  let attempts = 0;
  let timer = null;
  let blocked = false;

  // Tab bị coi là "nền" khi bị ẩn hoặc cửa sổ không còn focus. Dùng cả hai tín hiệu
  // vì một số nền tảng chỉ đổi visibilityState, số khác chỉ đổi focus.
  function inBackground() {
    return document.visibilityState === "hidden" || !document.hasFocus();
  }

  function state() {
    return { enabled, active: Boolean(enabled && snapshot), blocked };
  }

  function notify() {
    try {
      onChange(state());
    } catch {
      // Popup đã đóng; trạng thái sẽ được đọc lại khi mở.
    }
  }

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function resetSession() {
    backgroundAt = 0;
    snapshot = null;
    attempts = 0;
    clearTimer();
    blocked = false;
  }

  async function resume(video) {
    if (!enabled || !snapshot || snapshot.video !== video) return;
    try {
      const result = video.play();
      if (result && typeof result.then === "function") await result;
      blocked = false;
    } catch {
      // Trình duyệt có thể chặn phát khi tab ẩn. Không tự tắt tiếng để lách chính sách.
      blocked = true;
    }
    notify();
  }

  function onBackground() {
    if (!enabled || !inBackground()) return;
    backgroundAt = Date.now();
    const video = getVideo();
    snapshot = video ? { video, wanted: !video.paused } : null;
    attempts = 0;
    blocked = false;
  }

  function onForeground() {
    if (!enabled) return;
    resetSession();
    notify();
  }

  function onVisibility() {
    if (document.visibilityState === "hidden") onBackground();
    else onForeground();
  }

  function onPause(event) {
    if (!enabled) return;
    const video = event.target;
    if (!(video instanceof HTMLVideoElement)) return;
    // Pause khi người dùng vẫn đang xem là ý của người dùng: không can thiệp.
    if (!inBackground()) return;
    if (!backgroundAt) backgroundAt = Date.now();
    if (!snapshot) snapshot = { video, wanted: true };
    if (snapshot.video !== video || !snapshot.wanted) return;
    if (attempts >= 3) return;
    attempts += 1;
    clearTimer();
    // Chờ một nhịp để trang hoàn tất xử lý visibility của nó.
    timer = setTimeout(() => resume(video), 150 * attempts);
  }

  function attach() {
    if (attached) return;
    attached = true;
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("pause", onPause, true);
    window.addEventListener("blur", onBackground);
    window.addEventListener("focus", onForeground);
  }

  function detach() {
    if (!attached) return;
    attached = false;
    document.removeEventListener("visibilitychange", onVisibility);
    document.removeEventListener("pause", onPause, true);
    window.removeEventListener("blur", onBackground);
    window.removeEventListener("focus", onForeground);
    resetSession();
  }

  ns.backgroundPlay = Object.freeze({
    configure(value, videoProvider, listener) {
      enabled = Boolean(value);
      if (videoProvider) getVideo = videoProvider;
      if (listener) onChange = listener;
      if (enabled) attach();
      else detach();
      notify();
    },
    state,
    cancel: detach
  });
})();
