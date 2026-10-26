const { chromium, expect } = require("@playwright/test");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs/promises");

const marked = "data-tiktok-tools-mirrored";

const PAGE_STATE = {
  __DEFAULT_SCOPE__: {
    "webapp.video-detail": {
      itemInfo: {
        itemStruct: {
          id: "7699174948165651743",
          desc: "Clip kiểm thử",
          author: { uniqueId: "demo", nickname: "Demo" },
          video: {
            duration: 28,
            downloadAddr: null,
            bitrateInfo: [
              {
                Bitrate: 432204,
                CodecType: "h264",
                Quality: "normal_540_0",
                PlayAddr: { Width: 576, Height: 768, DataSize: 1537999, UrlList: ["https://cdn.example.com/v/540.mp4"] }
              },
              {
                Bitrate: 270152,
                CodecType: "h265",
                Quality: "adapt_lower_720_1",
                PlayAddr: { Width: 720, Height: 960, DataSize: 961339, UrlList: ["https://cdn.example.com/v/720.mp4"] }
              },
              {
                Bitrate: 207418,
                CodecType: "h265",
                Quality: "adapt_540_1",
                PlayAddr: { Width: 576, Height: 768, DataSize: 738098, UrlList: ["https://cdn.example.com/v/540h.mp4"] }
              }
            ]
          }
        },
        itemStructWithLogo: {
          id: "8000000000000000001",
          desc: "Clip có bản tải riêng",
          author: { uniqueId: "demo2", nickname: "Demo 2" },
          video: {
            duration: 12,
            downloadAddr: "https://cdn.example.com/logo.mp4",
            bitrateInfo: [
              {
                Bitrate: 300000,
                CodecType: "h264",
                Quality: "normal_540_0",
                PlayAddr: { Width: 576, Height: 768, DataSize: 900000, UrlList: ["https://cdn.example.com/v/plain.mp4"] }
              }
            ]
          }
        }
      }
    }
  }
};

