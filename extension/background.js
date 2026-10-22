"use strict";
importScripts("shared/settings.js", "shared/messages.js", "shared/validation.js", "services/proxy.js", "services/downloads.js");

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
      : msg.fail("NO_RECEIVER", "Tiện ích chưa chạy trên tab này. Hãy tải lại trang TikTok.");
  } catch {
    return msg.fail("NO_RECEIVER", "Tiện ích chưa chạy trên tab này. Hãy tải lại trang TikTok.");
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

async function hasOffscreen() {
  try {
    return Boolean(await chrome.offscreen?.hasDocument?.());
  } catch {
    return false;
  }
}

async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ["USER_MEDIA"],
    justification: "Cân bằng âm thanh của tab TikTok đang phát."
  });
}

async function closeOffscreen() {
  if (!(await hasOffscreen())) return;
  await chrome.offscreen.closeDocument().catch(() => {});
}

async function callOffscreen(type, payload) {
  try {
    return await chrome.runtime.sendMessage({ type, payload, requestId: msg.nextRequestId("eq") });
  } catch {
    return null;
  }
}

function eqSupported() {
  return Boolean(chrome.tabCapture?.getMediaStreamId && chrome.offscreen?.createDocument);
}

async function eqStatus() {
  const current = await readSettings();
  let audio = null;
  if (await hasOffscreen()) {
    const response = await callOffscreen("EQ_OFFSCREEN_STATE", {});
    audio = response?.ok ? response.data : null;
  }
  return msg.ok({
    supported: eqSupported(),
    attached: Boolean(audio?.attached),
    preset: audio?.preset ?? current.equalizerPreset,
    sampleRate: audio?.sampleRate ?? null,
    error: audio === null && (await hasOffscreen()) ? "Vùng xử lý âm thanh không phản hồi." : null
  });
}

async function eqStart(payload) {
  if (!eqSupported()) {
    return msg.fail("UNSUPPORTED", "Trình duyệt này không hỗ trợ tabCapture/offscreen (cần Chrome hoặc Edge 116+).");
  }
  const tabId = await targetTab(payload.tabId);
  if (tabId === undefined) return msg.fail("NO_TAB", "Hãy mở một video TikTok trước khi bật Equalizer.");
  const current = await readSettings();
  const preset = settings.equalizerPresets.includes(payload.preset) && payload.preset !== "off"
    ? payload.preset
    : (current.equalizerPreset === "off" ? "normal" : current.equalizerPreset);

  let streamId;
  try {
    streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  } catch {
    return msg.fail("BLOCKED", "Chưa được cấp quyền âm thanh của tab. Hãy mở popup bằng cách bấm icon extension rồi thử lại.");
  }
  try {
    await ensureOffscreen();
  } catch (error) {
    return msg.fail("UNSUPPORTED", `Không tạo được vùng xử lý âm thanh: ${error?.message || error}`);
  }
  const response = await callOffscreen("EQ_ATTACH", { streamId, preset });
  if (!response?.ok) {
    await closeOffscreen();
    return msg.fail("UNSUPPORTED", response?.error?.message || "Không mở được âm thanh của tab.");
  }
  await patchSettings({ equalizerPreset: preset });
  return msg.ok({ attached: true, preset, tabId, sampleRate: response.data?.sampleRate ?? null });
}

async function eqSetPreset(payload) {
  const preset = settings.equalizerPresets.includes(payload.preset) ? payload.preset : "off";
  await patchSettings({ equalizerPreset: preset });
  if (preset === "off") return eqStop();
  if (!(await hasOffscreen())) return msg.ok({ attached: false, preset });
  const response = await callOffscreen("EQ_SET_PRESET", { preset });
  if (!response?.ok) {
    return msg.fail("UNSUPPORTED", response?.error?.message || "Không đổi được preset Equalizer.");
  }
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
    case types.EQ_START:
      return eqStart(payload);
    case types.EQ_SET_PRESET:
      return eqSetPreset(payload);
    case types.EQ_STOP:
      return eqStop();
    case types.EQ_STATUS:
      return eqStatus();
    default:
      return msg.fail("BAD_REQUEST", "Loại thông điệp không hợp lệ.");
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handle(message, sender)
    .then(sendResponse)
    .catch(error => sendResponse(msg.fail("UNKNOWN", error?.message || "Đã xảy ra lỗi.")));
  return true;
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "toggle-mirror") return;
  await forwardToTab(types.MIRROR_TOGGLE, {}, tab?.id);
});
