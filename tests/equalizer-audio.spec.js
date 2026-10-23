const { test, expect } = require("@playwright/test");
const h = require("./fixtures/harness");
const { evaluateOffscreen } = require("./fixtures/offscreen");

let harness;
let page;
let popup;
const call = (type, payload = {}) => popup.evaluate(({ type, payload }) => chrome.runtime.sendMessage({
  type, payload, requestId: "eq-audio-test"
}), { type, payload });

test.beforeAll(async () => {
  harness = await h.launch({ browserArgs: ["--autoplay-policy=no-user-gesture-required"] });
});
test.beforeEach(async () => {
  await h.resetStorage(harness.worker);
  page = await h.openTikTok(harness);
  popup = await h.openPopup(harness, page);
  await expect(popup.locator("#eq")).toBeEnabled();
});
test.afterEach(async () => {
  await call("EQ_STOP").catch(() => {});
  await harness.worker.evaluate(() => {
    if (self.__eqOriginalCapture) chrome.tabCapture.getMediaStreamId = self.__eqOriginalCapture;
    delete self.__eqStreamResolver;
  });
  await h.closeExtraTabs(harness);
});
test.afterAll(async () => { await h.dispose(harness); });

async function startWithTestAudio() {
  // Only the source/permission boundary is simulated. The real offscreen page,
  // runtime messages, Web Audio graph, filters and popup polling are exercised.
  await harness.worker.evaluate(() => {
    self.__eqOriginalCapture = chrome.tabCapture.getMediaStreamId;
    self.__eqCaptureCount = 0;
    chrome.tabCapture.getMediaStreamId = async () => {
      self.__eqCaptureCount++;
      return new Promise(resolve => { self.__eqStreamResolver = resolve; });
    };
  });
  await popup.selectOption("#eq", "normal");
  await expect.poll(() => harness.worker.evaluate(() => Boolean(self.__eqStreamResolver)), { timeout: 15000 }).toBe(true);
  await expect(popup.locator("#eq")).toHaveValue("normal");
  await expect(popup.locator("#eq-note")).toHaveText("Đang bật…");
  await evaluateOffscreen(harness, async () => {
    const tones = new AudioContext();
    await tones.resume();
    const output = tones.createMediaStreamDestination();
    for (const hz of [60, 1000, 12000]) {
      const oscillator = tones.createOscillator();
      oscillator.frequency.value = hz;
      const gain = tones.createGain();
      gain.gain.value = 0.02;
      oscillator.connect(gain).connect(output);
      oscillator.start();
    }
    self.__eqTestTones = tones;
    self.__eqTestInput = output.stream;
    navigator.mediaDevices.getUserMedia = async () => output.stream;
  });
  await harness.worker.evaluate(() => self.__eqStreamResolver("synthetic-test-stream"));
  await expect(popup.locator("#eq-note")).toHaveText("Đang bật · Normal");
  await expect(popup.locator("#eq")).toBeEnabled();
}

async function levels() {
  return evaluateOffscreen(harness, async () => {
    const analyser = context.createAnalyser();
    analyser.fftSize = 32768;
    analyser.smoothingTimeConstant = 0;
    limiter.connect(analyser);
    try {
      // Fill one FFT window after parameter smoothing has settled.
      await new Promise(resolve => setTimeout(resolve, 900));
      const bins = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(bins);
      return [60, 1000, 12000].map(hz => bins[Math.round(hz * analyser.fftSize / context.sampleRate)]);
    } finally { limiter.disconnect(analyser); }
  });
}

test("offscreen đang tồn tại không nhận nhầm EQ_STATUS, EQ_SET_PRESET hoặc EQ_STOP của popup", async () => {
  await harness.worker.evaluate(() => queueEq(ensureOffscreen));
  expect(await harness.worker.evaluate(() => chrome.offscreen.hasDocument())).toBe(true);
  const status = await call("EQ_STATUS");
  expect(status.ok, status.error?.message).toBe(true);
  expect(status.data.attached).toBe(false);
  const changed = await call("EQ_SET_PRESET", { preset: "vocal" });
  expect(changed.ok, changed.error?.message).toBe(true);
  expect((await h.readSettings(harness)).equalizerPreset).toBe("vocal");
  await expect(popup.locator("#eq-note")).not.toContainText("Không phản hồi");
  expect((await call("EQ_STOP")).ok).toBe(true);
  expect(await harness.worker.evaluate(() => chrome.offscreen.hasDocument())).toBe(false);
});

test("Bass/Vocal/Treble đổi đáp ứng âm thanh thật, giữ preset qua polling và dùng một luồng", async () => {
  await startWithTestAudio();
  const normal = await levels();
  expect(normal.every(Number.isFinite)).toBe(true);
  for (const [preset, band, label] of [
    ["bass", 0, "Bass Boost"], ["vocal", 1, "Vocal"], ["treble", 2, "Treble Boost"]
  ]) {
    await popup.selectOption("#eq", preset);
    await expect(popup.locator("#eq-note")).toHaveText(`Đang bật · ${label}`);
    const filtered = await levels();
    expect(filtered[band] - normal[band], `${preset}: gain at band ${band}`).toBeGreaterThan(1.4);
    await expect(popup.locator("#eq")).toHaveValue(preset);
    await expect(popup.locator("#eq-note")).toHaveText(`Đang bật · ${label}`);
  }
  expect(await harness.worker.evaluate(() => self.__eqCaptureCount)).toBe(1);
  const status = await call("EQ_STATUS");
  expect(status.data).toMatchObject({ attached: true, preset: "treble", audioState: "running" });
  await popup.close();
  popup = await h.openPopup(harness, page);
  await expect(popup.locator("#eq-note")).toHaveText("Đang bật · Treble Boost");
  await expect(popup.locator("#eq")).toHaveValue("treble");
  await popup.selectOption("#eq", "off");
  await expect(popup.locator("#eq-note")).toHaveText("Tắt · bản thử nghiệm");
  expect(await harness.worker.evaluate(() => chrome.offscreen.hasDocument())).toBe(false);
});

test("luồng âm thanh kết thúc thì dọn bộ lọc và popup trở về Tắt", async () => {
  await startWithTestAudio();
  const state = await evaluateOffscreen(harness, () => {
    const [track] = self.__eqTestInput.getAudioTracks();
    track.stop();
    track.dispatchEvent(new Event("ended"));
    return { audio: typeof context === "undefined" ? "missing" : context, bands: filters.length };
  });
  expect(state).toEqual({ audio: null, bands: 0 });
  await expect(popup.locator("#eq")).toHaveValue("off");
  expect((await call("EQ_STATUS")).data.attached).toBe(false);
});
