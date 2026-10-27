// Kiểm tra logic bắt link từ trang Douyin đang mở (services/douyin-page.js
// và services/douyin-page-hook.js) bằng DOM/fetch giả lập, không cần extension.
// Usage: node tools/douyin-page-check.cjs
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
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
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

(async () => {
  // --- Hook MAIN world: bắt response aweme của trang, bỏ qua URL khác. ---
  const posted = [];
  const awemeJson = {
    aweme_detail: {
      aweme_id: "123456789",
      desc: "Video hook",
      video: {
        play_addr: { url_list: ["https://aweme.snssdk.com/aweme/v1/playwm/?video_id=v1&ratio=720p&line=0"] },
        bit_rate: [{ gear_name: "1080p", play_addr: { url_list: ["https://v26.douyinvod.com/aweme/v1/play/?video_id=v1&ratio=1080p"] } }]
      }
    }
  };
  const hookSandbox = {
    console,
    URL,
    URLSearchParams,
    postMessage: (message) => posted.push(message),
    addEventListener: () => {},
    fetch: async () => ({
      clone: () => ({ json: async () => awemeJson })
    }),
    XMLHttpRequest: function FakeXHR() {}
  };
  hookSandbox.window = hookSandbox;
  hookSandbox.globalThis = hookSandbox;
  vm.createContext(hookSandbox);
  vm.runInContext(fs.readFileSync(path.join(root, "extension/services/douyin-page-hook.js"), "utf8"), hookSandbox);
  await hookSandbox.fetch("https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=123456789");
  await hookSandbox.fetch("https://www.douyin.com/other/api");
  await tick();
  check("hook: chỉ bắt endpoint aweme, playwm -> play", posted.map(p => p.captured.medias.map(m => `${m.quality}:${m.url.includes("/play/")}`)), [["1080p:true", "Gốc:true"]]);
  check("hook: bỏ qua URL không phải aweme", posted.length, 1);
  check("hook: isAwemeEndpoint", [
    hookSandbox.__tiktokToolsDouyinHook.isAwemeEndpoint("https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=1"),
    hookSandbox.__tiktokToolsDouyinHook.isAwemeEndpoint("https://www.douyin.com/video/1")
  ], [true, false]);

  // --- Content world: capture từ <video>, script, hook store. ---
  function makePage({ pathname, search, videos, scripts }) {
    const sandbox = {
      console,
      URL,
      URLSearchParams,
      location: { pathname, search },
      chrome: { runtime: { getURL: (p) => `chrome-extension://x/${p}` } },
      addEventListener: () => {},
      document: {
        querySelector: () => null,
        querySelectorAll: (selector) => {
          if (selector === "video") return videos;
          if (selector === "script") return scripts.map(text => ({ textContent: text }));
          return [];
        },
        createElement: () => ({ dataset: {} }),
        documentElement: { appendChild: () => {} },
        head: null
      }
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(root, "extension/services/douyin-page.js"), "utf8"), sandbox);
    return sandbox.TikTokTools.douyinPage;
  }

  const page1 = makePage({
    pathname: "/video/123456789", search: "",
    videos: [{ tagName: "VIDEO", currentSrc: "https://aweme.snssdk.com/aweme/v1/playwm/?video_id=v1&ratio=720p&line=0", src: "", paused: false }],
    scripts: []
  });
  const cap1 = page1.capture(null);
  check("page: <video> http -> dùng luôn, playwm -> play", [cap1.source, cap1.videoId, cap1.medias[0].url.includes("/play/")], ["video-element", "123456789", true]);

  const page2 = makePage({
    pathname: "/video/123456789", search: "",
    videos: [{ tagName: "VIDEO", currentSrc: "blob:https://www.douyin.com/abc", src: "", paused: false }],
    scripts: ['<script>{"video":{"playAddr":"https:\\/\\/aweme.snssdk.com\\/aweme\\/v1\\/playwm\\/?video_id=v1"}}</script>']
  });
  const cap2 = page2.capture(null);
  check("page: <video> blob + script trang video đơn -> script", [cap2.source, cap2.medias[0].url.includes("/play/")], ["page-script", true]);

  const page3 = makePage({
    pathname: "/", search: "",
    videos: [{ tagName: "VIDEO", currentSrc: "blob:https://www.douyin.com/abc", src: "", paused: false }],
    scripts: ['<script>{"video":{"playAddr":"https://aweme.snssdk.com/aweme/v1/playwm/?video_id=v9"}}</script>']
  });
  check("page: feed không videoId + blob + script -> null (không bắt nhầm)", page3.capture(null), null);

  const page4 = makePage({
    pathname: "/", search: "?modal_id=987654321",
    videos: [{ tagName: "VIDEO", currentSrc: "", src: "", paused: true }],
    scripts: []
  });
  check("page: videoId từ ?modal_id=", page4.videoIdFromPage(), "987654321");
  page4.remember({ videoId: "987654321", title: "Hook", cover: null, duration: null, medias: [{ url: "https://v26.douyinvod.com/aweme/v1/play/?video_id=v9", quality: "720p" }] });
  const cap4 = page4.capture(null);
  check("page: hook store khớp modal_id -> page-hook", [cap4.source, cap4.medias[0].quality], ["page-hook", "720p"]);

  if (failures) {
    console.error(`\n${failures} kiểm tra thất bại.`);
    process.exitCode = 1;
  } else {
    console.log("\nTất cả kiểm tra đều đạt.");
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
