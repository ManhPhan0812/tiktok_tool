(() => {
  "use strict";
  const ns = globalThis.TikTokTools = globalThis.TikTokTools || {};
  const attribute = "data-tiktok-tools-mirrored";
  const property = "--tiktok-tools-transform";
  const states = new WeakMap();
  let autoMirror = false;

  function sourceOf(video) {
    // currentSrc có thể còn là tài nguyên trước đó trong lúc tải.
    return video.getAttribute("src") || video.querySelector("source")?.getAttribute("src")
      || video.currentSrc || "";
  }

  function stateOf(video) {
    const source = sourceOf(video);
    let state = states.get(video);
    if (!state) {
      state = { source, manual: null, targets: new Set() };
      states.set(video, state);
    } else if (state.source !== source) {
      state.source = source;
      state.manual = null;
    }
    return state;
  }

  function clear(target) {
    target.removeAttribute(attribute);
    target.style.removeProperty(property);
  }

  // Lật các renderer do adapter cung cấp. Transform của TikTok được giữ trong một
  // biến CSS để khôi phục chính xác khi tắt.
  function apply(video, targets = []) {
    const state = stateOf(video);
    const mirrored = state.manual ?? autoMirror;
    const next = new Set(mirrored ? targets : []);
    for (const previous of state.targets) {
      if (!next.has(previous)) clear(previous);
    }
    for (const target of next) {
      target.removeAttribute(attribute);
      const transform = getComputedStyle(target).transform;
      const base = transform === "none" ? "matrix(1, 0, 0, 1, 0, 0)" : transform;
      if (target.style.getPropertyValue(property) !== base) {
        target.style.setProperty(property, base);
      }
      target.setAttribute(attribute, "");
    }
    state.targets = next;
    return mirrored;
  }

  function forget(video) {
    for (const target of states.get(video)?.targets ?? []) clear(target);
    states.delete(video);
  }

  ns.mirror = Object.freeze({
    attribute,
    apply,
    forget,
    isMirrored: video => (video ? stateOf(video).manual ?? autoMirror : false),
    toggle(video, targets) {
      if (!video) return false;
      const state = stateOf(video);
      state.manual = !(state.manual ?? autoMirror);
      return apply(video, targets);
    },
    configure(value, videos, targetsFor) {
      if (autoMirror !== value) {
        autoMirror = value;
        for (const video of videos) stateOf(video).manual = null;
      }
      for (const video of videos) apply(video, targetsFor ? targetsFor(video) : []);
    }
  });
})();
