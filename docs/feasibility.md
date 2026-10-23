# Khảo sát khả thi (Giai đoạn 0)

Ngày khảo sát: 22/10/2026. Môi trường: Microsoft Edge (Playwright, profile sạch, không đăng nhập) trên Windows.

Video dùng để khảo sát: `https://www.tiktok.com/@bongdaquanhday/video/7699174948165651743`.

## 1. Kết luận nhanh

| Hạng mục | Kết quả | Bằng chứng |
| --- | --- | --- |
| Trang video chi tiết tải được khi chưa đăng nhập | Đạt | HTTP 200, ~442 KB HTML |
| `video.currentSrc` là URL MP4 | **Không** | `blob:https://www.tiktok.com/<uuid>` (MediaSource) |
| Metadata nguồn có sẵn trong DOM | Đạt | `bitrateInfo[]` trong state nhúng, 5 biến thể |
| Tải file thật từ nguồn `PlayAddr` | Đạt | 1.537.999 byte, khớp chính xác `DataSize` |
| File tải là MP4 hợp lệ | Đạt | atom `ftyp`/`moov`/`mdat`/`avc1`/`mp4a`/`mvhd`, giải mã được, 28,47 s |
| Có track âm thanh | Đạt | atom `mp4a` hiện diện, giải mã bằng trình duyệt thành công |
| Biến thể có logo (`downloadAddr`) | Không có trên web | `downloadAddr: null` ở cả desktop và mobile web |
| Capture frame từ video MSE | Đạt, **không bị taint** | `toDataURL` trả PNG 720×960, luma trung bình 53, 64% pixel khác nền đen |
| Renderer canvas `tt-vod-sr-wrap` | Có | Tồn tại song song `<video>` (opacity 0) trong trang chi tiết |

## 2. Cấu trúc player quan sát được

Chuỗi bao ngoài của `<video>` trên trang chi tiết:

```text
video[style=position:absolute]
└ div (rỗng)
  └ div.xgplayer-container.tiktok-web-player
    └ div[class*=DivBasicPlayerWrapper]
      └ div[class*=DivContainer]
        └ div[class*=BasePlayerContainer][class*=DivVideoPlayerContainer]
          └ section[data-e2e="feed-video"]          ← thẻ media card
            └ div[class*=DivContentFlexLayout]
              └ article[data-e2e="recommend-list-item-container"]
```

Trong `section[data-e2e="feed-video"]`:

| Phần tử | Vai trò | Ghi chú |
| --- | --- | --- |
| `video` | phần tử phát media | `src` là blob MSE; `videoWidth/Height` = 0 ở lần đọc đầu |
| `tt-vod-sr-wrap` → `canvas` | lớp hiển thị tăng cường | cùng kích thước với video, không chứa controls |
| `div[class*=DivMediaCardOverlayBottomSection]` | caption + tác giả + thời gian | lớp DOM đè lên video |
| `div[class*=DivOverlayBottomContent]` | nội dung lớp đè dưới | z-index 1 |
| `div[class*=DivVideoProgressContainer]` | thanh tiến trình + thời gian | absolute, đáy player |
| `p[class*=TUXText]` trong progress | nhãn `00:02 / 00:28` | chữ đè lên video |

Tên class có dạng `css-<hash>-<hash>--<TenNgữNghĩa>`. Phần `<TenNgữNghĩa>` (ví dụ `DivMediaCardOverlayBottomSection`) ổn định hơn phần hash, nên selector dùng `[class*="DivMediaCardOverlayBottomSection"]` thay vì phụ thuộc hash.

`data-e2e` chỉ xuất hiện ở số ít phần tử (`feed-video`, `recommend-list-item-container`, `capcut-tag`, `side-nav-skeleton`…), không đủ để làm toàn bộ selector.

## 3. Nguồn media

State nhúng trong `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">` chứa `bitrateInfo` với 5 biến thể cho clip 28 giây:

| Gear | Codec | Bitrate | Kích thước | Dung lượng |
| --- | --- | --- | --- | --- |
| `normal_540_0` | h264 | 432.204 | 576×768 | 1.537.999 B |
| `lower_540_0` | h264 | 273.845 | 576×768 | 974.479 B |
| `adapt_lower_720_1` | h265 | 270.152 | 720×960 | 961.339 B |
| `lowest_540_0` | h264 | 211.666 | 576×768 | 753.214 B |
| `adapt_540_1` | h265 | 207.418 | 576×768 | 738.098 B |

Mỗi biến thể có `PlayAddr.UrlList` gồm 3 URL: hai host CDN (`v16-…`, `v19-webapp-prime.tiktok.com`) và một URL `www.tiktok.com/aweme/v1/play/?…` cùng nội dung. URL có `expire` (khoảng 10 ngày) và `signature`; không được sửa hay chuẩn hoá các tham số này.

