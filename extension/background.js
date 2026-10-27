"use strict";
importScripts("shared/settings.js", "shared/messages.js", "shared/validation.js", "shared/platform.js", "services/proxy.js", "services/downloads.js", "services/seekin.js", "services/ttget.js", "services/douyin-native.js", "services/douyin.js");

const ns = TikTokTools;
const msg = ns.messages;
const types = msg.types;
const settings = ns.settingsApi;

async function readSettings() {
  const stored = await chrome.storage.local.get(settings.storageKey);
  const raw = stored[settings.storageKey];
  const normalized = settings.normalizeSettings(raw);
  // Migrate dữ liệu v0.1.1 (hoặc dữ liệu thiếu trường) ngay lần đọc đầu tiên.
  if (raw !== undefined && JSON.stringify(raw) !== JSON.stringify(normalized)) {
    await chrome.storage.local.set({ [settings.storageKey]: normalized });
  }
  return normalized;
}

async function patchSettings(patch) {
  const clean = settings.pickPatch(patch);
  if (!Object.keys(clean).length) return readSettings();
  const next = settings.normalizeSettings({ ...(await readSettings()), ...clean });
  await chrome.storage.local.set({ [settings.storageKey]: next });
  return next;
}

async function targetTab(tabId, sender) {
  if (Number.isInteger(tabId)) return tabId;
  if (Number.isInteger(sender?.tab?.id)) return sender.tab.id;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function forwardToTab(type, payload, tabId, requestId) {
  const id = await targetTab(tabId);
  if (id === undefined) return msg.fail("NO_TAB", "Không tìm thấy tab đang hoạt động.");
  try {
    const response = await chrome.tabs.sendMessage(id, { type, payload, requestId });
    return msg.isResponse(response)
      ? response
      : msg.fail("NO_RECEIVER", "Tiện ích chưa chạy trên tab này. Hãy tải lại trang TikTok hoặc Douyin.");
  } catch {
    return msg.fail("NO_RECEIVER", "Tiện ích chưa chạy trên tab này. Hãy tải lại trang TikTok hoặc Douyin.");
  }
}

async function captureRegion(sender) {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(sender?.tab?.windowId, { format: "png" });
    return msg.ok({ dataUrl });
  } catch {
    return msg.fail("CAPTURE_FAILED", "Không chụp được vùng đang hiển thị của tab.");
  }
}

// Chrome bỏ qua tuỳ chọn `filename` khi URL là data: (luôn lưu thành download.png),
// nên ảnh được lưu từ content script bằng thẻ <a download> để giữ đúng tên tệp.
async function captureFrame(payload, sender) {
  const tabId = await targetTab(payload.tabId, sender);
  if (tabId === undefined) return msg.fail("NO_TAB", "Không tìm thấy tab đang hoạt động.");
  return forwardToTab(types.CAPTURE_FRAME, { mode: payload.mode }, tabId, payload.requestId);
}

const OFFSCREEN_URL = "offscreen/eq.html";
let creatingOffscreen = null;
let eqOperations = Promise.resolve();
let eqBusy = false;

function queueEq(operation) {
  const result = eqOperations.then(async () => {
    eqBusy = true;
    try { return await operation(); }
    finally { eqBusy = false; }
  });
  eqOperations = result.catch(() => {});
  return result;
}

async function hasOffscreen() {
  try {
    return Boolean(await chrome.offscreen?.hasDocument?.());
  } catch {
    return false;
  }
}

async function ensureOffscreen() {
  if (creatingOffscreen) return creatingOffscreen;
  creatingOffscreen = (async () => {
    if (await hasOffscreen()) return;
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ["USER_MEDIA"],
      justification: "Cân bằng âm thanh của tab TikTok đang phát."
    });
  })();
  try { await creatingOffscreen; }
  finally { creatingOffscreen = null; }
}

async function closeOffscreen() {
  if (!(await hasOffscreen())) return;
  await chrome.offscreen.closeDocument().catch(() => {});
}