const PAGE_HTML = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><style>
  body { margin: 0; background: #101116; color: white; font: 16px system-ui; }
  main { width: 400px; margin: 30px auto; }
  video { display: block; width: 360px; height: 500px; background: #303545; }
  article { height: 900px; }
  #interface { position: fixed; top: 16px; left: 16px; }
  .css-4--DivMediaCardOverlayBottomSection { color: #cfe; }
  .css-5--DivVideoProgressContainer { color: #cfe; }
</style></head><body>
<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(PAGE_STATE)}</script>
<div id="interface">Giao diện TikTok</div>
<main>
  <article id="first">
    <section data-e2e="feed-video">
      <div class="css-1--DivBasicPlayerWrapper">
        <div class="css-2--DivContainer">
          <div class="css-3--BasePlayerContainer css-3--DivVideoPlayerContainer">
            <video id="one" style="transform: translateX(12px); scale: 0.9 0.8"></video>
          </div>
        </div>
      </div>
      <div class="css-4--DivMediaCardOverlayBottomSection" id="caption">CapCut · Giao diện</div>
      <div class="css-5--DivVideoProgressContainer" id="progress">00:02 / 00:28</div>
      <div class="css-6--ButtonActionItem" id="rail">Thích</div>
    </section>
  </article>
  <article id="second"><video id="two"></video></article>
</main></body></html>`;

// Mô phỏng cấu trúc thật của trang video Douyin (đo trên douyin.com): player xgplayer
// trong `[data-e2e="player-container"]`, đạn màn hình, dòng khai báo của tác giả,
// thanh tiến trình và cụm nút thao tác nằm ngoài vùng video.
const DOUYIN_HTML = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>
  body { margin: 0; background: #161823; color: #fff; font: 16px system-ui; }
  .basePlayerContainer { position: relative; width: 640px; height: 480px; margin: 24px auto; background: #000; }
  xg-video-container { display: block; width: 100%; height: 100%; }
  video { display: block; width: 100%; height: 100%; background: #222; }
  .xgplayer-progress { position: absolute; left: 0; right: 0; bottom: 0; height: 12px; background: #fffc; }
  .player-position-box-bottom { position: absolute; left: 12px; bottom: 24px; font-size: 13px; }
  [data-e2e="danmaku-container"] { position: absolute; inset: 0 0 auto; padding: 8px; color: #ffd; }
  .leftContainer { position: absolute; right: 16px; top: 120px; display: flex; flex-direction: column; gap: 12px; }
  [data-e2e="detail-video-info"] { width: 640px; margin: 0 auto; color: #ccc; }
</style></head><body>
<div data-e2e="player-container" class="video_7697907897409228095 video-detail-container newVideoPlayer detailNotFullScreen">
  <div class="basePlayerContainer xgplayer xgplayer-pc xgplayer-playing">
    <xg-video-container class="xg-video-container"><video id="dy-one"></video></xg-video-container>
    <div class="xgplayer-dynamic-bg"></div>
    <div data-e2e="danmaku-container" class="danmakuContainer"><div class="danmu">弹幕 bay ngang</div></div>
    <div class="OyvCbdyB player-position-box-bottom">作者声明：内容由 AI 生成</div>
    <div class="xgplayer-progress"><div class="xgplayer-progress-inner"><div class="xgplayer-progress-played"></div></div></div>
  </div>
  <div class="leftContainer">
    <div data-e2e="video-player-digg" class="likeIcon">赞</div>
    <div data-e2e="video-player-collect">收藏</div>
    <div data-e2e="video-player-share">分享</div>
    <div data-e2e="feed-comment-icon">评论</div>
  </div>
  <div data-e2e="detail-video-info" data-e2e-aweme-id="7697907897409228095">P1 置顶视频</div>
</div>
<div data-e2e="comment-list"><div class="comment-item">Bình luận thử</div></div>
</body></html>`;

async function launch({ routePage = true, browserArgs = [] } = {}) {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "tiktok-tools-test-"));
  const downloadDir = path.join(profile, "downloads");
  // Không để Chrome ghi file kiểm thử vào thư mục Downloads của người dùng.
  const defaultDir = path.join(profile, "Default");
  await fs.mkdir(downloadDir, { recursive: true });
  await fs.mkdir(defaultDir, { recursive: true });
  await fs.writeFile(path.join(defaultDir, "Preferences"), JSON.stringify({
    download: { default_directory: downloadDir, prompt_for_download: false, directory_upgrade: true }
  }));
  const extensionPath = path.resolve(__dirname, "../../extension");
  const context = await chromium.launchPersistentContext(profile, {
    channel: process.env.TIKTOK_TOOLS_BROWSER_PATH ? undefined : "chromium",
    executablePath: process.env.TIKTOK_TOOLS_BROWSER_PATH,
    ignoreDefaultArgs: ["--disable-extensions"],
    acceptDownloads: true,
    headless: true,
    viewport: { width: 1100, height: 760 },
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, ...browserArgs]
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  // Download do chrome.downloads tạo ra không đi qua Playwright, nên đặt thư mục đích
  // bằng CDP để không ghi vào thư mục Downloads của người dùng.
  try {
    const browser = context.browser();
    if (browser) {
      const session = await browser.newBrowserCDPSession();
      await session.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir });
    }
  } catch {
    // Preferences ở trên vẫn là phương án dự phòng.
  }
  if (routePage) {
    await context.route("https://www.tiktok.com/**", route => {
      if (route.request().resourceType() === "document") {
        return route.fulfill({ contentType: "text/html", body: PAGE_HTML });
      }
      return route.abort();
    });
    await context.route("https://www.douyin.com/**", route => {
      if (route.request().resourceType() === "document") {
        return route.fulfill({ contentType: "text/html", body: DOUYIN_HTML });
      }
      return route.abort();
    });
  }
  return { context, worker, profile, extensionPath, downloadDir };
}

async function listFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(full));
    else files.push(full);
  }
  return files;
}

