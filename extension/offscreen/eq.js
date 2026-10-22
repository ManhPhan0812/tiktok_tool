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

function state() {
  return {
    attached: Boolean(context),
    preset: current,
    sampleRate: context?.sampleRate ?? null,
    bands: filters.length
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
  for (const filter of filters) {
    try { filter.disconnect(); } catch { /* đã ngắt */ }
  }
  filters = [];
  try { source?.disconnect(); } catch { /* đã ngắt */ }
  try { preamp?.disconnect(); } catch { /* đã ngắt */ }
  for (const track of stream?.getTracks() || []) track.stop();
  context?.close().catch(() => {});
  context = null;
  source = null;
  stream = null;
  preamp = null;
  current = "off";
}

async function attach(streamId, preset) {
  detach();
  if (!streamId) throw new Error("Thiếu mã luồng âm thanh của tab.");
  stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId
      }
    },
    video: false
  });
  context = new AudioContext();
  source = context.createMediaStreamSource(stream);
  preamp = context.createGain();

  let node = source;
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
  node.connect(preamp);
  preamp.connect(context.destination);
  await context.resume();

  // Tab bị đóng hoặc dừng chia sẻ thì tự tắt, không để âm thanh treo.
  const [track] = stream.getAudioTracks();
  track?.addEventListener("ended", () => {
    detach();
  });

  return apply(preset);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const type = message?.type;
  if (!String(type || "").startsWith("EQ_")) return false;
  const payload = message.payload ?? {};
  (async () => {
    if (type === "EQ_ATTACH") {
      sendResponse({ ok: true, data: await attach(payload.streamId, payload.preset) });
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
