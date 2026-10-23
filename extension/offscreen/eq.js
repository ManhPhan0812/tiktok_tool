"use strict";

// Offscreen document: nhận luồng âm thanh của tab TikTok, lọc qua 5 dải rồi phát lại.
// tabCapture làm tắt tiếng gốc của tab, nên phải phát lại từ đây để người dùng vẫn nghe.
const eq = TikTokTools.equalizer;

let context = null;
let source = null;
let stream = null;
let preamp = null;
let filters = [];
let current = "off";
let tabId = null;
let generation = 0;
let limiter = null;

function state() {
  return {
    attached: context?.state === "running" && Boolean(stream?.getAudioTracks().some(track => track.readyState === "live")),
    preset: current,
    sampleRate: context?.sampleRate ?? null,
    bands: filters.length,
    tabId,
    audioState: context?.state ?? null
  };
}

function apply(preset) {
  const chosen = eq.presets[preset] ? preset : "off";
  current = chosen;
  if (!context) return state();
  const config = eq.config(chosen);
  const now = context.currentTime;
  filters.forEach((filter, index) => {
    filter.gain.setTargetAtTime(config.gains[index] ?? 0, now, 0.02);
  });
  preamp.gain.setTargetAtTime(config.preamp ?? 1, now, 0.02);
  return state();
}

function detach() {
  generation++;
  for (const filter of filters) {
    try { filter.disconnect(); } catch { /* đã ngắt */ }
  }
  filters = [];
  try { source?.disconnect(); } catch { /* đã ngắt */ }
  try { preamp?.disconnect(); } catch { /* đã ngắt */ }
  try { limiter?.disconnect(); } catch { /* đã ngắt */ }
  for (const track of stream?.getTracks() || []) track.stop();
  context?.close().catch(() => {});
  context = null;
  source = null;
  stream = null;
  preamp = null;
  current = "off";
  tabId = null;
  limiter = null;
}

async function attach(streamId, preset, targetTabId) {
  detach();
  const ownGeneration = generation;
  if (!streamId) throw new Error("Thiếu mã luồng âm thanh của tab.");
  const captured = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId
      }
    },
    video: false
  });
  if (generation !== ownGeneration) {
    captured.getTracks().forEach(track => track.stop());
    throw new Error("Đã hủy bật Equalizer.");
  }
  stream = captured;
  const [track] = stream.getAudioTracks();
  if (!track || track.readyState !== "live") throw new Error("Không có luồng âm thanh đang hoạt động.");
  tabId = targetTabId;
  context = new AudioContext();
  source = context.createMediaStreamSource(stream);
  preamp = context.createGain();

  source.connect(preamp);
  let node = preamp;
  filters = eq.bands.map(band => {
    const filter = context.createBiquadFilter();
    filter.type = band.type;
    filter.frequency.value = band.frequency;
    filter.Q.value = band.q;
    filter.gain.value = 0;
    node.connect(filter);
    node = filter;
    return filter;
  });
  limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -1;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.12;
  node.connect(limiter);
  limiter.connect(context.destination);
  await context.resume();
  if (generation !== ownGeneration || context?.state !== "running") {
    throw new Error("Trình duyệt chưa phát âm thanh xử lý. Hãy nhấn phát video rồi bật lại Equalizer.");
  }

  // Tab bị đóng hoặc dừng chia sẻ thì tự tắt, không để âm thanh treo.
  track?.addEventListener("ended", () => {
    if (stream === captured) detach();
  });

  return apply(preset);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const type = message?.type;
  if (message?.target !== "offscreen" || !["EQ_ATTACH", "EQ_SET_PRESET", "EQ_DETACH", "EQ_OFFSCREEN_STATE"].includes(type)) return false;
  const payload = message.payload ?? {};
  (async () => {
    if (type === "EQ_ATTACH") {
      sendResponse({ ok: true, data: await attach(payload.streamId, payload.preset, payload.tabId) });
      return;
    }
    if (type === "EQ_SET_PRESET") {
      sendResponse({ ok: true, data: apply(payload.preset) });
      return;
    }
    if (type === "EQ_DETACH") {
      detach();
      sendResponse({ ok: true, data: state() });
      return;
    }
    if (type === "EQ_OFFSCREEN_STATE") {
      sendResponse({ ok: true, data: state() });
      return;
    }
    sendResponse({ ok: false, error: { code: "BAD_REQUEST", message: "Lệnh Equalizer không hợp lệ." } });
  })().catch(error => {
    detach();
    sendResponse({ ok: false, error: { code: "UNSUPPORTED", message: error?.message || "Không mở được âm thanh của tab." } });
  });
  return true;
});
