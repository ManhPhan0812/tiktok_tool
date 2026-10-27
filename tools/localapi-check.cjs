"use strict";
// Node check cho services/localapi.js với dữ liệu tổng hợp theo đúng dạng
// API Douyin tự host trả (không dùng base URL, token hay video thật).
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const src = fs.readFileSync(path.join(__dirname, "..", "extension", "services", "localapi.js"), "utf8");
const sandbox = { globalThis: {}, fetch: undefined, AbortController, setTimeout, clearTimeout, URL };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const localApi = sandbox.TikTokTools.localApiService;

let failures = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${cond ? "" : ` ${extra}`}`);
  if (!cond) failures += 1;
}

// Dạng response thật của API (đã đổi host/id sang dữ liệu tổng hợp).
const sample = {
  message: "Successfully retrieved data!",
  data: {
    id: "7694482002766073139",
    desc: "Video test tong hop",
    create_time: "2026-10-09 09:00:02",
    type: "Video",
    height: 2160,
    width: 3840,
    downloads: "https://example.test/aweme/v1/play/?video_id=TEST&is_play_url=1",
    duration: "00:04:21",
    dynamic_cover: "https://example.test/cover.jpg",
    static_cover: "https://example.test/cover2.jpg",
    music_url: "https://example.test/music.mp3"
  },
  params: { cookie: "", proxy: "", source: false, detail_id: "7694482002766073139" }
};

const extracted = localApi.extract(sample);
check("extract: video 2160p + Audio", extracted && extracted.medias.length === 2
  && extracted.medias[0].quality === "2160p" && extracted.medias[1].quality === "Audio",
  JSON.stringify(extracted && extracted.medias));
check("extract: title/cover/duration", extracted.title === "Video test tong hop"
  && extracted.cover === "https://example.test/cover.jpg" && extracted.duration === 261,
  JSON.stringify({ title: extracted.title, cover: extracted.cover, duration: extracted.duration }));
check("extract: thieu downloads -> null", localApi.extract({ data: { desc: "x" } }) === null);
check("extract: downloads khong phai https -> null",
  localApi.extract({ data: { downloads: "http://example.test/v.mp4" } }) === null);
check("extract: khong co music_url thi chi 1 ban",
  localApi.extract({ data: { downloads: "https://example.test/v.mp4", height: 720 } }).medias.length === 1);
check("extract: khong co height -> Goc",
  localApi.extract({ data: { downloads: "https://example.test/v.mp4" } }).medias[0].quality === "Gốc");

check("normalizeBase: cat trailing slash", localApi.normalizeBase("http://127.0.0.1:5556/") === "http://127.0.0.1:5556");
check("normalizeBase: cat /douyin/detail neu user dan nguyen endpoint",
  localApi.normalizeBase("http://103.20.102.128:5556/douyin/detail") === "http://103.20.102.128:5556");
check("normalizeBase: tu choi scheme la", localApi.normalizeBase("ftp://example.test") === "");
check("normalizeBase: chuoi rong -> rong", localApi.normalizeBase("  ") === "");
check("durationToSeconds: MM:SS", localApi.durationToSeconds("04:21") === 261);
check("durationToSeconds: sai dinh dang -> null", localApi.durationToSeconds("khong ro") === null);

(async () => {
  const seen = {};
  const stubFetch = async (url, init) => {
    seen.url = url;
    seen.init = init;
    return { ok: true, json: async () => sample };
  };
  const result = await localApi.resolve("7694482002766073139", stubFetch,
    { base: "http://127.0.0.1:5556", token: "TEST_TOKEN" });
  check("resolve: POST toi <base>/douyin/detail", seen.url === "http://127.0.0.1:5556/douyin/detail", seen.url);
  check("resolve: body JSON detail_id", seen.init.method === "POST"
    && seen.init.body === JSON.stringify({ detail_id: "7694482002766073139" }), seen.init.body);
  check("resolve: header token khi co token",
    seen.init.headers["content-type"] === "application/json" && seen.init.headers.token === "TEST_TOKEN",
    JSON.stringify(seen.init.headers));
  check("resolve: ok va co medias", result.ok === true && result.medias.length === 2, JSON.stringify(result));

  const seenNoToken = {};
  const noTokenFetch = async (url, init) => {
    seenNoToken.init = init;
    return { ok: true, json: async () => sample };
  };
  await localApi.resolve("7694482002766073139", noTokenFetch, { base: "http://127.0.0.1:5556", token: "" });
  check("resolve: khong co token thi khong gui header token", !("token" in seenNoToken.init.headers),
    JSON.stringify(seenNoToken.init.headers));

  const noBase = await localApi.resolve("1", stubFetch, { base: "", token: "" });
  check("resolve: chua cau hinh base -> NOT_CONFIGURED", noBase.ok === false && noBase.reason === "NOT_CONFIGURED",
    JSON.stringify(noBase));

  const httpFail = await localApi.resolve("1", async () => ({ ok: false, status: 401 }), { base: "http://127.0.0.1:5556", token: "SAI" });
  check("resolve: HTTP 401 -> HTTP_401", httpFail.ok === false && httpFail.reason === "HTTP_401", JSON.stringify(httpFail));

  const nonJson = await localApi.resolve("1", async () => ({ ok: true, json: async () => { throw new Error("bad json"); } }),
    { base: "http://127.0.0.1:5556", token: "" });
  check("resolve: body khong phai JSON -> NON_JSON", nonJson.ok === false && nonJson.reason === "NON_JSON",
    JSON.stringify(nonJson));

  const noDownloads = await localApi.resolve("1", async () => ({ ok: true, json: async () => ({ data: {} }) }),
    { base: "http://127.0.0.1:5556", token: "" });
  check("resolve: khong co downloads -> NO_DOWNLOADS", noDownloads.ok === false && noDownloads.reason === "NO_DOWNLOADS",
    JSON.stringify(noDownloads));

  if (failures) { console.error(`${failures} check that bai`); process.exit(1); }
  console.log("Tat ca check localapi deu pass.");
})();
