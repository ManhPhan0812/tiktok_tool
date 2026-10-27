"use strict";
// Node check cho services/ttget.js với dữ liệu tổng hợp theo đúng dạng
// ttget trả (không dùng link/token thật của người dùng).
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const src = fs.readFileSync(path.join(__dirname, "..", "extension", "services", "ttget.js"), "utf8");
const sandbox = { globalThis: {}, fetch: undefined, AbortController, setTimeout, clearTimeout, URL };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const ttget = sandbox.TikTokTools.ttgetService;

let failures = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${cond ? "" : ` ${extra}`}`);
  if (!cond) failures += 1;
}

const sample = {
  data: {
    cover: "https://example.test/cover.jpg",
    desc: "Video test tong hop",
    pages: [[
      { type: "video", label: "Video No Watermark (1920x1080)", link: "https://ttget.com/dl/?t=A", link2: "https://dl.ttget.com/dl?t=B", direct_link: null },
      { type: "video", label: "Video + Watermark", link: "https://ttget.com/dl/?t=C", link2: "https://dl.ttget.com/dl?t=D", direct_link: null },
      { type: "video", label: "Video No Watermark HD", link: "https://ttget.com/dl/?t=E", link2: null, direct_link: null },
      { type: "music", label: "Audio Only", link: "https://ttget.com/dl/?t=F", link2: "https://dl.ttget.com/dl?t=G", direct_link: null }
    ]]
  }
};

const extracted = ttget.extract(sample);
check("extract: bo ban watermark, giu 3 ban", extracted && extracted.medias.length === 3,
  JSON.stringify(extracted && extracted.medias.map(m => m.quality)));
check("extract: 1920x1080 -> 1080p, uu tien link2", extracted.medias[0].quality === "1080p"
  && extracted.medias[0].url === "https://dl.ttget.com/dl?t=B", JSON.stringify(extracted.medias[0]));
check("extract: HD khong do phan giai -> HD, Audio giu nguyen", extracted.medias[1].quality === "HD"
  && extracted.medias[2].quality === "Audio", JSON.stringify(extracted.medias.map(m => m.quality)));
check("extract: title/cover lay tu desc/cover", extracted.title === "Video test tong hop"
  && extracted.cover === "https://example.test/cover.jpg");

const direct = ttget.extract({ data: { pages: [[{ type: "video", label: "Video No Watermark (1280x720)",
  link: "https://ttget.com/dl/?t=A", link2: "https://dl.ttget.com/dl?t=B",
  direct_link: "https://dl.ttget.com/dl?t=DIRECT" }]] } });
check("extract: direct_link duoc uu tien hon link2", direct.medias[0].url === "https://dl.ttget.com/dl?t=DIRECT"
  && direct.medias[0].quality === "720p", JSON.stringify(direct.medias[0]));

check("extract: pages rong -> null", ttget.extract({ data: { pages: [] } }) === null);
check("extract: link tro lai trang Douyin bi loai", ttget.extract({ data: { pages: [[{ type: "video",
  label: "Video No Watermark", link: "https://www.douyin.com/video/1", link2: null, direct_link: null }]] } }) === null);

(async () => {
  const seen = {};
  const stubFetch = async (url, init) => {
    seen.url = url;
    seen.init = init;
    return { ok: true, json: async () => sample };
  };
  const result = await ttget.resolve("https://www.douyin.com/video/7669768092729363764", stubFetch);
  check("resolve: POST toi go.ttget.com/info", seen.url === "https://go.ttget.com/info", seen.url);
  check("resolve: body form l=<url>", seen.init.method === "POST"
    && seen.init.body === "l=https%3A%2F%2Fwww.douyin.com%2Fvideo%2F7669768092729363764", seen.init.body);
  check("resolve: header form + lang vi, khong gui tw",
    seen.init.headers["content-type"] === "application/x-www-form-urlencoded;charset=UTF-8"
    && seen.init.headers.lang === "vi" && !("tw" in seen.init.headers),
    JSON.stringify(seen.init.headers));
  check("resolve: referrer ttget.com", seen.init.referrer === "https://ttget.com/", seen.init.referrer);
  check("resolve: accept-language uu tien vi", seen.init.headers["accept-language"] === "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    seen.init.headers["accept-language"]);

  const seenTw = {};
  const twFetch = async (url, init) => {
    seenTw.init = init;
    return { ok: true, json: async () => sample };
  };
  await ttget.resolve("https://www.douyin.com/video/1", twFetch, "TEST_TW_TOKEN");
  check("resolve: tokenOverride thi gui header tw", seenTw.init.headers.tw === "TEST_TW_TOKEN",
    JSON.stringify(seenTw.init.headers));
  check("resolve: khong co token thi khong gui tw", !("tw" in seen.init.headers));
  check("resolve: ok va co medias", result.ok === true && result.medias.length === 3, JSON.stringify(result));

  const empty = await ttget.resolve("https://www.douyin.com/video/1", async () => ({ ok: true, json: async () => ({ data: { pages: [] } }) }));
  check("resolve: pages rong -> NO_PAGES", empty.ok === false && empty.reason === "NO_PAGES", JSON.stringify(empty));

  const httpFail = await ttget.resolve("https://www.douyin.com/video/1", async () => ({ ok: false, status: 403 }));
  check("resolve: HTTP 403 -> HTTP_403", httpFail.ok === false && httpFail.reason === "HTTP_403", JSON.stringify(httpFail));

  if (failures) { console.error(`${failures} check that bai`); process.exit(1); }
  console.log("Tat ca check ttget deu pass.");
})();
