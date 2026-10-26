# Trạng thái theo PLAN.md

## Hỗ trợ Douyin 0.0.4 — 26/10/2026

**Mục tiêu:** các tính năng xem chạy được trên `douyin.com` mà luồng TikTok không đổi hành vi. Tải video Douyin để sau (người dùng sẽ mô tả riêng).

**Đo trước khi sửa, trên trang thật (Edge, hồ sơ sạch):**

- `https://www.douyin.com/` trả về `验证码中间页` (captcha), body 4 ký tự; `/discover` chuyển sang `/jingxuan`, có lúc tải được feed nhưng video không tự phát.
- `https://www.douyin.com/video/7697907897409228095` phát được: `<video>` 1280×720 nằm trong `xg-video-container` → `.basePlayerContainer.xgplayer` → `[data-e2e="player-container"]`; không nằm trong shadow DOM.
- Đo trực tiếp trên trang đó: `playbackRate = 2` **giữ nguyên** sau 2,5 s, `transform: scaleX(-1)` áp được (`matrix(-1, 0, 0, 1, 0, 0)`), và `drawImage(video)` + `getImageData` **không bị taint** → lật, tốc độ và chụp khung hình khả thi.
- `data-e2e` có nhưng khác bộ TikTok: `player-container`, `danmaku-container`, `video-player-digg`, `feed-comment-icon`, `video-player-collect`, `video-player-share`, `detail-video-info`. Không có `tt-vod-sr-wrap`, `DivBasicPlayerWrapper` hay `data-e2e="feed-video"`.

**Thay đổi:**

1. `shared/platform.js` (mới): hồ sơ nền tảng gồm host, `filePrefix`, `renderer`, mẫu URL video và hàm dựng URL chuẩn. Danh sách host lấy từ `validation.hostPatterns` để chỉ có một nguồn.
2. `manifest.json`: thêm `https://www.douyin.com/*`, `https://douyin.com/*` vào `content_scripts.matches`, `host_permissions` và `web_accessible_resources`; nạp `shared/platform.js` trước `player/selectors.js`.
3. `player/selectors.js`: thành `selectorSets` theo nền tảng + `selectorsFor(id)`. Douyin: `renderer: null` (khung hình nằm trong `<video>`), `cleanTargets` là đạn màn hình, `.player-position-box-bottom`, `.xgplayer-progress`; `keepTargets` là cụm nút thao tác và `comment-list`.
4. `player/adapter.js`: lấy `renderer` theo nền tảng, `videoId()`, `author()`, `canonicalUrl()` dùng `ns.platform` (`https://www.douyin.com/video/<id>` cho Douyin).
5. `content.css`: thêm quy tắc Clean Mode cho Douyin (`danmaku-container`, `.danmu`, `.player-position-box-bottom`, `.xgplayer-progress`); ẩn đúng lớp phủ, không đụng nút thao tác/bình luận.
6. `content.js`: tên tệp chụp dùng `platform.filePrefix` (`douyin_…`), MutationObserver theo dõi cả `.xgplayer`/`[data-e2e="player-container"]`, `RESOLVE_VIDEO` trả `UNSUPPORTED_PLATFORM` trên Douyin thay vì `NO_SOURCE` mơ hồ.
7. `validation.js`: thêm `isDouyinUrl`, `isSupportedTabUrl`, `hostPatterns`; link Douyin trả `UNSUPPORTED_PLATFORM` để popup nói đúng lý do.
8. `popup.js` + `background.js`: nhãn "Đã kết nối tab <nền tảng>", hướng dẫn "Mở TikTok hoặc Douyin…", `eqNote` "Cần tab TikTok hoặc Douyin để bật", thông báo `NO_RECEIVER` gọn cho cả hai nền tảng.

**Kiểm chứng:** thêm `tests/douyin.spec.js` (7 bài) chạy trên fixture dựng theo đúng cấu trúc đo được: content script chạy và đọc đúng `videoId`/`canonicalUrl`; lật chỉ đụng `<video>` và khôi phục nguyên trạng; tốc độ áp dụng và theo tùy chọn đã lưu; Clean Mode ẩn đạn màn hình/khai báo/tiến trình nhưng giữ nút thao tác và bình luận; chụp PNG 320×240 tên `douyin_…_khung-hinh.png`; popup nhận đúng nền tảng và điều khiển được; link Douyin vào ô phân tích được định tuyến sang luồng tải Douyin.

