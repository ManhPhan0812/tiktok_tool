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

test("EQ_STATUS báo riêng từng khả năng để chẩn đoán được nguyên nhân", async () => {
  const response = await call(popup, "EQ_STATUS");
  expect(response.ok, response.error?.message).toBe(true);
  expect(response.data.offscreen).toBe(true);
  expect(response.data.workerCapture).toBe(true);
  expect(response.data.missing).toEqual([]);
  expect(typeof response.data.browser).toBe("string");
});

test("Popup mở khóa dropdown Equalizer khi trình duyệt hỗ trợ", async () => {
  await expect(popup.locator("#eq")).toBeEnabled();
  await expect.poll(() => popup.locator("#eq-note").textContent(), { timeout: 10_000 })
    .toMatch(/Tắt|Đang bật/);
});

test("EQ_STATUS lỗi thì không báo nhầm 'không hỗ trợ' và không khoá dropdown", async () => {
  // Chặn riêng EQ_STATUS trong popup để giả lập trình duyệt không phản hồi.
  await popup.evaluate(() => {
    self.__originalSendMessage = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = async message => {
      if (message?.type === "EQ_STATUS") throw new Error("Không có người nhận.");
      return self.__originalSendMessage(message);
    };
  });
  try {
    await expect.poll(() => popup.locator("#eq-note").textContent(), { timeout: 10_000 })
      .toBe("Không phản hồi · đang thử lại");
    await expect(popup.locator("#eq")).toBeEnabled();
  } finally {
    await popup.evaluate(() => {
      if (self.__originalSendMessage) chrome.runtime.sendMessage = self.__originalSendMessage;
    });
  }
});

test("vùng offscreen mồ côi bị đóng thay vì để Equalizer kẹt ở 'không phản hồi'", async () => {
  const patched = await harness.worker.evaluate(() => {
    try {
      self.__origHasDocument = chrome.offscreen.hasDocument;
      self.__origCloseDocument = chrome.offscreen.closeDocument;
      self.__closed = 0;
      chrome.offscreen.hasDocument = async () => true;
      chrome.offscreen.closeDocument = async () => { self.__closed += 1; };
      return true;
    } catch {
      return false;
    }
  });
  test.skip(!patched, "Trình duyệt không cho ghi đè chrome.offscreen trong bài kiểm thử này.");
  try {
    const response = await call(popup, "EQ_STATUS");
    expect(response.ok, response.error?.message).toBe(true);
    // Vùng có "tồn tại" nhưng không trả lời: trạng thái vẫn trả về được, kèm lý do.
    expect(response.data.attached).toBe(false);
    expect(String(response.data.offscreenError)).toContain("phản hồi");
    // Popup cũng đang poll nên vùng chết có thể bị đóng nhiều hơn một lần.
    expect(await harness.worker.evaluate(() => self.__closed)).toBeGreaterThanOrEqual(1);
  } finally {
    await harness.worker.evaluate(() => {
      if (self.__origHasDocument) chrome.offscreen.hasDocument = self.__origHasDocument;
      if (self.__origCloseDocument) chrome.offscreen.closeDocument = self.__origCloseDocument;
    });
  }
});

test("trạng thái video lỗi không chặn cập nhật ô Equalizer", async () => {
  await expect(popup.locator("#eq-note")).toHaveText(/Tắt|Đang bật/);
  await popup.evaluate(() => {
    self.__originalSendMessage = chrome.runtime.sendMessage.bind(chrome.runtime);
    // Giai đoạn 1: chỉ EQ_STATUS lỗi -> ô phải chuyển sang "không phản hồi".
    // Giai đoạn 2: chỉ PLAYER_STATUS lỗi -> ô phải tự cập nhật lại bình thường.
    self.__block = "eq";
    chrome.runtime.sendMessage = async message => {
      if (message?.type === "EQ_STATUS" && self.__block === "eq") throw new Error("offline");
      if (message?.type === "PLAYER_STATUS" && self.__block === "status") throw new Error("offline");
      return self.__originalSendMessage(message);
    };
  });
  try {
    await expect.poll(() => popup.locator("#eq-note").textContent(), { timeout: 10_000 })
      .toBe("Không phản hồi · đang thử lại");
    await popup.evaluate(() => { self.__block = "status"; });
    await expect.poll(() => popup.locator("#eq-note").textContent(), { timeout: 10_000 })
      .not.toBe("Không phản hồi · đang thử lại");
  } finally {
    await popup.evaluate(() => {
      if (self.__originalSendMessage) chrome.runtime.sendMessage = self.__originalSendMessage;
    });
  }
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
