// Kiểm tra logic lấy link Douyin trực tiếp (services/douyin-native.js) mà không
// cần chạy extension: dữ liệu giả lập cho các hàm thuần, và --live để thử thật
// với một videoId (không tải file, chỉ in link tìm được).
// Usage:
//   node tools/douyin-native-check.cjs
//   node tools/douyin-native-check.cjs --live 7699882284404591872
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const sandbox = { console, URL, AbortController, setTimeout, clearTimeout };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, "extension/services/douyin-native.js"), "utf8"), sandbox);
const native = sandbox.TikTokTools.douyinNative;

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures += 1;
    console.error(`FAIL ${name}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok ${name}`);
  }
}

const iteminfo = {
  status_code: 0,
  item_list: [{
    desc: "Video test",
    video: {
      duration: 12,
      play_addr: { url_list: ["https://aweme.snssdk.com/aweme/v1/playwm/?video_id=v0200f&ratio=720p&line=0"] },
      bit_rate: [
        { gear_name: "720p", play_addr: { url_list: ["https://aweme.snssdk.com/aweme/v1/playwm/?video_id=v0200f&ratio=720p&line=0"] } },
        { gear_name: "1080p", play_addr: { url_list: ["https://v26.douyinvod.com/aweme/v1/play/?video_id=v0200f&ratio=1080p"] } }
      ],
      origin_cover: { url_list: ["https://p3.douyinvod.com/cover.jpg"] }
    }
  }]
};
const fromIteminfo = native.extractFromItemInfo(iteminfo);
check("iteminfo: playwm -> play, giữ bit_rate", fromIteminfo.medias.map(m => `${m.quality}:${m.url.includes("/play/")}`), ["720p:true", "1080p:true"]);
check("iteminfo: title/cover", [fromIteminfo.title, fromIteminfo.cover], ["Video test", "https://p3.douyinvod.com/cover.jpg"]);
check("iteminfo: rỗng -> null", native.extractFromItemInfo({ status_code: 0, item_list: [] }), null);

const pageHtml = '<script>window.__data = {"video":{"playAddr":"https:\\/\\/aweme.snssdk.com\\/aweme\\/v1\\/playwm\\/?video_id=v0200f&ratio=720p","downloadAddr":"https:\\/\\/www.douyin.com\\/video\\/123"}};</script>';
const fromPage = native.extractFromPageHtml(pageHtml);
check("page: playAddr thoát \\/ -> play, bỏ link trang", fromPage.medias.map(m => m.url), ["https://aweme.snssdk.com/aweme/v1/play/?video_id=v0200f&ratio=720p"]);
check("page: không có nguồn -> null", native.extractFromPageHtml("<html><body>hello</body></html>"), null);
check("toNoWatermark: giữ nguyên link play", native.toNoWatermark("https://x.example/play/?a=1"), "https://x.example/play/?a=1");
check("toNoWatermark: http -> null", native.toNoWatermark("http://x.example/playwm/"), null);

function stubResponse({ ok, status = 200, json = null, text = null }) {
  return { ok, status, json: async () => json, text: async () => text };
}

(async () => {
  // iteminfo thành công thì không gọi tiếp trang video.
  let calls = [];
  const fetchIteminfoOk = async (url) => {
    calls.push(url);
    return url.includes("iteminfo") ? stubResponse({ ok: true, json: iteminfo }) : stubResponse({ ok: false, status: 500 });
  };
  const resolved1 = await native.resolveNative({ videoId: "123456789" }, fetchIteminfoOk);
  check("resolve: iteminfo ok -> source iteminfo, 1 fetch", [resolved1.ok, resolved1.source, calls.length], [true, "iteminfo", 1]);

  // iteminfo rỗng, trang video có playAddr -> source page.
  calls = [];
  const fetchPageFallback = async (url) => {
    calls.push(url);
    return url.includes("iteminfo")
      ? stubResponse({ ok: true, json: { status_code: 0, item_list: [] } })
      : stubResponse({ ok: true, text: pageHtml });
  };
  const resolved2 = await native.resolveNative({ videoId: "123456789" }, fetchPageFallback);
  check("resolve: iteminfo rỗng -> fallback page", [resolved2.ok, resolved2.source], [true, "page"]);

  // Trang captcha -> báo rõ lý do, không đoán link.
  const fetchCaptcha = async (url) => url.includes("iteminfo")
    ? stubResponse({ ok: true, json: { status_code: 0, item_list: [] } })
    : stubResponse({ ok: true, text: "<html>请完成验证码验证</html>" });
  const resolved3 = await native.resolveNative({ videoId: "123456789" }, fetchCaptcha);
  check("resolve: captcha -> ok:false, reason CAPTCHA", [resolved3.ok, resolved3.reason], [false, "CAPTCHA"]);

  const liveIndex = process.argv.indexOf("--live");
  const liveId = liveIndex >= 0 ? process.argv[liveIndex + 1] : null;
  if (liveId) {
    console.log(`\n--live ${liveId}: gọi thật iteminfo + trang video (không tải file)`);
    const live = await native.resolveNative({ videoId: liveId });
    console.log(JSON.stringify({
      ok: live.ok,
      reason: live.reason || null,
      source: live.source || null,
      title: live.title || null,
      medias: (live.medias || []).map(m => ({ quality: m.quality, host: new URL(m.url).hostname, hasPlaywm: m.url.includes("playwm") }))
    }, null, 2));
    if (!live.ok) failures += 1;
  }

  if (failures) {
    console.error(`\n${failures} kiểm tra thất bại.`);
    process.exitCode = 1;
  } else {
    console.log("\nTất cả kiểm tra đều đạt.");
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