// Playwright và chrome.downloads dùng chung chế độ tải của trình duyệt, nên tệp
// luôn nằm trong downloadDir của hồ sơ kiểm thử, không phải thư mục artifact.
async function waitForDownload(harness, expectedName = null, timeout = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const ready = (await listFiles(harness.downloadDir)).filter(file => !file.endsWith(".crdownload"));
    const match = expectedName ? ready.filter(file => path.basename(file) === expectedName) : ready;
    if (match.length) {
      const stat = await fs.stat(match[0]);
      if (stat.size > 0) return { path: match[0], name: path.basename(match[0]), bytes: stat.size };
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error("Không thấy tệp tải xuống trong thư mục kiểm thử.");
}

async function dispose(harness) {
  await harness.context.close();
  if (harness.profile) {
    const target = path.resolve(harness.profile);
    const parent = path.resolve(os.tmpdir());
    if (path.dirname(target) !== parent || !path.basename(target).startsWith("tiktok-tools-test-")) {
      throw new Error("Unexpected temporary profile path; refusing to delete it.");
    }
    await fs.rm(target, { recursive: true, force: true });
  }
}

async function openTikTok(harness, pathname = "/foryou") {
  const page = await harness.context.newPage();
  await page.goto(`https://www.tiktok.com${pathname}`);
  await expect(page.locator("#tiktok-tools-control")).toBeVisible();
  return page;
}

async function openDouyin(harness, pathname = "/video/7697907897409228095") {
  const page = await harness.context.newPage();
  await page.goto(`https://www.douyin.com${pathname}`);
  await expect(page.locator("#tiktok-tools-control")).toBeVisible();
  return page;
}

async function resetStorage(worker) {
  await worker.evaluate(() => chrome.storage.local.clear());
}

// Gửi thông điệp qua content script của tab đang hoạt động, trả về phần `data`.
async function send(harness, page, type, payload = {}) {
  await page.bringToFront();
  const response = await harness.worker.evaluate(async ({ type, payload }) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return chrome.tabs.sendMessage(tab.id, { type, payload, requestId: "test" });
  }, { type, payload });
  if (!response?.ok) throw new Error(response?.error?.message || `Thông điệp ${type} thất bại`);
  return response.data;
}

async function sendRaw(harness, page, type, payload = {}) {
  await page.bringToFront();
  return harness.worker.evaluate(async ({ type, payload }) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return chrome.tabs.sendMessage(tab.id, { type, payload, requestId: "test" });
  }, { type, payload });
}

async function writeSettings(harness, value) {
  await harness.worker.evaluate(value => chrome.storage.local.set({ tiktokToolsSettings: value }), value);
}

async function readSettings(harness) {
  const stored = await harness.worker.evaluate(() => chrome.storage.local.get("tiktokToolsSettings"));
  return stored.tiktokToolsSettings;
}

async function openPopup(harness, page) {
  const popup = await harness.context.newPage();
  await page.bringToFront();
  await popup.goto(`chrome-extension://${new URL(harness.worker.url()).host}/popup/popup.html`);
  // Popup thật rộng 360px; tab kiểm thử phải được thu về cùng kích thước.
  await popup.setViewportSize({ width: 360, height: 600 });
  return popup;
}

// Video phát thật bằng MediaStream từ canvas, để kiểm thử play/pause và khung hình.
async function useCanvasVideo(page, selector = "#one", { width = 320, height = 240 } = {}) {
  await page.locator(selector).evaluate(async (video, size) => {
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ff0000";
    context.fillRect(0, 0, size.width / 2, size.height);
    context.fillStyle = "#0000ff";
    context.fillRect(size.width / 2, 0, size.width / 2, size.height);
    video.srcObject = canvas.captureStream(10);
    video.muted = true;
    await video.play().catch(() => {});
  }, { width, height });
  await page.waitForFunction(selector => {
    const video = document.querySelector(selector);
    return Boolean(video) && video.videoWidth > 0 && video.readyState >= 2;
  }, selector, { timeout: 10_000 });
}

async function useEnhancedPlayer(page) {
  await page.locator("#one").evaluate(video => {
    const player = document.createElement("div");
    player.style.cssText = "position:relative;width:360px;height:500px";
    video.before(player);
    player.append(video);
    video.style.opacity = "0";
    const wrapper = document.createElement("tt-vod-sr-wrap");
    wrapper.id = "enhanced-player";
    wrapper.style.cssText = "position:absolute;inset:0;display:block;overflow:hidden;pointer-events:none";
    const canvas = document.createElement("canvas");
    canvas.width = 360;
    canvas.height = 500;
    canvas.style.cssText = "position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:360px;height:500px";
    const drawing = canvas.getContext("2d");
    drawing.fillStyle = "#42e3ce";
    drawing.fillRect(0, 0, 180, 500);
    drawing.fillStyle = "#fa4268";
    drawing.fillRect(180, 0, 180, 500);
    wrapper.append(canvas);
    player.append(wrapper);
    const placeholder = document.createElement("canvas");
    placeholder.id = "placeholder";
    player.before(placeholder);
  });
}