Đã tải trực tiếp qua context trình duyệt: HTTP 200, `content-type: video/mp4`, số byte khớp tuyệt đối `DataSize`. Như vậy đây là **đúng payload CDN mà trình phát dùng**, không phải URL suy đoán.

### Về nhãn "không logo"

- State web chỉ cung cấp `PlayAddr`; `downloadAddr` (biến thể tải xuống có logo) **không tồn tại** trong dữ liệu trang web, ở cả UA desktop và iPhone.
- Mọi nhãn hiệu nhìn thấy trên web (tên tác giả, caption, nút, thanh tiến trình) là **lớp DOM**, không nằm trong khung hình.
- Vì vậy bản `PlayAddr` là bản duy nhất nguồn cung cấp cho web, và là bản dùng cho phát lại không có logo ghi trong hình.

Cách xử lý trong sản phẩm: biến thể lấy từ `PlayAddr` được đánh dấu `watermark: false` kèm trường `watermarkEvidence: "playback-rendition"`; nếu một nguồn khác cung cấp `downloadAddr` thì biến thể đó được đánh dấu `watermark: true` và không bao giờ là mặc định. Nếu chỉ có nguồn không rõ nguồn gốc (ví dụ provider ngoài), nhãn là `watermark: "unknown"` và **không** được coi là không logo.

Hàng "Video có logo" vì thế không có nguồn trên web: UI phải hiển thị là không khả dụng kèm lý do, không bịa biến thể.

## 4. Chặn và giới hạn phát hiện được

- `fetch` trần từ Node (không có header `accept`) nhận về shell 1,4 KB thay vì HTML đầy đủ. Sau vài lần gọi liên tiếp, TikTok bắt đầu trả shell cho cả request có `accept` → **không thể dùng fetch từ service worker làm resolver chính**.
- Do đó resolver phải chạy trong trình duyệt thật:
  1. Với video đang mở: đọc state ngay trong tab (nhanh, không tạo tab).
  2. Với URL được dán: mở tab nền, chờ tải, đọc state qua content script, đóng tab.
- Trang video không cần đăng nhập cho nội dung công khai, nhưng có thể yêu cầu đăng nhập/xác minh khi bị đánh giá là bot; resolver phải phân biệt "bị chặn" với "video không tồn tại".

## 5. Chụp khung hình

`drawImage(video)` → `toDataURL("image/png")` thành công trên video MSE (không `SecurityError`), kích thước theo `videoWidth/videoHeight` thật (720×960). Không cần đổi `crossOrigin` và không phải tải lại nguồn.

Với `tt-vod-sr-wrap > canvas`: cần kiểm tra thêm khả năng đọc buffer (canvas WebGL có thể không đọc được); nếu không, dùng frame từ `<video>` cùng thời điểm vì hai lớp đồng bộ.

## 6. Việc còn phải khảo sát khi triển khai

- Hành vi pause khi chuyển tab của TikTok (đo trong Giai đoạn 2, có thể kiểm chứng bằng `visibilitychange` giả lập và bằng tay).
- `tabCapture` + offscreen trên Edge/Chrome thật (headless không phản ánh âm thanh) — Giai đoạn 5.
- Bộ giải mã/encoder MP3 cục bộ: cần đo kích thước, CPU, giấy phép — Giai đoạn 5.
- Short link `vm.tiktok.com`/`vt.tiktok.com`: luồng redirect có giới hạn — Giai đoạn 4.

## 7. Kết quả triển khai giai đoạn 1–4

### 7.1. Lưu ảnh: `data:` URL bị đổi tên

- `chrome.downloads.download({ url: "data:image/png;base64,…", filename: "TikTok/x.png" })` trả về id và báo thành công, nhưng Chrome **bỏ qua `filename`**: cả `x.png` lẫn `TikTok/x.png` đều được lưu thành `download.png` (đo trên Edge, hồ sơ sạch).
- Vì vậy ảnh được lưu từ content script: data URL → `fetch` → blob → `<a download="…">`. Tên tệp được giữ đúng và sự kiện `download` xuất hiện trong Playwright.
- Hệ quả: ảnh lưu phẳng trong thư mục Downloads (`<a download>` không tạo thư mục con `TikTok/`), còn video tải qua `chrome.downloads` vẫn vào `TikTok/`.

### 7.2. `captureVisibleTab` cần `activeTab`

- Chỉ `host_permissions` cho tiktok.com là **không đủ**. Khi popup mở bằng URL thay vì bấm icon, `CAPTURE_REGION` trả `CAPTURE_FAILED`, đúng như tài liệu Chrome yêu cầu `activeTab` hoặc `<all_urls>`.
- Trong sản phẩm, popup mở bằng bấm icon nên có `activeTab`; đường chụp vùng hiển thị vì thế **phải kiểm tra tay** với popup thật, bộ kiểm thử tự động chỉ xác nhận thông báo lỗi rõ ràng.

