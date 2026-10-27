(() => {
  "use strict";
  const ns = globalThis.TikTokTools = globalThis.TikTokTools || {};
  const platform = ns.platform.current();
  const selectors = ns.selectorsFor(platform.id);

  function mediaElements(root = document) {
    return [...root.querySelectorAll("video")];
  }

  // TikTok có thể vẽ khung hình lên canvas trong `tt-vod-sr-wrap` bên cạnh <video>.
  // Renderer là các phần tử hiển thị thật sự; không gồm controls hay canvas khác.
  // Douyin không có lớp này (`renderer` là null) nên chỉ lật chính <video>.
  function renderTargets(video) {
    const wrappers = selectors.renderer
      ? [...(video.parentElement?.children ?? [])].filter(element => element.matches(selectors.renderer))
      : [];
    return [video, ...wrappers];
  }

  function isEnhanced(video) {
    return renderTargets(video).length > 1;
  }

  function union(a, b) {
    const left = Math.min(a.left, b.left);
    const top = Math.min(a.top, b.top);
    const right = Math.max(a.right, b.right);
    const bottom = Math.max(a.bottom, b.bottom);
    return { left, top, right, bottom, width: right - left, height: bottom - top,
      x: left, y: top };
  }

  // Hình chữ nhật của video đang hiển thị: hợp của các renderer có kích thước thật.
  function visibleRect(video) {
    let rect = null;
    for (const target of renderTargets(video)) {
      const value = target.getBoundingClientRect();
      if (value.width < 40 || value.height < 40) continue;
      rect = rect ? union(rect, value) : value;
    }
    return rect ?? video.getBoundingClientRect();
  }

  function scoreTarget(target, video) {
    const rect = target.getBoundingClientRect();
    const fullscreen = document.fullscreenElement;
    if (fullscreen && fullscreen !== target && !fullscreen.contains(target)) return 0;
    if (rect.width < 80 || rect.height < 80) return 0;
    const style = getComputedStyle(target);
    if (style.visibility !== "visible" || Number(style.opacity) === 0 || style.display === "none") return 0;
    const width = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
    const height = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
    const area = width * height;
    const distance = Math.abs((Math.max(rect.top, 0) + Math.min(rect.bottom, innerHeight)) / 2 - innerHeight / 2);
    return area / (1 + distance / innerHeight) * (video.paused ? 1 : 1.25);
  }

  function score(video) {
    return Math.max(0, ...renderTargets(video).map(target => scoreTarget(target, video)));
  }

  function pick(videos) {
    let best = 0;
    let chosen = null;
    for (const video of videos) {
      const value = score(video);
      if (value > best) {
        best = value;
        chosen = video;
      }
    }
    return chosen;
  }

  function videoId() {
    // Douyin mở video bằng modal (?modal_id=) hoặc trang feed mà pathname
    // không chứa /video/<id>; trước đây những trường hợp đó luôn trả null
    // nên popup không tự điền link đang xem.
    const fromPath = ns.platform.videoIdFromPath(location.pathname);
    if (fromPath) return fromPath;
    try {
      const params = new URLSearchParams(location.search || "");
      for (const key of ["modal_id", "aweme_id", "item_id"]) {
        const value = params.get(key);
        if (/^\d{6,25}$/.test(value || "")) return value;
      }
    } catch {
      // location.search lỗi thì giữ null như cũ.
    }
    return null;
  }

  function author() {
    return ns.platform.authorFromPath(location.pathname);
  }

  function canonicalUrl() {
    return ns.platform.canonicalVideoUrl(videoId(), author());
  }

  ns.player = Object.freeze({
    mediaElements,
    renderTargets,
    visibleRect,
    isEnhanced,
    score,
    pick,
    videoId,
    canonicalUrl
  });
})();