// Playwright bật "focus emulation" để mọi tab luôn tưởng mình đang focus. Tắt đi
// thì trình duyệt mới báo đúng trạng thái focus khi chuyển tab.
async function disableFocusEmulation(context, page) {
  try {
    const session = await context.newCDPSession(page);
    await session.send("Emulation.setFocusEmulationEnabled", { enabled: false });
  } catch {
    // Trình duyệt khác có thể không hỗ trợ; bài kiểm thử sẽ báo lỗi rõ ràng.
  }
}

// Đưa tab TikTok về nền bằng cách mở và kích hoạt một tab khác.
async function moveToBackground(harness, page) {
  const other = await harness.context.newPage();
  await other.goto("about:blank");
  await other.bringToFront();
  await expect.poll(() => page.evaluate(() => document.hasFocus()), { timeout: 5_000 }).toBe(false);
  return other;
}

// Đóng các tab phụ; có giới hạn thời gian vì trang đang tải tệp có thể chậm đóng.
async function closeExtraTabs(harness) {
  for (const tab of harness.context.pages().slice(1)) {
    await Promise.race([
      tab.close().catch(() => {}),
      new Promise(resolve => setTimeout(resolve, 3_000))
    ]);
  }
}

// Thay fetch trong service worker để giả lập tikwm.com, không gọi mạng thật.
const PROXY_PAYLOAD = {
  id: "7699174948165651743",
  title: "Demo clip",
  author: { unique_id: "demo", nickname: "Demo" },
  play: "https://cdn.example.com/proxy/play.mp4",
  hdplay: "https://cdn.example.com/proxy/hd.mp4",
  wmplay: "https://cdn.example.com/proxy/wm.mp4",
  music: "https://cdn.example.com/proxy/music.mp3",
  size: 1000,
  hd_size: 2000,
  wm_size: 1500,
  duration: 28
};

async function stubProxy(harness, { data = PROXY_PAYLOAD, error = null, keepRows = false } = {}) {
  await harness.worker.evaluate(({ data, error, keepRows }) => {
    if (!self.__originalFetch) self.__originalFetch = self.fetch;
    self.__proxyCalls = [];
    TikTokTools.proxyService.clearCache();
    // keepRows: giữ kết quả phân tích để mô phỏng dịch vụ hỏng đúng lúc bấm tải.
    if (!keepRows) TikTokTools.downloadsService.clearCache?.();
    self.fetch = async (url, init) => {
      self.__proxyCalls.push({ url: String(url), body: init?.body ? String(init.body) : null });
      const body = error ? { code: 400, msg: error } : { code: 0, data };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    };
  }, { data, error, keepRows });
}

async function proxyCalls(harness) {
  return harness.worker.evaluate(() => self.__proxyCalls || []);
}

// Hình dạng trả về của máy chủ tải Douyin (giống API seekin.ai mà người dùng đã đo):
// 1080p bị khoá, 720p/540p có link.
const DOUYIN_PAYLOAD = {
  code: "0000",
  msg: "请求成功",
  data: {
    title: "非洲草原超级杯",
    imageUrl: "https://p95.douyinpic.test/cover.jpeg",
    duration: null,
    medias: [
      { url: null, quality: "1080p", locked: true, format: "1080p (13.30 MB) [.mp4]", fileSize: 13943633, sizeStr: "13.30 MB" },
      { url: "https://v26-kefu.douyinvod.test/video/720.mp4", quality: "720p", locked: false, format: "720p (10.08 MB) [.mp4]", fileSize: 10567934, sizeStr: "10.08 MB" },
      { url: "https://v26-kefu.douyinvod.test/video/540.mp4", quality: "540p", locked: false, format: "540p (10.15 MB) [.mp4]", fileSize: 10642817, sizeStr: "10.15 MB" }
    ],
    images: [],
    hdLifetime: false
  }
};