### 7.3. Phát nền: thêm tín hiệu `hasFocus`

- Headless Chromium báo mọi tab là `visible`; `Object.defineProperty(document, "visibilityState")` chỉ tác dụng trong world của trang, content script (isolated world) không thấy giá trị đó.
- Tiêu chí "đang ở nền" vì thế dùng cả `document.visibilityState === "hidden"` và `!document.hasFocus()`. Kiểm thử tắt focus emulation của Playwright (`Emulation.setFocusEmulationEnabled(false)`) rồi chuyển tab thật.

### 7.4. Resolver tải video

- Đọc `__UNIVERSAL_DATA_FOR_REHYDRATION__` ngay trong tab: tìm item theo `id` (duyệt có giới hạn 200 000 node), lấy `video.bitrateInfo[].PlayAddr`.
- HD = phân giải lớn nhất; bản không logo tiêu chuẩn = h264 lớn nhất; `downloadAddr` (nếu có) là hàng "có logo" và không bao giờ là mặc định.
- Video ID đang mở trong tab → đọc trực tiếp. URL được dán → mở tab nền, chờ `status === "complete"`, hỏi content script, đóng tab; đo được khoảng 4 s với trang giả lập, có chặn 25 s và báo sớm `NO_SOURCE` khi trang đã tải xong mà không có dữ liệu.
- `fetch` từ service worker vẫn không dùng được làm resolver chính (xem mục 4).

### 7.5. Bộ kiểm thử

- 61 bài Playwright, chạy bằng Edge thật qua `TIKTOK_TOOLS_BROWSER_PATH`, 61/61 xanh, khoảng 1,9 phút cho toàn bộ.
- Ảnh chụp được kiểm tra ở mức pixel (giải mã PNG) và tên tệp, không chỉ kiểm tra "có tệp"; icon cũng được giải mã PNG để khẳng định có hình thật.
- Cập nhật 23/10/2026: `tests/equalizer-audio.spec.js` kiểm tra vùng offscreen và Web Audio thật với nguồn âm tổng hợp, đo gain từng preset và vòng đời luồng. Quyền lấy âm thanh tab và chất lượng nghe trên phần cứng vẫn cần thử thủ công.
- Các phần **chưa** kiểm chứng tự động: chụp vùng hiển thị, chất lượng EQ bằng tai, tên tệp thực tế do Chrome đặt, và toàn bộ hành vi trên TikTok thật (dùng `tools/live-check.cjs` để đo tay; script này giờ đọc cả box MP4 để so độ phân giải HD với bản chuẩn).

### 7.6. Nguồn tải: tikwm.com

- `POST https://tikwm.com/api/` với `url=<link TikTok>&hd=1` trả JSON: `play`, `hdplay`, `wmplay`, `music`, `size`, `hd_size`, `wm_size`, `duration`, `author`.
- Link trả về nằm trên `*.tiktokcdn-us.com`; các host này **chấp nhận request không kèm `Referer`** (`206 video/mp4` khi gọi kèm `Range`), nên `chrome.downloads` tải được — khác với host của luồng phát trực tiếp vốn trả 403.
- Giới hạn miễn phí: 1 request/giây (`Free Api Limit: 1 request/second.` nếu vượt). Extension xếp hàng cách nhau 1,2 s, thử lại tối đa 3 lần, cache 5 phút theo videoId.
- Ánh xạ đã đo (đọc box `stsd` của tệp tải về, không suy từ dung lượng):

  | Clip | `hdplay` | `play` | `wmplay` | `music` |
  | --- | --- | --- | --- | --- |
  | `@trambongda07/7696288287266196743` | 1080×1440 hvc1 · 7,85 MB | 576×768 avc1 · 12,32 MB | 576×768 avc1 · 12,88 MB | 832 201 B, ID3 |
  | `@bongdaquanhday/7699174948165651743` | 720×960 hvc1 · 0,96 MB | 576×768 avc1 · 1,54 MB | trùng `play`, `wm_size = 0` | 456 456 B, ID3 |

- `hdplay` **nét hơn nhưng nhỏ hơn** `play` vì dùng H.265/HEVC; máy thiếu bộ giải mã HEVC có thể không phát được. `play` là H.264 nên mở được mọi nơi.
- `wmplay` chỉ thật sự có logo khi `wm_size > 0`; khi `wm_size = 0` dịch vụ trả lại đúng tệp `play` (cùng số byte), nên extension khoá hàng logo thay vì gắn nhãn sai.
- `size`, `hd_size`, `wm_size` khớp chính xác `Content-Length` của tệp, nên dung lượng hiển thị là số đo thật.
- `music` là tệp `audio/mpeg` TikTok cấp cho video, **không** phải bản trích từ video; với clip có lời thoại chồng nhạc, tệp có thể chỉ có nhạc.
