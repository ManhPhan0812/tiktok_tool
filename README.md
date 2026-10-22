# TikTok Tools

Extension cho Chrome/Edge trên máy tính: lật ngang video, điều khiển phát, ẩn lớp thông tin, phát nền, chụp khung hình và tải video TikTok đang xem hoặc từ link được dán.

## Bản phát hành 0.0.1

[Tải tiktok-tools-v0.0.1.zip](https://github.com/ManhPhan0812/tiktok_tool/releases/download/v0.0.1/tiktok-tools-v0.0.1.zip) · [Release và ghi chú](https://github.com/ManhPhan0812/tiktok_tool/releases/tag/v0.0.1)

Đây là release đầu tiên, bao gồm toàn bộ chức năng của bản thử nghiệm nội bộ 0.2.2. Số phiên bản trong manifest, popup và package được thống nhất thành **0.0.1**; không hạ cấp chức năng và không xóa tùy chọn đã lưu. Các mốc 0.1.x/0.2.x trong PLAN và tài liệu khảo sát là lịch sử phát triển nội bộ.

Logo [TikTok Aesthetic Brown](https://www.iconpacks.net/free-icon/tiktok-aesthetic-brown-23190.html) được đóng gói cục bộ và dùng thống nhất cho thanh công cụ, popup và nút nổi. Bộ kiểm thử gồm **56 bài**; EQ vẫn ghi rõ là thử nghiệm.

## Trạng thái tính năng

| Tính năng | Trạng thái | Ghi chú |
| --- | --- | --- |
| Lật ngang video + phím tắt | Dùng được | Hỗ trợ cả trình phát canvas `tt-vod-sr-wrap` |
| Tốc độ phát 0,5×–4× | Dùng được | Ưu tiên không đổi cao độ; tôn trọng thay đổi từ thanh tốc độ của TikTok |
| Clean Video Mode | Dùng được | Ẩn caption/thanh tiến trình bằng CSS, không xoá DOM |
| Background Play | Dùng được | Chỉ phát tiếp khi tab bị ẩn/mất focus làm video dừng, không tự tắt tiếng |
| Chụp khung hình | Dùng được | PNG đúng chiều đang xem, kiểm tra ảnh rỗng |
| Chụp vùng đang hiển thị | Dùng được khi bấm icon | Cần quyền `activeTab`; ảnh có thể chứa overlay |
| Tải video HD (`hdplay`) | Dùng được | HD thật, thường là H.265/HEVC; nhỏ hơn nhưng nét hơn bản chuẩn |
| Tải video chuẩn (`play`) | Dùng được | H.264, mở được trên mọi máy |
| Tải bản có logo (`wmplay`) | Dùng được khi video có bản logo | Chỉ mở khi TikTok thật sự có bản `wm_size > 0`; không gắn nhãn "có logo" cho tệp không logo |
| Audio MP3 (`music`) | Dùng được | Là tệp `audio/mpeg` TikTok cung cấp, không phải chuyển mã từ video (xem Giới hạn) |
| Equalizer 5 dải | Đã có mã (thử nghiệm) | Cần bấm icon để cấp `activeTab`; chất lượng âm thanh chưa kiểm chứng bằng tai |
| Giao diện sáng/tối | Dùng được | Lưu trên máy |


Sau khi cập nhật, Reload extension và tải lại TikTok. Popup cần hiển thị **v0.0.1**.

## Cài đặt

1. Tải ZIP từ mục Releases và giải nén, hoặc clone dự án này về máy.
2. Mở `chrome://extensions` hoặc `edge://extensions`.
3. Bật **Developer mode / Chế độ dành cho nhà phát triển**.
4. Chọn **Load unpacked / Tải tiện ích đã giải nén**. Với ZIP release, chọn thư mục vừa giải nén chứa trực tiếp `manifest.json`; với mã nguồn Git, chọn thư mục **extension**.
5. Mở TikTok, tải lại trang nếu đã mở từ trước.
6. Ghim **TikTok Tools** lên thanh công cụ.

Bản đóng gói sẵn để chia sẻ: chạy `npm run package` (cần PowerShell) hoặc nén thủ công nội dung thư mục `extension/` thành ZIP.

## Sử dụng

### Lật video

- Nhấn nút nổi ở góc dưới bên phải TikTok, hoặc **Alt + Shift + H**, hoặc mở popup và chọn **Lật video đang xem**.
- Extension chọn video lớn nhất đang hiển thị, ưu tiên video đang phát; cuộn sang video khác thì nút điều khiển đi theo.
- **Tự lật mọi video**: áp dụng cho video chưa được đổi chiều thủ công, kể cả video mới xuất hiện. Mặc định tắt.

### Phát và hiển thị

- **Tốc độ**: thanh trượt 0,5×–4× và sáu nút nhanh. Giá trị được lưu; nếu bạn đổi tốc độ bằng thanh của TikTok, extension ghi nhận giá trị mới thay vì ghi đè.
- **Ẩn thông tin trên video**: ẩn caption, tác giả và thanh tiến trình; nút thao tác và video vẫn còn.
- **Phát nền**: khi bạn chuyển tab và TikTok tự dừng video, extension phát tiếp. Nếu chính bạn bấm dừng khi đang xem thì không bị phát lại. Extension không tự tắt tiếng để lách chính sách của trình duyệt.
- **Equalizer**: chọn **Tắt / Normal / Bass Boost / Vocal / Treble Boost** để lọc 5 dải. Lần đầu bật, extension lấy âm thanh của tab qua `tabCapture`, lọc rồi phát lại; chọn **Tắt** để trả âm thanh về bình thường. Đây là phần thử nghiệm, hãy nghe thử trước khi dùng thường xuyên.

### Chụp khung hình

- **Chụp khung hình**: lưu PNG đúng khung hình hiện tại, đúng chiều đang xem (kể cả khi đã lật), tên dạng `tiktok_<videoId>_<thời điểm>_khung-hinh.png`.
- Nếu không đọc được khung hình (nguồn bảo vệ/DRM), popup báo lỗi và hiện nút **Chụp vùng đang hiển thị**. Ảnh này là ảnh chụp màn hình đã cắt theo vùng video nên có thể chứa overlay và không phải khung hình gốc.

### Tải video

1. Mở popup. Ô URL tự điền link video đang xem nếu xác định được video ID; nếu bạn đã tự nhập thì không bị ghi đè.
2. Dán URL hoặc bấm **Dùng video đang xem**, rồi bấm **Phân tích** (hoặc Enter).
3. Bốn hàng kết quả hiện ra. Hàng nào không có nguồn thật sẽ bị khoá kèm lý do; dòng đầu ghi số lựa chọn khả dụng thật và nguồn link (tikwm.com hoặc dữ liệu trang).
4. Bấm hàng bạn muốn. Hàng được đánh dấu viền hồng là bản mặc định (HD). Cả bốn hàng đều ghi **qua tikwm.com**.

Quy tắc chọn bản:

- Thứ tự mặc định: **HD (`hdplay`) → chuẩn (`play`) → hàng logo → hàng MP3**; nếu không có HD thì mặc định là bản chuẩn.
- Mặc định luôn là bản **không logo**: `hdplay` và `play` đều không có watermark.
- Extension **không bao giờ tự chuyển sang bản có logo**. Bản có logo chỉ tải khi bạn bấm đúng hàng đó, và chỉ khả dụng khi TikTok thật sự có bản có logo (`wm_size > 0`).
- Dung lượng lấy từ API (`hd_size`, `size`, `wm_size`) nên hiện ngay khi phân tích.
- Không crop, blur hay che logo để giả thành bản không logo; không chèn watermark mới.

Ánh xạ bốn định dạng, đo trên clip thật ngày 2026-10-22:

| Hàng | Trường API | Đo được | Ghi chú |
| --- | --- | --- | --- |
| Video HD | `hdplay` | 1080×1440, **H.265/HEVC**, 7 847 621 B | Nét nhất nhưng tệp nhỏ hơn vì HEVC nén tốt hơn |
| Video chuẩn | `play` | 576×768, **H.264**, 12 323 513 B | Mở được trên mọi máy, kể cả máy không có bộ giải mã HEVC |
| Video có logo | `wmplay` | 576×768, H.264, 12 878 271 B | Chỉ có khi video có bản logo; `wm_size = 0` thì hàng bị khoá |
| Audio MP3 | `music` | `audio/mpeg`, 832 201 B, có `ID3` | Là tệp âm thanh TikTok cấp cho video |

Đừng chọn theo dung lượng: bản HD nhỏ hơn bản chuẩn vì dùng HEVC. Nếu tệp HD không mở được (máy thiếu codec HEVC), chọn hàng **Video chuẩn**.

## Giới hạn đã biết

- **Phân tích cần mạng tới tikwm.com.** Mỗi lần bấm **Phân tích**, URL video được gửi tới `tikwm.com` (không gửi cookie/tài khoản) để lấy bốn link. API miễn phí giới hạn **1 request/giây**; extension tự xếp hàng, thử lại 3 lần và cache 5 phút nên bấm tải ngay sau khi phân tích không tốn thêm request. Nếu dịch vụ lỗi hoặc bạn offline, extension quay về dữ liệu trang: vẫn tải được bản `PlayAddr` trực tiếp, còn logo/MP3 bị khoá kèm lý do.
- **Bản HD thường là H.265/HEVC.** Chrome/Edge trên Windows chỉ phát HEVC khi máy có bộ giải mã HEVC; nếu tệp HD mở ra không có hình, chọn hàng **Video chuẩn** (H.264) thay vì kết luận tải hỏng.
- **Audio MP3 là tệp âm thanh TikTok cung cấp, không phải bản trích từ video.** Với clip có nhạc nền, tệp này thường đúng là bản nhạc; với clip có lời thoại chồng lên nhạc, nó có thể chỉ chứa nhạc. Extension không chuyển mã nên không tạo ra âm thanh "đúng 100% như đang nghe".
- **Hàng "có logo" không phải lúc nào cũng có.** TikTok không tạo bản có logo cho mọi video; extension dựa vào `wm_size > 0` và khoá hàng khi không có, thay vì đưa tệp không logo mà gắn nhãn có logo.
- **Tên tệp khi tải chưa kiểm chứng được trong môi trường test.** Tham số `filename` (`TikTok/<user>_<id>_<loại>.<ext>`) được gửi đúng — có test kiểm tra — nhưng trình duyệt trong bộ test (Playwright) đặt tên khác (`download.<ext>`), nên tên tệp thực tế cần xem lại khi dùng thật.
- **Equalizer mới ở mức thử nghiệm.** Mã đã xong (tabCapture + offscreen + 5 dải 60/250/1k/4k/12k Hz, 4 preset, preamp chống vỡ tiếng) nhưng chất lượng âm thanh chưa được kiểm chứng bằng tai. Cần mở popup bằng cách bấm icon để có quyền `activeTab`; nếu không, popup báo lỗi và giữ nguyên trạng thái tắt.
- **Tên tệp khi tải chưa kiểm chứng được trong môi trường test.** Tham số `filename` (`TikTok/<user>_<id>_<loại>.<ext>`) được gửi đúng — có test kiểm tra — nhưng trình duyệt trong bộ test (Playwright) đặt tên khác (`download.<ext>`), nên tên tệp thực tế cần xem lại khi dùng thật.
- Ảnh lưu phẳng trong thư mục Downloads; video tải vào thư mục con `TikTok/` (khi tải thành công).
- Chụp vùng hiển thị cần mở popup bằng cách bấm icon (quyền `activeTab`). Mở popup bằng URL trực tiếp sẽ báo lỗi rõ ràng thay vì chụp sai.
- Phân tích gọi tikwm.com nên cần mạng; nếu dịch vụ chậm, popup chờ tới 12 giây mỗi lần thử. Dữ liệu trang chỉ được đọc khi dịch vụ lỗi, và việc đó mất thêm vài giây.
- TikTok đổi giao diện/DOM thường xuyên; selector dùng hậu tố ngữ nghĩa (`DivMediaCardOverlayBottomSection`…) nhưng vẫn có thể hỏng sau cập nhật lớn.

## Quyền và dữ liệu

- Chạy trên `https://www.tiktok.com/*`, `https://tiktok.com/*` và `https://tikwm.com/*`.
- `storage`: lưu tùy chọn và trạng thái tác vụ tải trong phiên.
- `downloads`: lưu ảnh/video và theo dõi tiến trình.
- `activeTab`: dùng cho nút "Chụp vùng đang hiển thị" và cho Equalizer (`tabCapture`).
- `tabCapture` + `offscreen`: lấy âm thanh tab TikTok để lọc Equalizer.
- **Phân tích video gửi URL tới `tikwm.com`.** Đây là dịch vụ ngoài duy nhất extension liên hệ, và là nguồn của cả bốn link tải. Không gửi cookie, không đọc phiên đăng nhập, không gửi thông tin tài khoản hay lịch sử xem. Nếu bạn không muốn gửi URL ra ngoài, đừng dùng phần tải video; các tính năng xem (lật, tốc độ, Clean Mode, phát nền, chụp khung hình, Equalizer) chạy hoàn toàn trong máy.

## Kiểm thử

Yêu cầu Node.js 22 trở lên.

```powershell
npm ci
npm test
```

Nếu chưa cài Chromium cho Playwright, dùng Edge có sẵn:

```powershell
$env:TIKTOK_TOOLS_BROWSER_PATH = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm test
```

47 bài kiểm thử, chia theo tính năng:

- `tests/mirror.spec.js` — lật/khôi phục, transform của TikTok, cuộn feed, video tái sử dụng, chế độ tự lật, fullscreen, trình phát canvas.
- `tests/playback.spec.js` — tốc độ, Clean Mode, Background Play (chuyển tab thật với focus emulation tắt).
- `tests/capture.spec.js` — PNG đúng kích thước, đúng chiều lật (kiểm tra pixel sau khi giải mã), lỗi thiếu khung hình, giới hạn quyền chụp vùng.
- `tests/downloads.spec.js` — ánh xạ bốn định dạng từ API, hàng logo bị khoá khi `wm_size = 0`, HD trùng tệp, quay về dữ liệu trang khi dịch vụ lỗi, lỗi lúc bấm tải, chống tải trùng, UI bốn hàng.
- `tests/equalizer.spec.js` — khả năng hỗ trợ, lỗi thiếu `activeTab`, lưu preset, tắt và dọn vùng âm thanh.
- `tests/popup.spec.js` — bố cục 360 px, theme, điều khiển tab, migrate settings, trạng thái Equalizer.
- `tests/icons.spec.js` — giải mã PNG của bốn icon để kiểm tra kích thước, nền trong suốt, có hình thật, và manifest trỏ đúng tệp.

Bộ test không gọi mạng: `tikwm.com` và `chrome.downloads` đều được thay bằng stub trong `tests/fixtures/harness.js`.

### Kiểm tra tay trên TikTok thật (bắt buộc trước khi phát hành)

Bộ test dùng trang giả lập nên **không** thay thế được các bước sau:

- [ ] Lật video thường và video dùng trình phát canvas; kiểm tra chữ trong video có bị lật (đúng như mong đợi).
- [ ] Đổi tốc độ rồi cuộn sang video mới: video mới giữ đúng tốc độ.
- [ ] Bật Clean Mode, rồi tắt: caption và thanh tiến trình trở lại.
- [ ] Bật Phát nền, chuyển tab ~10 giây rồi quay lại: video vẫn phát, không có tiếng đôi.
- [ ] Chọn **Bass Boost** khi đang phát: tiếng trầm tăng rõ, không rè; chọn **Tắt**: âm thanh trở lại bình thường, không mất tiếng.
- [ ] Chụp khung hình khi đã lật: mở tệp, kiểm tra chiều và nội dung; thử cả nút chụp vùng hiển thị.
- [ ] Dán một link `vm.tiktok.com`, phân tích, tải bản mặc định; mở tệp bằng trình phát để chắc chắn có hình **và tiếng**.
- [ ] Tải hàng **Video HD** bằng trình phát của máy: nếu chỉ có tiếng hoặc báo thiếu codec HEVC thì đó là giới hạn máy, thử lại hàng **Video chuẩn** (H.264) để chắc chắn.
- [ ] Tải hàng **Audio MP3**: mở tệp, kiểm tra đúng là âm thanh và nghe xem có đúng tiếng của clip không (có thể chỉ là nhạc nền).
- [ ] Tải hàng **Video có logo**: mở tệp, xác nhận có logo TikTok thật ở vị trí quen thuộc.
- [ ] Mở thư mục Downloads: xác nhận tệp nằm trong `TikTok/` và tên đúng dạng `TikTok/<user>_<id>_<loại>.<ext>`.
- [ ] Bấm tải ngay sau khi tải xong một tệp khác (trong vòng 1 giây) để chắc extension tự xếp hàng chờ thay vì báo lỗi giới hạn của tikwm.com.

## Cấu trúc

```text
extension/
  manifest.json            Manifest V3, quyền, phím tắt, icon
  background.js            Router thông điệp, settings, chụp tab
  content.js               Điều phối trên trang, nút nổi, chụp ảnh
  content.css              CSS cho video đã lật và Clean Mode
  shared/                  settings, messages, validation
  player/                  selectors (DOM TikTok), adapter (chọn video)
  features/                mirror, playback-speed, clean-mode, background-play, capture-frame
  services/                page-state (đọc dữ liệu trang), downloads (resolver + job), proxy (tikwm.com)
  offscreen/               eq.html + eq.js: xử lý âm thanh 5 dải ngoài popup
  popup/                   popup.html/css/js
  assets/icons/            icon 16/32/48/128 (xem docs/assets.md để biết nguồn và cách tạo lại)
tests/                     Playwright specs + fixtures/harness.js
tools/                     make_icons.py, package.ps1, live-check.cjs
docs/feasibility.md        Kết quả khảo sát và các quyết định kỹ thuật
docs/assets.md             Nguồn, giấy phép và cách tạo lại icon
```

Không cần bước build. Sửa tệp → **Reload** extension → tải lại tab TikTok.

## Phát triển

- Thêm tính năng: tạo module trong `features/`, khai báo trong `manifest.json` (`content_scripts.js`) và nối vào `content.js`.
- Thông điệp luôn theo phong bì `{ ok, data }` / `{ ok: false, error: { code, message } }` trong `shared/messages.js`.
- Settings đi theo luồng popup → background (ghi storage) → `storage.onChanged` → content; popup không gọi trực tiếp content.
- `docs/feasibility.md` ghi lại các phát hiện đã đo (tên tệp `data:` URL, quyền `activeTab`, tín hiệu phát nền, resolver).

Thiết kế dựa trên [content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), [Manifest V3](https://developer.chrome.com/docs/extensions/reference/manifest) và [Downloads API](https://developer.chrome.com/docs/extensions/reference/api/downloads).

## Ghi công

- Icon: [TikTok Aesthetic Brown](https://www.iconpacks.net/free-icon/tiktok-aesthetic-brown-23190.html) từ iconpacks.net — miễn phí cho dùng cá nhân và thương mại. Chi tiết và cách tạo lại: [docs/assets.md](docs/assets.md).