async function stubDouyin(harness, {
  payload = DOUYIN_PAYLOAD,
  status = 200,
  body = null,
  endpoint = "https://proxy.test/ikool/media/download",
  token = "test-token"
} = {}) {
  await harness.worker.evaluate(async ({ payload, status, body, endpoint, token }) => {
    if (!self.__originalFetch) self.__originalFetch = self.fetch;
    if (!self.__originalContains) self.__originalContains = chrome.permissions.contains;
    self.__douyinCalls = [];
    TikTokTools.douyinService.clearCache();
    // Trong kiểm thử coi như người dùng đã cấp quyền cho endpoint giả.
    chrome.permissions.contains = async () => true;
    self.fetch = async (url, init) => {
      self.__douyinCalls.push({
        url: String(url),
        method: init?.method || null,
        body: init?.body ? String(init.body) : null,
        headers: init?.headers || null,
        credentials: init?.credentials || null
      });
      return new Response(body || JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" }
      });
    };
    await chrome.storage.local.remove([TikTokTools.douyinService.ENDPOINT_KEY, TikTokTools.douyinService.TOKEN_KEY]);
    if (endpoint) await chrome.storage.local.set({
      [TikTokTools.douyinService.ENDPOINT_KEY]: endpoint,
      [TikTokTools.douyinService.TOKEN_KEY]: token
    });
  }, { payload, status, body, endpoint, token });
}

async function douyinCalls(harness) {
  return harness.worker.evaluate(() => self.__douyinCalls || []);
}

async function resetDouyin(harness) {
  await harness.worker.evaluate(async () => {
    if (self.__originalFetch) self.fetch = self.__originalFetch;
    if (self.__originalContains) chrome.permissions.contains = self.__originalContains;
    self.__douyinCalls = [];
    TikTokTools.douyinService.clearCache();
    await chrome.storage.local.remove([TikTokTools.douyinService.ENDPOINT_KEY, TikTokTools.douyinService.TOKEN_KEY]);
  });
}

async function resetProxy(harness) {
  await harness.worker.evaluate(() => {
    if (self.__originalFetch) self.fetch = self.__originalFetch;
    self.__proxyCalls = [];
    TikTokTools.proxyService.clearCache();
  });
}

// Thay chrome.downloads.download để kiểm tra tham số tải mà không cần mạng.
async function stubDownloads(harness) {
  await harness.worker.evaluate(() => {
    self.__downloads = [];
    if (!self.__originalDownload) self.__originalDownload = chrome.downloads.download;
    chrome.downloads.download = async options => {
      self.__downloads.push(options);
      return 1000 + self.__downloads.length;
    };
  });
}

async function lastDownload(harness) {
  return harness.worker.evaluate(() => (self.__downloads || []).at(-1) || null);
}

// Xoá các job đang giữ trong service worker giữa các bài kiểm thử.
async function cancelJobs(harness) {
  const page = await harness.context.newPage();
  await page.goto(`chrome-extension://${new URL(harness.worker.url()).host}/popup/popup.html`);
  const ids = await page.evaluate(async () => {
    const status = await chrome.runtime.sendMessage({ type: "DOWNLOAD_STATUS", payload: {}, requestId: "cleanup" });
    return (status?.data || []).map(job => job.downloadId);
  });
  for (const id of ids) {
    await page.evaluate(id => chrome.runtime.sendMessage({
      type: "DOWNLOAD_CANCEL",
      payload: { downloadId: id },
      requestId: "cleanup"
    }), id);
  }
  await page.close();
  await resetProxy(harness);
}

module.exports = {
  PAGE_HTML,
  DOUYIN_HTML,
  marked,
  launch,
  dispose,
  openTikTok,
  openDouyin,
  openPopup,
  resetStorage,
  send,
  sendRaw,
  readSettings,
  writeSettings,
  useCanvasVideo,
  useEnhancedPlayer,
  waitForDownload,
  disableFocusEmulation,
  moveToBackground,
  closeExtraTabs,
  stubDownloads,
  stubProxy,
  PROXY_PAYLOAD,
  proxyCalls,
  resetProxy,
  stubDouyin,
  DOUYIN_PAYLOAD,
  douyinCalls,
  resetDouyin,
  lastDownload,
  cancelJobs
};
