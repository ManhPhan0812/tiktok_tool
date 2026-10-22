const { test, expect } = require("@playwright/test");
const h = require("./fixtures/harness");

const call = (popup, type, payload = {}) => popup.evaluate(({ type, payload }) => chrome.runtime.sendMessage({
  type,
  payload,
  requestId: `eq-${type}`
}), { type, payload });

let harness;
let page;
let popup;

test.beforeAll(async () => {
  harness = await h.launch();
});

test.beforeEach(async () => {
  await h.resetStorage(harness.worker);
  page = await h.openTikTok(harness);
  popup = await h.openPopup(harness, page);
});

test.afterEach(async () => {
  // Không để vùng xử lý âm thanh sống sót giữa các bài kiểm thử.
  await popup.evaluate(() => chrome.runtime.sendMessage({
    type: "EQ_STOP",
    payload: {},
    requestId: "eq-cleanup"
  })).catch(() => {});
  await h.closeExtraTabs(harness);
});

test.afterAll(async () => {
  await h.dispose(harness);
});

test("EQ_STATUS báo đúng khả năng và preset đang lưu", async () => {
  const response = await call(popup, "EQ_STATUS");
  expect(response.ok, response.error?.message).toBe(true);
  expect(response.data.supported).toBe(true);
  expect(response.data.attached).toBe(false);
  expect(response.data.preset).toBe("off");
});

test("EQ_START không có activeTab thì báo lỗi rõ và không bật giả", async () => {
  const response = await call(popup, "EQ_START", { preset: "bass" });
  expect(response.ok).toBe(false);
  expect(["BLOCKED", "UNSUPPORTED"]).toContain(response.error.code);
  expect(response.error.message.length).toBeGreaterThan(10);

  const status = await call(popup, "EQ_STATUS");
  expect(status.data.attached).toBe(false);
  // Không ghi preset như đã bật thành công (storage có thể chưa tồn tại nên đọc qua background).
  const saved = await call(popup, "SETTINGS_READ");
  expect(saved.data.equalizerPreset).toBe("off");
});

test("preset đã chọn được lưu, kể cả khi chưa có vùng âm thanh", async () => {
  const response = await call(popup, "EQ_SET_PRESET", { preset: "vocal" });
  expect(response.ok, response.error?.message).toBe(true);
  expect(response.data.attached).toBe(false);
  expect((await h.readSettings(harness)).equalizerPreset).toBe("vocal");

  const invalid = await call(popup, "EQ_SET_PRESET", { preset: "không-có" });
  expect(invalid.ok).toBe(true);
  expect((await h.readSettings(harness)).equalizerPreset).toBe("off");
});

test("EQ_STOP đưa preset về tắt và không để vùng âm thanh mở", async () => {
  await call(popup, "EQ_SET_PRESET", { preset: "treble" });
  const stopped = await call(popup, "EQ_STOP");
  expect(stopped.ok).toBe(true);
  expect(stopped.data.preset).toBe("off");
  expect((await h.readSettings(harness)).equalizerPreset).toBe("off");
  const status = await call(popup, "EQ_STATUS");
  expect(status.data.attached).toBe(false);
});
