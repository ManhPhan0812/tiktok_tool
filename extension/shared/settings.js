(() => {
  "use strict";
  const ns = globalThis.TikTokTools = globalThis.TikTokTools || {};
  const SCHEMA_VERSION = 2;
  const storageKey = "tiktokToolsSettings";
  const minRate = 0.5;
  const maxRate = 4;

  const defaults = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    autoMirror: false,
    showFloatingButton: true,
    backgroundPlay: false,
    cleanMode: false,
    playbackRate: 1,
    equalizerPreset: "off",
    theme: "dark",
    captureFormat: "png",
    downloadPreference: "no-watermark"
  });

  const themes = Object.freeze(["dark", "light"]);
  const equalizerPresets = Object.freeze(["off", "normal", "bass", "vocal", "treble"]);
  const downloadPreferences = Object.freeze(["no-watermark"]);

  function boolean(value, fallback) {
    return typeof value === "boolean" ? value : fallback;
  }

  function clampRate(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return defaults.playbackRate;
    const clamped = Math.min(maxRate, Math.max(minRate, number));
    return Math.round(clamped * 10) / 10;
  }

  // Nhận mọi giá trị đã lưu, kể cả dữ liệu v0.1.1 (chỉ có hai trường) hoặc dữ liệu hỏng.
  function normalizeSettings(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
      schemaVersion: SCHEMA_VERSION,
      autoMirror: boolean(source.autoMirror, defaults.autoMirror),
      showFloatingButton: boolean(source.showFloatingButton, defaults.showFloatingButton),
      backgroundPlay: boolean(source.backgroundPlay, defaults.backgroundPlay),
      cleanMode: boolean(source.cleanMode, defaults.cleanMode),
      playbackRate: clampRate(source.playbackRate),
      equalizerPreset: equalizerPresets.includes(source.equalizerPreset)
        ? source.equalizerPreset : defaults.equalizerPreset,
      theme: themes.includes(source.theme) ? source.theme : defaults.theme,
      captureFormat: "png",
      downloadPreference: downloadPreferences.includes(source.downloadPreference)
        ? source.downloadPreference : defaults.downloadPreference
    };
  }

  // Chỉ nhận các trường đã biết, đúng kiểu, để popup không ghi đè dữ liệu lạ vào storage.
  function pickPatch(patch) {
    const source = patch && typeof patch === "object" ? patch : {};
    const out = {};
    for (const key of ["autoMirror", "showFloatingButton", "backgroundPlay", "cleanMode", "theme",
      "equalizerPreset", "downloadPreference"]) {
      if (typeof source[key] === "string" && key === "theme" && themes.includes(source[key])) out[key] = source[key];
      else if (typeof source[key] === "string" && key === "equalizerPreset" && equalizerPresets.includes(source[key])) out[key] = source[key];
      else if (typeof source[key] === "string" && key === "downloadPreference" && downloadPreferences.includes(source[key])) out[key] = source[key];
      else if (typeof source[key] === "boolean" && key !== "theme" && key !== "equalizerPreset" && key !== "downloadPreference") out[key] = source[key];
    }
    if (source.playbackRate !== undefined) out.playbackRate = clampRate(source.playbackRate);
    return out;
  }

  ns.settingsApi = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    storageKey,
    defaults,
    themes,
    equalizerPresets,
    minRate,
    maxRate,
    clampRate,
    normalizeSettings,
    pickPatch,
    isEqual(a, b) {
      return JSON.stringify(normalizeSettings(a)) === JSON.stringify(normalizeSettings(b));
    }
  });
})();
