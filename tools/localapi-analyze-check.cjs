"use strict";
// Node check cho đường analyze() của services/douyin.js khi có bước API
// tự host: lỗi không-fatal của API local phải được gắn vào lỗi cuối,
// còn khi chưa cấu hình base thì lỗi cuối giữ nguyên như cũ.
// Dữ liệu và token đều tổng hợp; không dùng base/token thật.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadService(sandbox, rel) {
  const src = fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
  vm.runInContext(src, sandbox);
}

let storageData = {};
let fetchMode = "http401";
const sampleDetail = {
  data: {
    desc: "Video test tong hop",
    height: 2160,
    width: 3840,
    duration: "00:04:21",
    downloads: "https://example.test/aweme/v1/play/?video_id=TEST&is_play_url=1",
    music_url: "https://example.test/music.mp3",
    dynamic_cover: "https://example.test/cover.jpg"
  }
};

const sandbox = {
  AbortController,
  setTimeout,
  clearTimeout,
  URL,
  chrome: {
    storage: { local: { get: async () => ({ ...storageData }) } },
    tabs: { sendMessage: async () => { throw new Error("no receiver"); } },
    permissions: { contains: async () => true }
  },
  fetch: async () => {
    if (fetchMode === "ok") return { ok: true, json: async () => sampleDetail };
    return { ok: false, status: 401 };
  }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
loadService(sandbox, "extension/shared/messages.js");
loadService(sandbox, "extension/shared/validation.js");
loadService(sandbox, "extension/services/localapi.js");
loadService(sandbox, "extension/services/douyin.js");
const ns = sandbox.TikTokTools;
// Stub provider cuối: ttget luôn hết bản, để kiểm tra lỗi cuối.
ns.ttgetService = { resolve: async () => ({ ok: false, reason: "NO_PAGES" }) };

let failures = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${cond ? "" : ` ${extra}`}`);
  if (!cond) failures += 1;
}

const TEST_URL = "https://www.douyin.com/video/7694482002766073139";

(async () => {
  // Ca 1: đã cấu hình base + token, API trả HTTP 401, ttget hết bản.
  storageData = { douyinLocalBase: "http://127.0.0.1:5556", douyinLocalToken: "TEST_TOKEN" };
  fetchMode = "http401";
  const failed = await ns.douyinService.analyze({ url: TEST_URL });
  const msg1 = failed?.error?.message || "";
  check("local loi + ttget loi: van fail", failed.ok === false, JSON.stringify(failed));
  check("loi cuoi giu loi ttget", msg1.includes("ttget.com không trả bản tải cho video này"), msg1);
  check("loi cuoi gan them dong API tu host", msg1.includes("API tự host cũng đã thử và lỗi"), msg1);
  check("dong API tu host neu ro HTTP 401", msg1.includes("HTTP 401"), msg1);
  check("thong bao khong lo token", !msg1.includes("TEST_TOKEN"), msg1);
  check("thong bao khong lo base URL", !msg1.includes("127.0.0.1"), msg1);

  // Ca 2: chưa cấu hình base -> bước local bị bỏ qua, lỗi cuối nguyên vẹn.
  storageData = {};
  const failedNoLocal = await ns.douyinService.analyze({ url: TEST_URL });
  const msg2 = failedNoLocal?.error?.message || "";
  check("chua cau hinh: van fail bang loi ttget", failedNoLocal.ok === false
    && msg2.includes("ttget.com không trả bản tải cho video này"), msg2);
  check("chua cau hinh: khong co dong API tu host", !msg2.includes("API tự host cũng đã thử"), msg2);

  // Ca 3: API local thành công -> trả kết quả local, không rơi xuống ttget.
  storageData = { douyinLocalBase: "http://127.0.0.1:5556", douyinLocalToken: "TEST_TOKEN" };
  fetchMode = "ok";
  const ok = await ns.douyinService.analyze({ url: TEST_URL });
  check("local thanh cong: ok", ok.ok === true, JSON.stringify(ok));
  check("local thanh cong: provider la host cua base",
    ok.data?.provider === "127.0.0.1:5556", JSON.stringify(ok.data?.provider));
  check("local thanh cong: 2 ban video + Audio",
    ok.data?.rows?.length === 2 && ok.data.rows[0].label === "2160p" && ok.data.rows[1].label === "Audio",
    JSON.stringify(ok.data?.rows?.map(r => r.label)));
  check("local thanh cong: duration 261 giay", ok.data?.duration === 261, JSON.stringify(ok.data?.duration));

  if (failures) { console.error(`${failures} check that bai`); process.exit(1); }
  console.log("Tat ca check localapi-analyze deu pass.");
})();
