const { test, expect } = require("@playwright/test");
const h = require("./fixtures/harness");

let harness;

test.beforeAll(async () => {
  harness = await h.launch();
});

test.afterAll(async () => {
  await h.dispose(harness);
});

// Chỉ kiểm tra các hàm thuần của douyin-native trong service worker thật;
// phần gọi mạng được kiểm tra bằng tools/douyin-native-check.cjs (--live).
test("douyin-native: playwm -> play, bit_rate thành nhiều bản, HTML chỉ lấy link tải", async () => {
  const result = await harness.worker.evaluate(() => {
    const native = TikTokTools.douyinNative;
    const fromIteminfo = native.extractFromItemInfo({
      status_code: 0,
      item_list: [{
        desc: "Video test",
        video: {
          play_addr: { url_list: ["https://aweme.snssdk.com/aweme/v1/playwm/?video_id=v0200f&ratio=720p&line=0"] },
          bit_rate: [
            { gear_name: "720p", play_addr: { url_list: ["https://aweme.snssdk.com/aweme/v1/playwm/?video_id=v0200f&ratio=720p&line=0"] } },
            { gear_name: "1080p", play_addr: { url_list: ["https://v26.douyinvod.com/aweme/v1/play/?video_id=v0200f&ratio=1080p"] } }
          ]
        }
      }]
    });
    const fromPage = native.extractFromPageHtml(
      '<script>{"playAddr":"https:\\/\\/aweme.snssdk.com\\/aweme\\/v1\\/playwm\\/?video_id=v0200f&ratio=720p"}</script>'
    );
    return {
      iteminfoUrls: fromIteminfo.medias.map(item => item.url),
      iteminfoQualities: fromIteminfo.medias.map(item => item.quality),
      pageUrls: fromPage.medias.map(item => item.url),
      empty: native.extractFromItemInfo({ status_code: 0, item_list: [] }),
      noSource: native.extractFromPageHtml("<html></html>")
    };
  });
  expect(result.iteminfoUrls).toEqual([
    "https://aweme.snssdk.com/aweme/v1/play/?video_id=v0200f&ratio=720p&line=0",
    "https://v26.douyinvod.com/aweme/v1/play/?video_id=v0200f&ratio=1080p"
  ]);
  expect(result.iteminfoQualities).toEqual(["720p", "1080p"]);
  expect(result.pageUrls).toEqual([
    "https://aweme.snssdk.com/aweme/v1/play/?video_id=v0200f&ratio=720p"
  ]);
  expect(result.empty).toBeNull();
  expect(result.noSource).toBeNull();
});