**Tải Douyin (cùng bản 0.0.4):** đo trên trang thật cho thấy không có mp4 nguyên khối để lấy — `<video>` là `blob:` (MSE) và player tải riêng `media-video-avc1` + `media-audio-und-mp4a`; curl thẳng bị chặn bằng shell JS `_$jsvmprt`; `window.SSR_RENDER_DATA` (134 KB) không có `play_addr`; `iesdouyin.com/share/video/<id>` chỉ là app shell. Vì vậy `services/douyin.js` + `services/seekin.js` gọi seekin.ai: `POST /ikool/media/download` với `{"url": "<link Douyin>"}` và header `lang`/`timestamp`/`nonce`/`sign` sinh tại máy (HMAC-SHA256, có khoá epoch theo `timestamp/10000`), `credentials: "omit"` và không gửi `authorization`. Giữ đúng trạng thái `locked` máy chủ trả về và tải link CDN bằng `chrome.downloads`. API này trả 1080p `locked: true` không có link, 720p 10,08 MB, 540p 10,15 MB. Endpoint riêng vẫn đặt được qua `douyinEndpoint`/`douyinToken`. Hợp đồng và chính sách dữ liệu: [docs/DOUYIN-DOWNLOAD.md](DOUYIN-DOWNLOAD.md).

**Kiểm chứng tải:** `tests/douyin-download.spec.js` (11 bài) phủ bốn dạng link Douyin (`/video/`, `?modal_id=`, `iesdouyin/share`, `v.douyin.com`), từ chối host/path khác, mặc định gọi Seekin với chữ ký mới và không gửi token cũ, **chữ ký sinh ra khớp đúng `sign` của curl mẫu thật** (`a18a96ed…` với cùng `timestamp`/`nonce`) và đổi theo nội dung, từ chối ký cho host khác, `PERMISSION_REQUIRED` khi chưa cấp quyền origin, máy chủ báo `1001` → `UPSTREAM`, `5016` của Seekin → thông báo thử lại, chỉ có bản khoá → `NO_SOURCE`, popup hiện `1080p (khoá)` bị disable và 720p là lựa chọn chính, bấm tải gọi `chrome.downloads` với `Douyin/<id>_720p.mp4`.

Kết quả: **82/82 bài kiểm thử đạt** trên Edge. Toàn bộ 71 bài của bản xem-Douyin (gồm 64 bài TikTok cũ) vẫn xanh.

**Chưa kiểm chứng / giới hạn:** chưa gọi seekin.ai thật *từ extension* — mới stub `fetch` và đối chiếu chữ ký với curl mẫu (curl đó đã trả dữ liệu thật, nên thuật toán ký là đúng, nhưng chưa xác nhận được quyền truy cập origin `download.seekin.ai` khi chạy thật); chữ ký dựa trên tham số web-client quan sát từ frontend của họ nên có thể hỏng khi họ đổi; URL CDN Douyin hết hạn nhanh nên cache chỉ 60 giây; chưa thử trên phiên Douyin có đăng nhập; chưa thử chế độ toàn màn hình của `xgplayer`.

**Kiểm chứng trên trang thật:** viết `test-results/probe-douyin-live.cjs` nạp chính thư mục `extension/` vào Edge headless rồi mở `https://www.douyin.com/video/7697907897409228095`. Kết quả: content script chạy (nút nổi hiện), video 1280×720 đang phát, bấm nút nổi thì `<video>` nhận `data-tiktok-tools-mirrored` và `transform` thành `matrix(-1, 0, 0, 1, 0, 0)` — đúng hành vi mong đợi trên DOM thật, không chỉ fixture.

## Sửa Equalizer 0.0.2 — 23/10/2026

**Triệu chứng được xác nhận:** chọn Bass/Vocal/Treble nhưng ô hiện “Không phản hồi · đang thử lại” rồi tự trở về Tắt.

**Tái hiện nguyên nhân:** khi tạo offscreen thật, gửi `EQ_STATUS` từ popup nhận `{ ok: false, error: { code: "BAD_REQUEST", message: "Lệnh Equalizer không hợp lệ." } }`. Listener offscreen cũ nhận mọi lệnh có tiền tố `EQ_`, bao gồm lệnh dành cho background. Hai nơi tranh trả lời; `EQ_SET_PRESET` còn có thể trả trạng thái của offscreen trước khi background lưu preset.

**Bản sửa:**

