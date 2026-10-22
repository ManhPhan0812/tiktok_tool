(() => {
  "use strict";
  const ns = globalThis.TikTokTools = globalThis.TikTokTools || {};
  const settings = ns.settingsApi;

  let rate = settings.defaults.playbackRate;
  let applying = false;

  function apply(video) {
    const desired = rate;
    if (Math.abs(video.playbackRate - desired) > 0.001) {
      applying = true;
      try {
        // Giữ cao độ khi đổi tốc độ nếu trình duyệt hỗ trợ.
        if ("preservesPitch" in video) video.preservesPitch = true;
        else if ("mozPreservesPitch" in video) video.mozPreservesPitch = true;
        video.defaultPlaybackRate = desired;
        video.playbackRate = desired;
      } finally {
        applying = false;
      }
    } else if (Math.abs(video.defaultPlaybackRate - desired) > 0.001) {
      video.defaultPlaybackRate = desired;
    }
  }

  function set(value, videos) {
    rate = settings.clampRate(value);
    for (const video of videos) apply(video);
    return rate;
  }

  function configure(value, videos) {
    const next = settings.clampRate(value);
    if (next === rate) return rate;
    rate = next;
    for (const video of videos) apply(video);
    return rate;
  }

  // Thanh tốc độ gốc của TikTok có thể đổi playbackRate. Khi đó ghi nhận vào phiên
  // thay vì liên tục ghi đè, tránh tranh chấp hai chiều.
  function onRateChange(event) {
    if (applying) return;
    const video = event.target;
    if (!(video instanceof HTMLVideoElement)) return;
    if (Math.abs(video.playbackRate - rate) < 0.001) return;
    rate = settings.clampRate(video.playbackRate);
  }

  ns.speed = Object.freeze({
    apply,
    set,
    configure,
    onRateChange,
    current: () => rate,
    isApplying: () => applying
  });
})();