async function callOffscreen(type, payload, timeout = 2_000) {
  let timer;
  try {
    return await Promise.race([
      chrome.runtime.sendMessage({ target: "offscreen", type, payload, requestId: msg.nextRequestId("eq") }),
      new Promise(resolve => { timer = setTimeout(() => resolve(null), timeout); })
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Chrome 116+ supports a stream ID obtained in the worker being consumed by the
// extension's offscreen document. Keep capture in that worker, not the popup.
function eqCapabilities() {
  const missing = [];
  if (!chrome.offscreen?.createDocument) missing.push("offscreen");
  if (!chrome.tabCapture?.getMediaStreamId) missing.push("tabCapture");
  return {
    offscreen: Boolean(chrome.offscreen?.createDocument),
    workerCapture: Boolean(chrome.tabCapture?.getMediaStreamId),
    missing
  };
}

async function eqStatus() {
  const capabilities = eqCapabilities();
  let preset = "off";
  let readError = null;
  try {
    preset = (await readSettings()).equalizerPreset;
  } catch (error) {
    readError = error.message;
  }

  let audio = null;
  let offscreenAlive = false;
  let offscreenError = null;
  try {
    offscreenAlive = await hasOffscreen();
  } catch (error) {
    offscreenError = error.message;
  }
  if (offscreenAlive) {
    const response = await callOffscreen("EQ_OFFSCREEN_STATE", {});
    if (response?.ok) {
      audio = response.data;
    } else {
      // Vùng offscreen "mồ côi" (tạo từ lần chạy trước, sau khi extension được tải
      // lại) sẽ không bao giờ trả lời nữa. Đóng nó để lần bật sau dựng vùng mới,
      // thay vì để trạng thái Equalizer kẹt ở "không phản hồi" mãi.
      offscreenError = response?.error?.message || "Vùng xử lý âm thanh không phản hồi.";
      if (!eqBusy) {
        await closeOffscreen();
        offscreenAlive = false;
      }
    }
  }

  return msg.ok({
    supported: capabilities.offscreen && capabilities.workerCapture,
    offscreen: capabilities.offscreen,
    workerCapture: capabilities.workerCapture,
    missing: capabilities.missing,
    browser: typeof navigator !== "undefined" ? navigator.userAgent : null,
    attached: Boolean(audio?.attached),
    preset: audio?.preset ?? preset,
    sampleRate: audio?.sampleRate ?? null,
    tabId: audio?.tabId ?? null,
    audioState: audio?.audioState ?? null,
    busy: eqBusy,
    offscreenError,
    readError,
    error: offscreenError || (readError ? "Không đọc được tùy chọn đã lưu." : null)
  });
}

async function eqStart(payload) {
  const capabilities = eqCapabilities();
  if (!capabilities.offscreen) {
    return msg.fail("UNSUPPORTED", "Trình duyệt này không có API offscreen nên không lọc được âm thanh. Cần Chrome hoặc Edge 116 trở lên.");
  }
  const tabId = await targetTab(payload.tabId);
  if (tabId === undefined) return msg.fail("NO_TAB", "Hãy mở một video TikTok trước khi bật Equalizer.");
  const current = await readSettings();
  const preset = settings.equalizerPresets.includes(payload.preset) && payload.preset !== "off"
    ? payload.preset
    : (current.equalizerPreset === "off" ? "normal" : current.equalizerPreset);

  if (await hasOffscreen()) {
    const state = await callOffscreen("EQ_OFFSCREEN_STATE", {});
    if (state?.ok && state.data?.attached && state.data.tabId === tabId) {
      // Reuse the active stream: capturing an already captured tab again fails.
      const changed = await callOffscreen("EQ_SET_PRESET", { preset });
      if (!changed?.ok || !changed.data?.attached) {
        return msg.fail("UNSUPPORTED", changed?.error?.message || "Không đổi được preset Equalizer.");
      }
      await patchSettings({ equalizerPreset: preset });
      return msg.ok(changed.data);
    }
    await closeOffscreen();
  }
  if (!capabilities.workerCapture) {
    return msg.fail("UNSUPPORTED", "Trình duyệt này không hỗ trợ tabCapture (cần Chrome hoặc Edge 116 trở lên).");
  }
  try {
    await ensureOffscreen();
  } catch (error) {
    return msg.fail("UNSUPPORTED", `Không tạo được vùng xử lý âm thanh: ${error?.message || error}`);
  }
  let streamId;
  try {
    streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  } catch (error) {
    await closeOffscreen();
    return msg.fail("BLOCKED", `Chưa lấy được âm thanh của tab. Hãy mở popup bằng cách bấm icon extension rồi thử lại. ${error?.message || ""}`);
  }
  const response = await callOffscreen("EQ_ATTACH", { streamId, preset, tabId }, 10_000);
  if (!response?.ok || !response.data?.attached) {
    await closeOffscreen();
    return msg.fail("UNSUPPORTED", response?.error?.message || "Không mở được âm thanh của tab.");
  }
  await patchSettings({ equalizerPreset: preset });
  return msg.ok(response.data);
}

async function eqSetPreset(payload) {
  const preset = settings.equalizerPresets.includes(payload.preset) ? payload.preset : "off";
  if (preset === "off") return eqStop();
  if (!(await hasOffscreen())) {
    await patchSettings({ equalizerPreset: preset });
    return msg.ok({ attached: false, preset });
  }
  const response = await callOffscreen("EQ_SET_PRESET", { preset });
  if (!response?.ok) {
    return msg.fail("UNSUPPORTED", response?.error?.message || "Không đổi được preset Equalizer.");
  }
  await patchSettings({ equalizerPreset: preset });
  return msg.ok({ ...response.data, preset });
}

async function eqStop() {
  if (await hasOffscreen()) await callOffscreen("EQ_DETACH", {}).catch(() => {});
  await closeOffscreen();
  await patchSettings({ equalizerPreset: "off" });
  return msg.ok({ attached: false, preset: "off" });
}

async function handle(message, sender) {
  const type = message?.type;
  const payload = message?.payload ?? {};
  switch (type) {
    case types.SETTINGS_READ:
      return msg.ok(await readSettings());
    case types.SETTINGS_PATCH:
      return msg.ok(await patchSettings(payload.patch ?? payload));
    case types.CAPTURE_REGION:
      return captureRegion(sender);
    case types.CAPTURE_FRAME:
      return captureFrame(payload, sender);
    case types.PLAYER_STATUS:
    case types.MIRROR_TOGGLE:
    case types.SPEED_SET:
      return forwardToTab(type, payload, payload.tabId, message.requestId);
    case types.DOWNLOAD_RESOLVE:
      return ns.downloadsService.resolve(payload);
    case types.DOWNLOAD_START:
      return ns.downloadsService.start(payload);
    case types.DOWNLOAD_STATUS:
      return ns.downloadsService.status();
    case types.DOWNLOAD_CANCEL:
      return ns.downloadsService.cancel(payload);
    case types.DOUYIN_ANALYZE:
      return ns.douyinService.analyze(payload);
    case types.DOUYIN_DOWNLOAD:
      return ns.douyinService.download(payload);
    case types.EQ_START:
      return queueEq(() => eqStart(payload));
    case types.EQ_SET_PRESET:
      return queueEq(() => eqSetPreset(payload));
    case types.EQ_STOP:
      return queueEq(eqStop);
    case types.EQ_STATUS:
      return eqStatus();
    default:
      return msg.fail("BAD_REQUEST", "Loại thông điệp không hợp lệ.");
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Offscreen commands have exactly one receiver; never race its async reply.
  if (message?.target === "offscreen") return false;
  handle(message, sender)
    .then(sendResponse)
    .catch(error => sendResponse(msg.fail("UNKNOWN", error?.message || "Đã xảy ra lỗi.")));
  return true;
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "toggle-mirror") return;
  await forwardToTab(types.MIRROR_TOGGLE, {}, tab?.id);
});
