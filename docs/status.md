# Trạng thái theo PLAN.md

Phiên bản phát hành: **0.0.1**. Toàn bộ mã của bản thử nghiệm nội bộ 0.2.2 được giữ nguyên tính năng và đổi số thành 0.0.1 để phát hành lần đầu trên GitHub. Các số 0.1.x/0.2.x bên dưới là mốc khảo sát/phát triển nội bộ, không phải các release đã xuất bản.

| Giai đoạn | Nội dung | Trạng thái | Bằng chứng |
| --- | --- | --- | --- |
| 0 | Khảo sát khả thi | Xong | `docs/feasibility.md` mục 1–6: trang video tải được không cần đăng nhập, 5 biến thể cho clip thử, tải MP4 đủ byte và có tiếng, canvas không bị taint |
| 1 | Nền tảng + popup | Xong | `tests/popup.spec.js` (bố cục, theme, điều khiển, migrate settings), `shared/`, `player/` |
| 2 | Công cụ xem video | Xong về mã | `tests/mirror.spec.js` (10 bài), `tests/playback.spec.js` (5 bài: tốc độ, Clean Mode) |
| 3 | Chụp ảnh | Xong | `tests/capture.spec.js`: PNG đúng 320×240, kiểm tra pixel sau khi giải mã, đúng chiều lật, lỗi thiếu khung hình |
| 4 | Tải video | Xong | `tests/downloads.spec.js` (10 bài: ánh xạ bốn trường API, `wm_size = 0`, `hdplay` trùng `play`, dự phòng dữ liệu trang, lỗi lúc bấm tải, lỗi URL, mặc định HD, chống trùng, UI). Đo thật trên `@trambongda07/7696288287266196743`: HD 7 847 621 B **1080×1440 hvc1**, chuẩn 12 323 513 B **576×768 avc1**, logo 12 878 271 B, MP3 832 201 B |
| 5 | Equalizer + MP3 | EQ: xong mã (thử nghiệm) · MP3: xong | `tests/equalizer.spec.js` (4 bài). Âm thanh EQ phải nghe thử bằng tay; MP3 là tệp `music` của TikTok, không phải bản trích video |
| 6 | Kiểm thử, tài liệu, đóng gói | Gần xong | 47 bài xanh, README, CHANGELOG, `docs/feasibility.md`, icon mới (nguồn ghi ở `docs/assets.md`), `tiktok-tools-v0.2.0.zip` |

## Bộ test 0.1.1 và bộ test hiện tại

Bộ 12 bài của 0.1.1 kiểm tra giao thức `ttt:*` — giao thức mà PLAN thay bằng phong bì `{ ok, data }`. Vì vậy bộ cũ không còn chạy được trên mã mới và đã được thay bằng 47 bài chia theo tính năng, phủ đủ 12 hành vi cũ và thêm các phần mới:

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