- Message nội bộ có `target: "offscreen"`; background bỏ qua target này và offscreen chỉ nhận đúng bốn lệnh nội bộ. Không tranh trả lời các lệnh của popup.
- Stream ID được lấy trong service worker, đúng luồng worker → offscreen của [Chrome 116+](https://developer.chrome.com/docs/extensions/reference/api/tabCapture). Không còn lấy stream ID từ popup.
- Gửi tab ID vào phiên xử lý; đổi preset trong cùng tab dùng lại luồng và AudioContext. Bật/tắt/đổi preset được xếp hàng, có timeout và khóa UI trong lúc chuyển trạng thái.
- Polling cũ không ghi đè lựa chọn đang bật; nhãn chỉ báo “Đang bật” khi AudioContext đang `running` và audio track còn `live`.
- Theo dõi track kết thúc, dọn node/stream và khôi phục Tắt; limiter hạn chế đỉnh gain khi boost.

**Kiểm chứng chức năng:** `tests/equalizer-audio.spec.js` dùng vùng offscreen thật và đồ thị Web Audio thật. Chỉ nguồn âm/quyền capture được thay bằng stream tổng hợp ba tần số, không dùng âm thanh hay phiên Chrome cá nhân của người dùng. Đã đo đáp ứng sau bộ lọc: Bass tăng dải 60 Hz khoảng 2,1 dB; Vocal tăng 1 kHz khoảng 3,1 dB; Treble tăng 12 kHz khoảng 2,3 dB so với Normal. Các phép đo này không thay cho nghe thử chất lượng trên loa/tai nghe.

Ba kiểm thử tích hợp xác nhận thêm: không nhận nhầm lệnh khi offscreen tồn tại; chỉ mở một luồng qua tất cả preset; giữ preset qua polling và đóng/mở popup; dọn bộ lọc khi track kết thúc. Năm bài hồi quy trạng thái trước đó vẫn được giữ.

Kết quả cuối: **64/64 kiểm thử đạt** trên Edge/Chromium; gói `tiktok-tools-v0.0.2.zip` đã kiểm tra manifest và đối chiếu các tệp runtime với mã nguồn. Quyền thu âm tab trên Chrome cá nhân và chất lượng nghe thực tế cần xác nhận khi người dùng nạp lại extension.

## Lịch sử kiểm chứng trước bản sửa

Phiên bản phát hành: **0.0.1**. Toàn bộ mã của bản thử nghiệm nội bộ 0.2.2 được giữ nguyên tính năng và đổi số thành 0.0.1 để phát hành lần đầu trên GitHub. Các số 0.1.x/0.2.x bên dưới là mốc khảo sát/phát triển nội bộ, không phải các release đã xuất bản.

| Giai đoạn | Nội dung | Trạng thái | Bằng chứng |
| --- | --- | --- | --- |
| 0 | Khảo sát khả thi | Xong | `docs/feasibility.md` mục 1–6: trang video tải được không cần đăng nhập, 5 biến thể cho clip thử, tải MP4 đủ byte và có tiếng, canvas không bị taint |
| 1 | Nền tảng + popup | Xong | `tests/popup.spec.js` (bố cục, theme, điều khiển, migrate settings), `shared/`, `player/` |
| 2 | Công cụ xem video | Xong về mã | `tests/mirror.spec.js` (10 bài), `tests/playback.spec.js` (5 bài: tốc độ, Clean Mode) |
| 3 | Chụp ảnh | Xong | `tests/capture.spec.js`: PNG đúng 320×240, kiểm tra pixel sau khi giải mã, đúng chiều lật, lỗi thiếu khung hình |
| 4 | Tải video | Xong | `tests/downloads.spec.js` (10 bài: ánh xạ bốn trường API, `wm_size = 0`, `hdplay` trùng `play`, dự phòng dữ liệu trang, lỗi lúc bấm tải, lỗi URL, mặc định HD, chống trùng, UI). Đo thật trên `@trambongda07/7696288287266196743`: HD 7 847 621 B **1080×1440 hvc1**, chuẩn 12 323 513 B **576×768 avc1**, logo 12 878 271 B, MP3 832 201 B |
| 5 | Equalizer + MP3 | EQ: xong mã (thử nghiệm) · MP3: xong | `tests/equalizer.spec.js` (4 bài). Âm thanh EQ phải nghe thử bằng tay; MP3 là tệp `music` của TikTok, không phải bản trích video |
| 6 | Kiểm thử, tài liệu, đóng gói | Gần xong | 61 bài xanh, README, CHANGELOG, `docs/feasibility.md`, icon mới (nguồn ghi ở `docs/assets.md`), `tiktok-tools-v0.2.0.zip` |

## Bộ test 0.1.1 và bộ test hiện tại

Bộ 12 bài của 0.1.1 kiểm tra giao thức `ttt:*` — giao thức mà PLAN thay bằng phong bì `{ ok, data }`. Vì vậy bộ cũ không còn chạy được trên mã mới và đã được thay bằng 61 bài chia theo tính năng, phủ đủ 12 hành vi cũ và thêm các phần mới:

| Hành vi của bộ 0.1.1 | Nơi kiểm tra hiện tại |
| --- | --- |
| Nút nổi lật/khôi phục video | `tests/mirror.spec.js` |
| Phím tắt qua background | `tests/mirror.spec.js` (gửi `MIRROR_TOGGLE` qua runtime) |
| Popup lật video | `tests/popup.spec.js` |
| Lưu tùy chọn, đồng bộ giữa các tab | `tests/mirror.spec.js`, `tests/popup.spec.js` |
| Migrate settings cũ | `tests/popup.spec.js` |
| Chọn video theo khung nhìn | `tests/mirror.spec.js` |
| Video canvas / `tt-vod-sr-wrap` | `tests/mirror.spec.js` |
| Fullscreen | `tests/mirror.spec.js` |
| Nội dung mới được thêm | `tests/mirror.spec.js`, `tests/playback.spec.js` |
| Ẩn/hiện nút nổi | `tests/popup.spec.js` |
| Kết nối tab TikTok | `tests/popup.spec.js` |
| Chặn khi không có tab TikTok | `tests/popup.spec.js` |

## CDN 403 và tuyến dự phòng tikwm.com

**CDN của TikTok trả 403 khi request không có `Referer` từ tiktok.com.**

Đo trên trang thật ngày 2026-10-22, clip `@bongdaquanhday/video/7699174948165651743`:

| Cách tải | Kết quả |
| --- | --- |
| `context.request.get(url)` không header | 403 `Access Denied` (508 byte) |
| thêm `Referer: https://www.tiktok.com/` | 200 `video/mp4`, 1 537 999 byte, có `ftyp/moov/mp4a` |
| thêm `Origin: https://www.tiktok.com` | 403 |
| `chrome.downloads.download(url)` | `interrupted` / `SERVER_FORBIDDEN` |
| `chrome.downloads.download` + `headers: [{name:"Referer"…}]` | lỗi "Unsafe request header name" |
| `fetch` từ content script (kèm `Origin`) | 403 |
| `fetch` từ trang extension (kèm `referrer` option, `referrerPolicy: unsafe-url`) | 403 |
| quy tắc `declarativeNetRequest` `set referer` + `fetch`/download | không có tác dụng (Chrome không cho sửa `Referer`) |
| điều hướng `<a target="_blank">` từ trang TikTok | CDN trả nội dung và mở tab phát, không tạo tệp tải |

Kết luận: trong giới hạn API của extension, không gắn được `Referer` cho request tới CDN. **Cách giải quyết đã chọn:** lấy link qua `tikwm.com` — dịch vụ này trả URL trên `tiktokcdn-us.com`, các host này chấp nhận request không kèm `Referer` (đo: `206 video/mp4` khi gọi kèm `Range`). Từ bản 0.2.0, `tikwm.com` là **tuyến chính** cho cả bốn định dạng: mỗi lần Phân tích gọi API một lần, các lần tải dùng lại cache 5 phút. Dữ liệu trang chỉ dùng khi dịch vụ lỗi, và lần tải trực tiếp bị 403 vẫn có dự phòng đổi tuyến.

### Ánh xạ định dạng và độ phân giải thật (2026-10-22)

Đo bằng cách tải nguyên tệp rồi đọc box `stsd` trong MP4 (không suy từ dung lượng):

| Clip | `hdplay` | `play` | `wmplay` | `music` |
| --- | --- | --- | --- | --- |
| `@trambongda07/7696288287266196743` | 7 847 621 B · **1080×1440 · hvc1** | 12 323 513 B · **576×768 · avc1** | 12 878 271 B · 576×768 · avc1 | 832 201 B · `audio/mpeg` · ID3 |
| `@bongdaquanhday/7699174948165651743` | 961 339 B · **720×960 · hvc1** | 1 537 999 B · **576×768 · avc1** | 1 537 999 B · trùng `play` (`wm_size = 0`) | 456 456 B · `audio/mpeg` · ID3 |

Hai kết luận dùng để viết mã:

1. **`hdplay` là bản nét hơn nhưng nhỏ hơn** vì dùng H.265/HEVC; `play` là H.264 576×768. Vì vậy không được chọn theo dung lượng, và phải cảnh báo máy thiếu bộ giải mã HEVC.
2. **`wmplay` không đồng nghĩa "có logo"**: khi `wm_size = 0`, dịch vụ trả lại đúng tệp `play` (cùng 1 537 999 byte). Hàng logo chỉ mở khi `wm_size > 0`.

Ngoài ra `size`, `hd_size`, `wm_size` khớp chính xác `Content-Length` thật của từng URL, nên hiển thị dung lượng từ API là số đo, không phải ước lượng.

### Kiểm chứng tải tệp thật (2026-10-22)

| Trường hợp | Kết quả đo |
| --- | --- |
| Bốn hàng trên `@trambongda07/7696288287266196743` | cả bốn `complete` qua tikwm.com, byte khớp bảng trên |
| HD tải trực tiếp (clip khác) | `interrupted` / `SERVER_FORBIDDEN` → tự đổi tuyến, `complete` 961 339 byte |
| Gọi tikwm vượt 1 request/giây | `Free Api Limit: 1 request/second` → extension xếp hàng và thử lại |

Lưu ý: `filename` gửi cho `chrome.downloads` đúng như test khẳng định, nhưng trình duyệt trong Playwright đặt tên `download.<ext>`, nên tên tệp thực tế cần xem lại khi dùng thật.

### Còn lại

1. **Equalizer**: mã đã xong (`tabCapture` + offscreen + 5 dải + 4 preset + preamp). Còn lại là **kiểm chứng bằng tai**: bấm icon để cấp `activeTab`, chọn Bass/Vocal/Treble, nghe xem có rè, có mất tiếng, có tiếng đôi khi bật/tắt.
2. **Tên tệp và thư mục con**: cần xem lại trên trình duyệt thật vì môi trường Playwright đổi tên tệp.
3. **MP3 không phải bản trích từ video**: tệp là `music` do TikTok cung cấp; nếu cần đúng âm thanh đang nghe (thoại + nhạc), phải thêm bước chuyển mã cục bộ.
4. **Phát tệp HD**: cần máy có bộ giải mã HEVC; nếu người dùng gặp tệp HD không mở được thì đó là giới hạn máy, không phải lỗi tải — hàng chuẩn H.264 là phương án thay thế.
5. **Kiểm chứng trên TikTok thật**: danh sách trong README, mục "Kiểm tra tay trên TikTok thật" (đặc biệt: chụp vùng hiển thị cần `activeTab`, tải bằng link `vm.tiktok.com`).

## Quyết định chốt bản 0.2.0

Chủ dự án chọn dùng **tikwm.com** làm nguồn link cho cả bốn định dạng (thay cho native host):

- Tải tệp: `hdplay` / `play` / `wmplay` / `music` lấy từ một lần gọi API, tải qua `chrome.downloads`; dự phòng dữ liệu trang khi dịch vụ lỗi.
- MP3: chạy được, kèm ghi chú về bản chất tệp âm thanh.
- Equalizer: có mã, ghi rõ là thử nghiệm cho tới khi nghe thử bằng tay.
- Native host: không làm; phương án vẫn ghi ở `docs/native-download.md` nếu sau này cần bản tải không phụ thuộc dịch vụ ngoài.

## Quy tắc đã giữ

- Không có UI giả: hàng tải đi qua dịch vụ ngoài đều hiện "qua tikwm.com"; hàng không có nguồn thật thì bị khoá kèm lý do; Equalizer ghi rõ là thử nghiệm.
- Mặc định tải luôn là bản không logo (HD trước, chuẩn sau); bản có logo chỉ tải khi người dùng chọn và chỉ khi `wm_size > 0`.
- Không chọn bản theo dung lượng: HD dùng HEVC nên nhỏ hơn bản chuẩn H.264 — cảnh báo nằm trong ghi chú của hàng.
- `watermark: false` chỉ dùng cho `PlayAddr`/`play`/`hdplay`; không suy diễn từ `unknown`.
- Không hiển thị dung lượng không xác định; không đổi đuôi tệp để giả định dạng.
- Dịch vụ ngoài chỉ nhận URL video, không nhận cookie hay thông tin tài khoản.

## Sửa lỗi phân tích — 0.2.1

Người dùng báo URL `https://www.tiktok.com/@967.432.813.hieutpbank/video/7697075597226315026` không phân tích được và lỗi chỉ nháy lên. Gọi TikWM thật bằng POST form `url` + `hd=1` cho URL này trả HTTP 200, `code: 0` và có `play`, `hdplay`, `music`. Vì vậy không có bằng chứng để kết luận clip riêng tư hoặc đã bị xóa.

Lỗi đã xác định trong mã: `popup.poll()` xóa mọi lỗi sau mỗi lần đọc trạng thái player thành công (chu kỳ 900 ms). Đã bỏ hành vi đó, thêm trạng thái đang phân tích, bỏ phản hồi không còn khớp URL và ngăn gửi trùng. Bộ validation cũ cũng từ chối `/video/ID` mà chính player có thể tự điền; đã bổ sung các dạng URL hợp lệ và kiểm thử host giả.

Provider TikWM tiếp tục chạy trong background. Thêm xử lý HTTP 429 trước khi đọc JSON, URL media tương đối, `code` dạng chuỗi, lỗi mạng/timeout và kiểm tra ID trước khi cache. Không gửi Origin/Referer/sec-* giả theo cURL, không gửi cookie. Nguồn không có bản không logo sẽ không tự chuyển mặc định sang bản có logo.

Kiểm thử mới ở `tests/resolver.spec.js` kiểm tra parser, giao tiếp provider, gộp request và hai hồi quy popup: lỗi phải còn hiển thị sau nhiều chu kỳ polling; thay URL phải bỏ kết quả cũ. Lệnh live độc lập: `npm run check:resolve -- <url>` mở popup ở profile kiểm thử sạch và phân tích API mà không dựa vào metadata trang TikTok.

Kết quả kiểm chứng 0.2.1 ngày 22/10/2026:

- Toàn bộ **56 bài Playwright đạt** trên Edge/Chromium, bao gồm 9 bài mới về resolver và popup.
- Chạy `check:resolve` với đúng URL người dùng báo lỗi: popup v0.2.1 hiện đúng video ID `7697075597226315026`, tác giả `967.432.813.hieutpbank`, thời lượng 26 giây, **4 lựa chọn khả dụng** từ TikWM; HD không logo được chọn mặc định. Thử trong profile sạch, không cần metadata trang TikTok. Ảnh ghi nhận tại `test-results/resolve-live.png`.
- Bộ live trước đó đã tải đủ HD, chuẩn, logo và MP3 của clip mẫu `7696288287266196743`, kiểm tra container/codec và byte thực. Với clip người dùng báo lỗi mới, lần kiểm chứng này tập trung vào thao tác Phân tích, không khẳng định đã tải file của clip đó.
- Đã cập nhật thư mục nguồn `extension/`, bản giải nén `tiktok-tools-v0.2.0/` trong workspace và ZIP mới `tiktok-tools-v0.2.1.zip`. Người dùng vẫn cần Reload extension trong Chrome và kiểm tra phiên bản hiện trong popup; chưa có kết nối để tự thao tác extension đang cài trong profile Chrome của người dùng.

## Sửa lỗi Equalizer báo nhầm "không hỗ trợ"

Người dùng báo: chọn preset Equalizer luôn thấy "Trình duyệt không hỗ trợ" và ô điều khiển bị khoá lại.

**Nguyên nhân.** `popup.js` xử lý thất bại của `EQ_STATUS` bằng `renderEq({ supported: false, ... })`. Nghĩa là *một lần không phản hồi* bị quy về *trình duyệt không hỗ trợ*, và `supported = false` được ghi vào `eqState` rồi tự ghi đè ở mỗi vòng poll 900 ms. Ô dropdown chỉ được mở khoá bên trong `renderEq`, nên nó bị khoá và không tự mở lại. Phía background, `eqSupported()` gộp `tabCapture` và `offscreen` thành một cờ chung nên không biết API nào thực sự thiếu.

**Đã sửa.**

1. `background.js`: `eqCapabilities()` tách `offscreen` (bắt buộc) và `tabCapture` (tách theo service worker / popup); `EQ_STATUS` trả kèm `missing`, `browser` và không bao giờ ném lỗi.
2. `background.js`: phân biệt `UNSUPPORTED` (thiếu API) với `BLOCKED` (chưa được cấp `activeTab`). Thử nghiệm lấy stream ID từ popup đã được thay bằng lấy từ service worker ở bản sửa 0.0.2 bên dưới.
3. `popup.js`: lỗi trao đổi thông điệp chỉ đánh dấu `stale`, giữ nguyên kết luận đã biết và **không** khoá dropdown; hiển thị "Không phản hồi · đang thử lại".
4. `popup.js`: gửi yêu cầu bật tới background; bản sửa 0.0.2 để service worker lấy stream ID theo phạm vi offscreen của Chrome 116+.

**Kiểm chứng.** Thêm 3 bài ở `tests/equalizer.spec.js`: báo từng khả năng, dropdown mở khoá khi trình duyệt hỗ trợ, và lỗi `EQ_STATUS` không được báo nhầm "không hỗ trợ" cũng không khoá dropdown. Bài thứ ba được xác nhận **fail** khi tạm thời revert đúng thay đổi ở `refreshEq()`, và pass khi khôi phục. Toàn bộ **61 bài** xanh trên Edge.

**Còn lại:** vẫn cần nghe thử bằng tai trên máy thật (EQ là mức thử nghiệm), và nếu người dùng vẫn thấy "Trình duyệt không hỗ trợ" thì tooltip của ô Equalizer sẽ cho biết đúng API đang thiếu cùng phiên bản trình duyệt.

## Sửa lỗi Equalizer kẹt ở "Không phản hồi · đang thử lại"

Người dùng báo sau khi cập nhật: ô Equalizer đứng nguyên ở "Không phản hồi · đang thử lại" dù trình duyệt có đủ API.

**Nguyên nhân (hai lỗi chồng lên nhau).**

1. Trong vòng poll 900 ms, `poll()` gọi `renderStatus(await request(PLAYER_STATUS))` rồi `await refreshEq()` **trong cùng một khối `try`**. Trạng thái video lỗi (ví dụ tab vừa điều hướng, content script chưa sẵn sàng, hoặc service worker trả mã lỗi khác `NO_RECEIVER/NO_TAB/NO_RESPONSE`) làm `refreshEq()` bị bỏ qua ở mọi vòng, nên nhãn "không phản hồi" đã hiện thì không bao giờ được cập nhật lại.
2. `eqStatus()` gọi `await readSettings()` **trước** khi tạo phản hồi và không có `try/catch`. Chỉ cần bước đọc tùy chọn ném lỗi (storage chậm, dữ liệu lạ) là toàn bộ `EQ_STATUS` hỏng theo — popup thấy lỗi và chuyển sang "Không phản hồi · đang thử lại" vĩnh viễn, trong khi các phần khác của popup vẫn dùng được.
3. Thêm nữa: vùng `offscreen` "mồ côi" (còn sống sau khi extension được tải lại nhưng không trả lời thông điệp) bị coi là `attached: false` mà không được dọn, nên lần bật sau vẫn gặp đúng vùng chết đó.

**Đã sửa.**

- `popup.js`: tách `refreshEq()` ra khỏi khối `try` của `PLAYER_STATUS`, chỉ gọi khi đã có trạng thái video; thử lại sớm một lần (600 ms) khi lỗi; tooltip ghi rõ thông báo lỗi thật.
- `background.js`: `eqStatus()` bọc `readSettings()` và `hasOffscreen()` trong `try/catch`, luôn trả `msg.ok` kèm `readError`/`offscreenError`; nếu vùng offscreen không trả lời thì `closeOffscreen()` ngay để lần sau dựng vùng mới.

**Kiểm chứng.** Thêm 2 bài: "vùng offscreen mồ côi bị đóng" (stub `chrome.offscreen.hasDocument` = true, kiểm tra `closeDocument` được gọi và trạng thái vẫn trả về được) và "trạng thái video lỗi không chặn cập nhật ô Equalizer" (chặn `EQ_STATUS` trước để nhãn chuyển sang không phản hồi, rồi chỉ chặn `PLAYER_STATUS` và kiểm tra nhãn tự cập nhật lại). Bài thứ hai **fail** trên mã cũ vì `refreshEq()` bị bỏ qua. Toàn bộ **61 bài** xanh.
