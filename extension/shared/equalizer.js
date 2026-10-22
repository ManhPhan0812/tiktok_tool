(() => {
  "use strict";
  const ns = globalThis.TikTokTools = globalThis.TikTokTools || {};

  // Năm dải theo PLAN: 60 Hz, 250 Hz, 1 kHz, 4 kHz, 12 kHz.
  const bands = Object.freeze([
    { type: "lowshelf", frequency: 60, q: 0.7 },
    { type: "peaking", frequency: 250, q: 1 },
    { type: "peaking", frequency: 1000, q: 1 },
    { type: "peaking", frequency: 4000, q: 1 },
    { type: "highshelf", frequency: 12000, q: 0.7 }
  ]);

  // `preamp` hạ mức vào để các dải cộng dồn không bị vỡ tiếng.
  const presets = Object.freeze({
    off: { label: "Tắt", gains: [0, 0, 0, 0, 0], preamp: 1 },
    normal: { label: "Normal", gains: [0, 0, 0, 0, 0], preamp: 1 },
    bass: { label: "Bass Boost", gains: [7, 4, 0, -1, 0], preamp: 0.82 },
    vocal: { label: "Vocal", gains: [-2, 0, 4, 5, 1], preamp: 0.86 },
    treble: { label: "Treble Boost", gains: [0, -1, 0, 3, 7], preamp: 0.85 }
  });

  function config(preset) {
    return presets[preset] || presets.off;
  }

  ns.equalizer = Object.freeze({
    bands,
    presets,
    keys: Object.keys(presets),
    config,
    label(preset) {
      return config(preset).label;
    }
  });
})();
