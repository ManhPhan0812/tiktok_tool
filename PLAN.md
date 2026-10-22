# Kế hoạch mở rộng TikTok Tools

Ngày lập: 22/10/2026. Nền hiện tại: **v0.1.1**, Chrome/Edge, Manifest V3.

Ghi chú phát hành: đây là kế hoạch gốc trong quá trình phát triển. Bản thử nghiệm đã được mở rộng đến 0.2.2 và được đổi số thành **0.0.1** cho release GitHub đầu tiên; xem README và CHANGELOG để biết trạng thái phát hành.

Tài liệu này là kế hoạch triển khai; các chức năng mới dưới đây chưa được lập trình. Phạm vi xuất phát từ hai ảnh người dùng cung cấp và yêu cầu **tải video mặc định không có logo**.

## 1. Kết quả cần đạt

Xây dựng popup theo bố cục trong ảnh, bổ sung đủ công cụ xem và tải nội dung, đồng thời giữ chức năng lật video hiện tại. Tách từng chức năng thành module để có thể mở rộng sau này.

Các yêu cầu đã chốt:

- Giữ lật ngang từng video, tự lật mọi video, nút nổi và phím tắt hiện có.
- Thêm Background Play, Clean Video Mode, Speed, Equalizer, Capture Frame và Download Video/Audio.
- Popup có nhóm FEATURES, PLAYBACK, ACTIONS; giao diện tối, điểm nhấn hồng/đỏ, tùy chọn chuyển sáng/tối.
- Khu vực download có ô URL, nút phân tích và danh sách kết quả như ảnh 2.
- Có các lựa chọn Video HD, Video không logo, Video có logo và Audio MP3, tùy nguồn thực sự cung cấp.
- Lựa chọn tải mặc định luôn là video không logo. Không tự chuyển sang bản có logo khi thiếu nguồn không logo.
- Nhận diện cả video HTML thông thường và trình phát canvas `tt-vod-sr-wrap` đã gặp trên TikTok thực tế.

Các mặc định đề xuất để triển khai, có thể chỉnh sau mà không đổi kiến trúc:

| Mục | Mặc định |
| --- | --- |
| Tên sản phẩm | Giữ TikTok Tools; tên TikTok Pro Tools trong ảnh là tham chiếu giao diện |
| Ngôn ngữ | Tiếng Việt; có thể giữ tên tính năng tiếng Anh kèm diễn giải |
| Theme | Dark; nút mặt trời chuyển Light/Dark, lưu lựa chọn |
| Background Play | Tắt cho lần cài mới; trạng thái bật trong ảnh là minh họa |
| Clean Video Mode | Tắt |
| Speed | 1×, áp dụng tiếp khi cuộn sang video mới |
| Equalizer | Normal, chưa mở phiên xử lý âm thanh |
| Capture Frame | PNG, áp dụng chiều lật đang xem |
| Download | Ưu tiên chất lượng cao nhất trong các bản đã xác định không logo |
| Tác giả/hỗ trợ | Dùng thông tin của chủ dự án khi có; không sao chép tên tác giả trong ảnh |

## 2. Hiện trạng dự án

### 2.1. Các phần có thể kế thừa

| Thành phần | Hiện trạng | Hướng phát triển |
| --- | --- | --- |
| `extension/manifest.json` | MV3; quyền `storage`; hai hostname TikTok | Thêm quyền đúng chức năng và nâng phiên bản Chrome tối thiểu nếu dùng luồng EQ đề xuất |
| `extension/content.js` | Chọn video theo khung nhìn; theo dõi DOM; tạo nút nổi | Tách bộ nhận diện trình phát và bộ điều phối feature |
| `extension/features/mirror.js` | Lật video và wrapper canvas, giữ transform của TikTok | Giữ hành vi; chuyển phần tìm renderer dùng chung sang player adapter |
| `extension/background.js` | Nhận phím tắt lật | Điều phối download, capture, EQ và trạng thái tác vụ |
| `extension/shared.js` | Mặc định, chuẩn hóa settings, tên message | Thêm schema settings có phiên bản và hợp đồng message |
| `extension/popup/` | Popup tiếng Việt; lật; hai tùy chọn | Thiết kế lại theo hai ảnh |
| `tests/extension.spec.js` | 12 kiểm thử đã đạt ở lần sửa v0.1.1 | Giữ bộ hồi quy và tách test theo feature |

### 2.2. Bài học bắt buộc giữ

TikTok có thể đặt `<video>` thành `opacity: 0` nhưng vẫn phát hình qua canvas bên cạnh. Vì vậy, không được xác định “không có video” chỉ dựa vào độ trong suốt của thẻ video. Phải phân biệt:

- **Phần tử phát media:** cung cấp thời gian, tốc độ, trạng thái phát và nguồn media.
- **Lớp hiển thị:** video hoặc canvas wrapper mà người dùng đang nhìn thấy.
- **Giao diện TikTok:** caption, nút thích, bình luận, thanh điều khiển; không phải đối tượng lật.

Thao tác xem áp dụng cho video đang hiển thị trong tab được chọn. Download áp dụng cho URL đã nhập hoặc URL của video hiện tại, kể cả khi người dùng đổi tab sau khi bắt đầu tải.

## 3. Giao diện popup

### 3.1. Bố cục

Popup rộng khoảng **360 px**, chiều cao tối đa khoảng **580–600 px**, cuộn phần nội dung khi vượt chiều cao. Header nhỏ gọn, thẻ bo góc, đường viền tối, control có focus bàn phím rõ ràng.

```text
Header: biểu tượng / TikTok Tools / phiên bản / trạng thái kết nối

FEATURES                                      [Dark/Light]
  Lật video đang xem                         [Lật/Khôi phục]
  Tự lật mọi video                                  [switch]
  Phát nền                                         [switch]
  Ẩn thông tin trên video                          [switch]

PLAYBACK
  Tốc độ                                            1×
  [slider 0.5× ------------------------------------ 4×]
  [0.5] [1] [1.5] [2] [3] [4]
  Equalizer                            [Normal           v]

ACTIONS
  [Chụp khung hình]
  Tải video/âm thanh
  [URL TikTok................................] [Phân tích]
  [Dùng video đang xem] — [Tải mặc định: Không logo]
  Có N lựa chọn khả dụng
  [Video HD — Không logo                       dung lượng]
  [Video không logo                            dung lượng]
  [Video có logo                               dung lượng]
  [Audio MP3                                   dung lượng]
  [Tải video không logo — nút chính khi có nguồn phù hợp]
  Trạng thái tải / lỗi / thử lại

Tùy chọn phụ: hiện nút nổi
Thông tin phiên bản / tác giả / hỗ trợ nếu đã cấu hình
```

### 3.2. Trạng thái và tương tác

- Phân biệt “đã kết nối tab TikTok” với “đã tìm thấy video đang xem”. Chấm xanh chỉ thể hiện trạng thái tương ứng, không chỉ kiểm tra hostname.
- Khi không có video, khóa các thao tác cần player; vẫn cho nhập URL để phân tích download độc lập.
- Có trạng thái riêng cho kết nối, phân tích link, tải file và chuyển MP3; một tác vụ không khóa toàn bộ popup.
- Khi đang phân tích URL A rồi đổi sang B, bỏ kết quả đến muộn của A; không hiển thị nhầm file.
- Mở lại popup phải đọc được trạng thái thực; không dựng lại tác vụ hoặc reset tiến trình về đầu.
- Theme dùng CSS variables; tất cả switch, slider, dropdown và nút dùng được bằng bàn phím.
- Trạng thái lỗi và tiến trình có `aria-live`; không chỉ dùng màu sắc để thông báo.

## 4. Đặc tả chức năng

### 4.1. Lật video — giữ và tích hợp lại

**Hành vi:** giữ cách sử dụng v0.1.1. Lật riêng hình ảnh, giữ giao diện TikTok. Lựa chọn thủ công theo từng video không tự làm lật các video còn lại.

**Triển khai:** player adapter cung cấp video và renderer; mirror chỉ quản lý transform và trạng thái thủ công. Khi renderer bị thay, chuyển trạng thái sang renderer mới và dọn đánh dấu ở renderer cũ.

**Nghiệm thu:** cả video thường và video dùng canvas đều lật/khôi phục được; không làm lệch vị trí, không mất transform gốc và không hồi quy lỗi disable đã sửa.

### 4.2. Background Play — phát khi chuyển tab

**Hành vi:** khi bật, video đang phát được tiếp tục phát nếu người dùng chuyển sang tab khác hoặc thu nhỏ cửa sổ, trong phạm vi trình duyệt cho phép. Khi người dùng chủ động pause, phải giữ pause.

**Triển khai dự kiến:**

1. Ghi nhận video hiện tại, trạng thái trước khi tab bị ẩn và ý định pause/play của người dùng.
2. Theo dõi `visibilitychange`, thay player và các sự kiện play/pause.
3. Chỉ can thiệp tình huống pause do chuyển nền đã được xác minh trong bước khảo sát; không dùng vòng lặp gọi `play()` cho mọi sự kiện pause.
4. Nếu cần làm việc trong MAIN world, dùng bridge nhỏ, giới hạn trong player và chỉ bật khi feature hoạt động. Không ghi đè `document.hidden` hoặc chặn mọi listener visibility của trang.
5. Xử lý promise bị từ chối từ `play()`; hiển thị yêu cầu người dùng nhấn phát khi autoplay bị trình duyệt chặn.
6. Tắt feature phải dọn listener/can thiệp của extension; không tự pause video đang chạy bình thường.

**Giới hạn cần kiểm chứng:** phân biệt pause của TikTok với pause của người dùng là công việc khảo sát, không coi là đã giải quyết bằng một listener. Không cam kết chạy khi máy sleep, tab bị discard hoặc hệ điều hành đình chỉ trình duyệt.

**Nghiệm thu:** chuyển tab rồi quay lại không reset thời gian/tốc độ; pause thủ công vẫn có tác dụng; bật/tắt không tạo tiếng chồng hoặc vòng lặp play/pause.

### 4.3. Clean Video Mode — ẩn thông tin trên hình

**Hành vi:** ẩn tên tác giả, mô tả, hashtag và các lớp chữ giao diện chồng lên vùng video. Giữ các nút thao tác cơ bản và bình luận bên ngoài vùng video. Không xóa chữ đã được ghi sẵn trong nội dung clip.

**Triển khai:**

- Tập trung selector theo từng kiểu trang: feed, trang video chi tiết và player dạng modal.
- Ưu tiên thuộc tính ổn định như `data-e2e`, cấu trúc gần player và vai trò phần tử, tránh phụ thuộc hoàn toàn vào tên class tự sinh.
- Bật class/attribute có namespace của extension; CSS chỉ tác động các lớp thông tin được xác định.
- Không xóa DOM hoặc sửa `innerHTML` của TikTok. Tắt mode phải khôi phục được bằng cách gỡ class/style do extension sở hữu.
- Xử lý nội dung được thêm khi cuộn; không nhầm caption với lớp canvas đang phát hình.

**Nghiệm thu:** caption biến mất đúng vùng, video vẫn xem/like/pause được; không làm trống panel bình luận; tắt mode khôi phục nguyên trạng.

### 4.4. Speed — tốc độ phát

**Hành vi:** slider **0.5×–4×**, bước **0.1×**; preset **0.5, 1, 1.5, 2, 3, 4** đúng ảnh. Giá trị 1× có trạng thái chọn rõ ràng; giá trị giữa hai preset không làm sáng nhầm preset.

**Triển khai:** dùng `playbackRate` và `defaultPlaybackRate` trên media element, giữ cao độ bằng `preservesPitch` nếu hỗ trợ. Lưu lựa chọn và áp dụng khi TikTok tạo/recycle video. Xử lý `ratechange` có kiểm tra giá trị để tránh vòng lặp. Thay đổi bằng thanh tốc độ gốc của TikTok sẽ cập nhật trạng thái trong phiên thay vì liên tục tranh chấp với extension. [Tài liệu playbackRate](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/playbackRate).

**Nghiệm thu:** slider, preset và trạng thái thực thống nhất; video mới kế thừa tốc độ; tốc độ cao kết hợp EQ không gây mất âm thanh ngoài hành vi của trình duyệt.

### 4.5. Equalizer — EQ

**Hành vi:** dropdown gồm **Normal, Bass Boost, Vocal, Treble Boost**. Normal là âm thanh gốc. EQ chỉ tác động nghe trong tab; không thay đổi file tải xuống.

**Phương án ưu tiên:** `tabCapture` lấy âm thanh tab sau thao tác chủ động, chuyển stream sang offscreen document và xử lý bằng Web Audio. Cần nâng Chrome tối thiểu từ 110 lên **116** cho luồng stream ID từ service worker sang offscreen; kiểm tra phiên bản Edge tương ứng. [Quy tắc tabCapture](https://developer.chrome.com/docs/extensions/reference/api/tabCapture).

Thiết kế xử lý:

- Một phiên EQ hoạt động tại một thời điểm trong bản đầu; khi chuyển xử lý sang tab khác, kết thúc phiên cũ rõ ràng.
- Graph: `MediaStreamAudioSourceNode → preamp → BiquadFilterNode[] → limiter → destination`.
- Đề xuất 5 band tại 60 Hz, 250 Hz, 1 kHz, 4 kHz và 12 kHz. Gain cụ thể được chốt qua nghe thử và đo clipping.
- Khi tab bị capture, phải nối đầu ra về loa để người dùng tiếp tục nghe. Lỗi thiết lập phải đóng track và trả lại âm thanh gốc.
- Chọn Normal hoặc tắt EQ sẽ dừng capture và dọn graph; đóng popup không được làm mất tiếng.
- Chỉ lưu tên preset. Sau lần khởi động trình duyệt mới, UI thể hiện “chưa kích hoạt” nếu cần thao tác người dùng để mở lại phiên xử lý.
- Offscreen document quản lý vòng đời theo lý do sử dụng thực tế, xử lý bị đóng và tái tạo khi cần; không dùng nó làm cách giữ service worker sống vô hạn. [Tài liệu offscreen](https://developer.chrome.com/docs/extensions/reference/api/offscreen).

**Không ưu tiên:** nối trực tiếp mọi video vào `createMediaElementSource()` trước khi kiểm tra CORS và khả năng khôi phục, vì có nguy cơ mất tiếng trên media cross-origin.

**Nghiệm thu:** nghe được thay đổi preset; Normal khôi phục tiếng gốc; không tiếng đôi, không tăng âm gây vỡ tiếng, không còn capture sau khi đóng tab/tắt tính năng. Đo độ trễ và đồng bộ hình–tiếng trên máy thực.

### 4.6. Capture Frame — chụp khung hình

**Hành vi:** lưu PNG của khung hình hiện tại; mặc định phản ánh chiều lật người dùng đang xem. Không áp dụng theme, panel bình luận hoặc popup vào ảnh.

Thứ tự xử lý:

1. Chụp từ media element có frame hợp lệ vào canvas xuất riêng, theo `videoWidth`/`videoHeight`.
2. Với trình phát tăng cường, thử lấy frame từ canvas render khi có thể xuất an toàn; không giả định canvas WebGL luôn có buffer đọc được.
3. Áp dụng mirror một lần ở canvas xuất; tránh đảo hai lần nếu đầu vào đã được biến đổi.
4. Xuất qua `toBlob('image/png')`; xử lý ảnh rỗng và `SecurityError` khi canvas không origin-clean. Không đổi `crossOrigin` của video đang phát để ép tải lại nguồn. [Quy tắc xuất canvas](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob).
5. Nếu không thể lấy frame trực tiếp, cho lựa chọn rõ **“Chụp vùng video đang hiển thị”**: dùng `captureVisibleTab`, crop theo hình chữ nhật player và tỷ lệ kích thước ảnh chụp/viewport. Ảnh này có thể chứa overlay và có độ phân giải theo màn hình; không ghi là frame gốc. [API chụp tab](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-captureVisibleTab).

Tên file đề xuất: `tiktok_<videoId>_<thoi-diem-ms>_<timestamp>.png`. Dùng cơ chế tải của trình duyệt; thu hồi object URL sau khi không còn cần thiết.

**Nghiệm thu:** PNG mở được, không đen/rỗng; chiều lật đúng; tên file an toàn; trường hợp CORS hoặc chưa có frame có thông báo và phương án thay thế đúng bản chất.

### 4.7. Download Video/Audio — trọng tâm theo ảnh 2

#### 4.7.1. Luồng người dùng

1. Mở popup: URL video đang xem được gợi ý nếu xác định chắc chắn được video ID. URL người dùng đang nhập không bị tự ghi đè khi cuộn feed.
2. Người dùng dán URL hoặc chọn **Dùng video đang xem**.
3. Nhấn **Phân tích** hoặc Enter; kiểm tra URL, chuẩn hóa và phân giải nguồn.
4. Hiện metadata gọn: tác giả/tên video nếu có, số lựa chọn thật sự tải được và các hàng định dạng.
5. Đánh dấu bản không logo tốt nhất làm mặc định; nút chính ghi rõ **Tải video không logo**.
6. Nhấn một hàng sẽ tải đúng biến thể của hàng đó. Bản có logo chỉ tải khi người dùng chủ động chọn.
7. Hiện đang tải/đang chuyển đổi/đã lưu/lỗi; cho thử lại hoặc hủy khi được hỗ trợ.

**Không tự bắt đầu tải chỉ vì vừa dán link hoặc vừa phân tích xong.**

#### 4.7.2. Quy tắc các hàng kết quả

| Hàng như ảnh | Cách hiểu và điều kiện bật |
| --- | --- |
| Video HD | Bản có chất lượng cao nhất và xác định không logo; hiển thị thêm độ phân giải nếu biết. Khi không có bản HD phù hợp, khóa hàng với lý do |
| Video không logo | Bản không logo tiêu chuẩn từ nguồn; đây là ưu tiên mặc định |
| Video có logo | Biến thể nguồn xác định có logo, chỉ tải khi được chọn rõ |
| Audio MP3 | Tệp MP3 thật từ nguồn hoặc audio đầy đủ được chuyển mã thành MP3 |

- Quy tắc chọn mặc định: `HD không logo → video không logo tiêu chuẩn → không có lựa chọn mặc định khả dụng`.
- “HD” dựa trên độ phân giải/metadata thật, không dựa vào dung lượng lớn hơn hay tên trường của provider.
- Nếu HD và bản không logo tiêu chuẩn trỏ cùng tài nguyên, thể hiện chung một nguồn hoặc đánh dấu trùng; số lựa chọn không được tính gấp đôi.
- Chỉ hiện **“4 lựa chọn khả dụng”** khi thực sự có bốn đầu ra khác nhau. Hàng thiếu nguồn giữ trạng thái không khả dụng kèm lý do.
- Không hardcode dung lượng **939 KB / 1.5 MB** trong ảnh. Nếu không biết dung lượng, ghi **Chưa xác định**; dung lượng sau chuyển đổi có thể chỉ có khi hoàn tất.
- `watermark = unknown` không được tự coi là `false`. Nhãn không logo cần nguồn có khả năng cung cấp thông tin đủ tin cậy.
- Không crop, blur hoặc che logo để giả thành bản không logo. Yêu cầu là chọn đúng biến thể nguồn không logo.
- Không tự chèn logo, credit hoặc watermark mới vào file xuất.

#### 4.7.3. Nguồn lấy file và bước kiểm chứng bắt buộc

Không xem `video.currentSrc` là URL MP4: nguồn có thể là `blob:` trỏ tới MediaSource. Tải blob đang phát hoặc đổi đuôi file không tạo ra một video hoàn chỉnh.

Phương án ưu tiên là resolver cục bộ:

1. Với video đang mở, đọc metadata/media variant có sẵn từ trang thông qua adapter có giới hạn.
2. Với URL được dán, phân giải trang công khai và metadata đúng video ID nếu truy cập được.
3. Trả các biến thể media có URL HTTPS hợp lệ, chất lượng, MIME và thông tin watermark.
4. Nếu là nguồn phân đoạn hoặc cần ghép audio/video, khai báo rõ cần xử lý; không đưa manifest playlist cho người dùng với đuôi `.mp4`.

TikTok Display API công khai cung cấp metadata/embed; cấu trúc Video Object được kiểm tra không có trường download không logo. Vì vậy **không có cơ sở coi API này là giải pháp tải không logo cho mọi URL**. [Video Object của TikTok](https://developers.tiktok.com/docs/en/tiktok-api-v2-video-object).

**Điểm quyết định ở giai đoạn khảo sát:** xác minh resolver cục bộ có lấy được nguồn thật cho link đang xem và link được dán hay không. Nếu không đáp ứng, chọn một adapter dịch vụ phân giải có backend do chủ dự án kiểm soát hoặc một provider có tài liệu, đã đánh giá khả năng trả no-watermark/HD/audio. Plan này chưa chọn provider, chưa mở tài khoản, chưa phát sinh phí và chưa gửi URL sang dịch vụ đó.

Nếu cần backend, phải có mô tả riêng về endpoint, dữ liệu gửi, thời hạn lưu, quota, chi phí và cách triển khai. Khóa API nằm ở backend, không nhúng trong extension. Không lấy một endpoint miễn phí không được tài liệu hóa làm phụ thuộc duy nhất.

**Cổng hoàn thành:** chức năng tải không được đánh dấu hoàn thành nếu chỉ có giao diện giả, chỉ hỗ trợ blob, hoặc nguồn không logo chưa được chứng minh. Nếu chưa có provider phù hợp, các tính năng khác có thể được làm trước nhưng bản đầy đủ vẫn còn công việc download.

#### 4.7.4. URL và lỗi

- Hỗ trợ đầu tiên URL dạng `https://www.tiktok.com/@user/video/<id>` và dạng share TikTok đã được xác minh.
- Xử lý `vm.tiktok.com`, `vt.tiktok.com` hoặc `/t/...` bằng luồng mở rộng redirect có giới hạn; kiểm tra lại hostname ở mỗi bước, không nhận URL tùy ý.
- Canonical URL loại tracking không cần thiết; không đổi video ID hoặc làm hỏng chữ ký URL media.
- Phân biệt link sai, video không tồn tại, riêng tư, nguồn không cho tải, bị yêu cầu đăng nhập, không có bản không logo, nguồn hết hạn, mạng lỗi và provider quá tải.
- Với HTTP 403/URL hết hạn, phân giải lại tối đa một lần trước khi báo lỗi; không thử vô hạn.
- Hủy phân tích cũ khi người dùng đổi URL; cache kết quả ngắn theo video ID và thời hạn nguồn, không lưu URL CDN có chữ ký lâu dài.

#### 4.7.5. Audio MP3

Mục tiêu là **âm thanh đầy đủ của clip**, không phải mặc định lấy nhạc nền trong thư viện TikTok; hai nguồn có thể khác lời thoại/âm thanh.

- Nếu resolver có MP3 đúng nội dung clip, dùng trực tiếp.
- Nếu có MP4/M4A/AAC/Opus, demux/decode và chuyển mã đúng định dạng MP3; không chỉ đổi phần mở rộng.
- Ưu tiên thử encoder cục bộ, ví dụ `ffmpeg.wasm` chạy trong worker thuộc ngữ cảnh extension. Chỉ đóng gói core/codec thực sự cần, kiểm tra giấy phép, CSP cho WASM, bộ nhớ và vòng đời trước khi chốt phụ thuộc. [Kiến trúc ffmpeg.wasm](https://ffmpegwasm.netlify.app/docs/overview/).
- Không cam kết MP3 từ `MediaRecorder`: phải kiểm tra MIME được hỗ trợ; ghi WebM/Opus không tương đương MP3. [Kiểm tra định dạng MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static).
- Đề xuất bitrate MP3 192 kbps; giới hạn kích thước nguồn/thời lượng và xử lý một job chuyển mã tại một thời điểm sau khi đo trên máy thực.
- Đóng popup không dừng job; có tiến trình và hủy; giải phóng bộ nhớ/file tạm sau xong hoặc lỗi.
- Nếu máy hoặc codec không đáp ứng, báo rõ MP3 chưa khả dụng hoặc dùng backend đã cấu hình; không tự tải file sai định dạng.

#### 4.7.6. Quản lý download

- Service worker gọi `chrome.downloads.download` và theo dõi `downloads.onChanged`; Chrome quản lý việc truyền file. [Downloads API](https://developer.chrome.com/docs/extensions/reference/api/downloads).
- URL hết hạn ngắn được phân giải gần lúc nhấn tải. Mỗi job giữ video ID, định dạng và download ID để đối chiếu khi worker hoạt động lại.
- Các lần mở popup chỉ xem trạng thái job, không bắt đầu lại. Tránh tải trùng do double-click; đề xuất tối đa hai download và một job chuyển mã đồng thời.
- Tên file đề xuất: `TikTok/<author>_<videoId>_<variant>.mp4` hoặc `.mp3`; lọc ký tự cấm, chống đường dẫn `../` và dùng chiến lược tự thêm số khi trùng.
- Tốc độ xem, mirror và EQ không sửa byte của file tải. Xuất video đã chỉnh sửa là chức năng khác, ngoài đợt này.

## 5. Kiến trúc triển khai

### 5.1. Phân chia trách nhiệm

```text
Popup
  ├── Settings / trạng thái tab / điều khiển player
  └── URL / lựa chọn tải / theo dõi tác vụ
            │ message có requestId, tabId, videoId
            ▼
Service worker
  ├── Router message / kiểm tra dữ liệu
  ├── Download manager / resolver adapter
  ├── Capture coordinator
  └── Audio session coordinator
            │
            ├── Content script → player adapter → mirror / speed / clean / background
            └── Offscreen document → Web Audio / xuất ảnh / chuyển mã khi cần
```

- Content script không làm request media cross-origin tùy tiện; request từ extension origin cần host permission phù hợp. [Quy tắc network của extension](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests).
- Service worker chỉ điều phối; không chứa graph Web Audio, canvas DOM hoặc tác vụ encode dài. Trạng thái phải khôi phục được khi worker bị dừng. [Vòng đời service worker MV3](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).
- MAIN-world bridge chỉ thêm khi một khả năng thực sự yêu cầu; dữ liệu đi qua bridge được coi là không tin cậy, không được yêu cầu fetch URL tùy ý.
- Player adapter trả về `mediaElement`, `renderTargets`, `videoId`, thời gian, kích thước và trạng thái. Mirror không còn sở hữu logic nhận diện renderer dùng chung.

### 5.2. Cấu trúc file dự kiến

```text
extension/
  manifest.json
  background.js
  content.js
  content.css
  shared/
    settings.js
    messages.js
    validation.js
  player/
    adapter.js
    selectors.js
    page-bridge.js          # chỉ khi khảo sát chứng minh cần MAIN world
  features/
    mirror.js
    background-play.js
    clean-mode.js
    playback-speed.js
    capture-frame.js
  services/
    download-manager.js
    resolver.js
    providers/
      page-provider.js
      remote-provider.js   # chỉ thêm khi đã chọn backend/provider
    audio-session.js
  offscreen/
    offscreen.html
    offscreen.js
    equalizer.js
    audio-converter.js
  popup/
    popup.html
    popup.css
    popup.js
    components/
      feature-controls.js
      playback-controls.js
      download-panel.js
  assets/
    icons/
tests/
  fixtures/
  player.spec.js
  mirror.spec.js
  playback.spec.js
  capture.spec.js
  downloads.spec.js
  popup.spec.js
```

Giữ JavaScript thuần cho UI. Nếu encoder cần build/copy tài nguyên thì chỉ thêm bước đóng gói cần thiết; bản ZIP cuối vẫn cài bằng Load unpacked, người dùng không phải tự build.

### 5.3. Settings và trạng thái

Settings có `schemaVersion`; migrate hai tùy chọn cũ, không làm mất lựa chọn autoMirror/showFloatingButton của v0.1.1.

```json
{
  "schemaVersion": 2,
  "autoMirror": false,
  "showFloatingButton": true,
  "backgroundPlay": false,
  "cleanMode": false,
  "playbackRate": 1,
  "equalizerPreset": "normal",
  "theme": "dark",
  "captureFormat": "png",
  "downloadPreference": "no-watermark"
}
```

Quy tắc đồng bộ:

- Theme và lựa chọn mặc định lưu `storage.local`; các tab cập nhật settings tương tự hiện tại.
- Mirror thủ công, user-pause và video đang xem thuộc phiên/tab; không ghi đè chéo tab.
- Preset EQ được lưu nhưng trạng thái capture là trạng thái phiên, không suy ra “đang hoạt động” chỉ từ preset.
- Job download lưu tối thiểu trong `storage.session` cùng download ID; khi worker khởi động lại đối chiếu download đang chạy. Nếu trình duyệt khởi động lại, nhận diện job mất phiên là đã gián đoạn; không tự tải lại.
- Không lưu lịch sử xem hoặc danh sách URL đã dán mặc định.

### 5.4. Hợp đồng message và resolver

Message gồm `type`, `requestId`, `tabId`, `videoId` nếu liên quan và `payload` đã kiểm tra. Phản hồi có `ok`, `data` hoặc `error.code/error.message`. Popup bỏ phản hồi của request không còn hiện hành.

Nhóm message dự kiến: `PLAYER_STATUS`, `MIRROR_TOGGLE`, `SETTINGS_PATCH`, `SPEED_SET`, `CAPTURE_FRAME`, `EQ_START`, `EQ_SET_PRESET`, `EQ_STOP`, `DOWNLOAD_RESOLVE`, `DOWNLOAD_START`, `DOWNLOAD_STATUS`, `DOWNLOAD_CANCEL`.

Resolver trả cấu trúc thống nhất:

```text
videoId, canonicalUrl, author?, title?, expiresAt?
variants[]:
  id
  kind: video | audio
  container / mimeType / codec?
  qualityLabel / width? / height? / bitrate?
  watermark: true | false | unknown
  sizeBytes?: number
  url?: HTTPS URL
  requiresMux?: boolean
  requiresTranscode?: boolean
  sourceProvider
  unavailableReason?
```

Token/URL nguồn không được đưa vào UI thông báo lỗi hoặc log dài hạn. Kiểm tra video ID của kết quả khớp yêu cầu trước khi hiện các hàng tải.

## 6. Quyền và cấu hình trình duyệt

| Quyền/cấu hình | Mục đích | Cách sử dụng dự kiến |
| --- | --- | --- |
| `storage` | Settings và trạng thái tác vụ | Giữ từ bản hiện tại |
| `downloads` | Lưu ảnh, video, MP3 và theo dõi tải | Thêm khi triển khai nhóm Actions |
| `activeTab` | Chụp vùng tab và khởi tạo capture âm thanh sau thao tác | Dùng đúng tab người dùng chọn |
| `tabCapture` | EQ qua âm thanh tab | Chỉ khởi tạo từ thao tác EQ; kiểm tra việc xin quyền lúc bật lần đầu |
| `offscreen` | Web Audio, xử lý ảnh/codec cần DOM | Một document dùng chung, quản lý phiên rõ ràng |
| `scripting` | Bridge MAIN world nếu cần | Chỉ thêm sau khảo sát, không thêm mặc định để dự phòng |
| Host permissions TikTok/CDN | Đọc metadata hoặc tải/chuyển mã nguồn | Chỉ các hostname đã xác minh; dùng optional host permission khi phù hợp |
| Host permission backend | Resolver từ xa nếu đã chọn | Chỉ origin backend đã cấu hình |
| CSP cho WASM | Encoder MP3 cục bộ nếu được chọn | Đóng gói code/worker/core trong extension; không tải script thực thi từ CDN |

Không cần quyền cookies, debugger hoặc truy cập mọi website để làm các phần đã nêu. Không xin quyền `tabs` chỉ để lấy active tab ID; đánh giá riêng nếu thật sự cần thông tin bị giới hạn. Mọi fetch/redirect phải giới hạn host, scheme và kích thước; backend nếu có không được trở thành proxy đến địa chỉ nội bộ tùy ý.

## 7. Thứ tự triển khai và đầu ra

### Giai đoạn 0 — Khảo sát và chứng minh khả thi

**Ưu tiên làm trước phần tốn công nhất: nguồn download và audio.**

- [ ] Xác minh DOM trên feed, video chi tiết, modal; gồm link người dùng đã gửi: `https://www.tiktok.com/@bongdaquanhday/video/7699174948165651743`.
- [ ] Xác minh dừng nền của TikTok và cách tôn trọng pause thủ công.
- [ ] Thử EQ qua tabCapture/offscreen, đo trả tiếng về loa và khả năng khôi phục.
- [ ] Tìm các nguồn thực: HD không logo, không logo thường, có logo, audio; xác minh dữ liệu file thay vì chỉ URL.
- [ ] Thử URL đang mở, URL được dán và short link; ghi rõ độ bao phủ của resolver cục bộ.
- [ ] Thử xuất PNG với video/canvas, CORS và ảnh chụp fallback.
- [ ] Thử MP3 thật qua encoder đề xuất; ghi kích thước package, CPU, bộ nhớ và thời gian.
- [ ] Ghi kết quả vào `docs/feasibility.md`, quyết định có cần backend/provider và encoder nào.

**Điều kiện qua bước:** có đường đi đã kiểm chứng cho no-watermark và MP3, hoặc ghi rõ phần còn cần chọn nguồn trước khi cam kết bản đầy đủ. Các module xem video có thể triển khai độc lập trong thời gian này.

### Giai đoạn 1 — Nền tảng và popup mới

- [ ] Tách player adapter, giữ hành vi mirror/canvas hiện tại.
- [ ] Thêm schema settings, migration, message có requestId và trạng thái tab.
- [ ] Xây bố cục popup, theme, icon, trạng thái rỗng/lỗi/loading.
- [ ] Tách controller các nhóm Features/Playback/Actions.
- [ ] Giữ bộ kiểm thử v0.1.1 đạt trước khi thêm feature tiếp theo.

**Đầu ra:** popup mới có nền tảng thật; các chức năng chưa xong không được trình bày như đã dùng được.

### Giai đoạn 2 — Công cụ xem

- [ ] Speed slider/preset, lưu và áp dụng khi thay video.
- [ ] Clean Mode theo từng kiểu trang.
- [ ] Background Play theo kết quả giai đoạn 0.
- [ ] Kiểm thử kết hợp mirror, speed, clean và chuyển tab.

**Đầu ra:** bộ công cụ xem hoạt động với cả video thường và canvas.

### Giai đoạn 3 — Chụp khung hình

- [ ] Chụp frame trực tiếp, áp dụng mirror đúng một lần.
- [ ] Xuất PNG, đặt tên file và xử lý tải.
- [ ] Trạng thái chưa có frame/CORS/WebGL; fallback chụp vùng rõ ràng.
- [ ] Kiểm tra đầu ra bằng pixel ảnh, không chỉ kiểm tra có file.

### Giai đoạn 4 — Tải video theo ảnh 2

- [ ] URL input, Enter, dùng video đang xem, chuẩn hóa link.
- [ ] Resolver adapter theo nguồn đã chốt ở giai đoạn 0.
- [ ] Metadata, danh sách biến thể, dung lượng thật hoặc chưa biết.
- [ ] Chọn mặc định no-watermark, không fallback sang watermark.
- [ ] Downloads manager, tiến trình, lỗi, hủy và retry có giới hạn.
- [ ] Kiểm tra file MP4 mở được, đúng video, đúng độ phân giải và đúng nhãn watermark.

### Giai đoạn 5 — EQ và MP3

- [ ] Hoàn thiện audio session/offscreen, dropdown preset và khôi phục âm thanh.
- [ ] Tích hợp chuyển MP3 theo encoder/provider đã chốt.
- [ ] Job không phụ thuộc popup, tiến trình, hủy và giới hạn tài nguyên.
- [ ] Kiểm tra nội dung MP3 đúng audio của clip, có lời thoại nếu clip có.

Hai nhánh EQ và MP3 dùng chung vòng đời offscreen nhưng không dùng chung stream EQ để xuất audio: MP3 phải đến từ nguồn clip đầy đủ.

### Giai đoạn 6 — Kiểm thử tích hợp và đóng gói

- [ ] Chạy bộ tự động và thử thủ công trên Chrome đang dùng; Edge là trình duyệt bổ sung.
- [ ] So sánh popup với hai ảnh ở kích thước thật, cả trạng thái chưa phân tích và đã có kết quả tải.
- [ ] Đo tài nguyên, kiểm tra nhiều tab, popup đóng/mở và worker restart.
- [ ] Cập nhật README về chức năng, quyền và giới hạn đã xác minh.
- [ ] Đồng bộ manifest/package/version và đóng ZIP có manifest trong thư mục cài đặt rõ ràng.
- [ ] Kiểm tra cài mới và cập nhật từ v0.1.1; ghi changelog.

## 8. Ma trận kiểm thử

### 8.1. Kiểm thử tự động

| Nhóm | Ca kiểm thử trọng tâm | Kết quả cần chứng minh |
| --- | --- | --- |
| Player/mirror | Video thường, opacity 0 + canvas, thay renderer, nguồn đổi, fullscreen | Chọn đúng video, không disable sai, khôi phục transform |
| Settings | Migrate bản cũ, dữ liệu sai kiểu, hai popup cập nhật, mở lại extension | Không mất tùy chọn, không ghi đè trường không liên quan |
| Speed | Tất cả preset, giá trị giữa preset, player recycle, ratechange ngoài extension | Tốc độ thực và UI đồng nhất, không lặp vô hạn |
| Background | Tab ẩn/hiện, pause thủ công, autoplay bị từ chối, feature tắt | Không ép phát khi người dùng đã pause |
| Clean Mode | Feed/detail/modal, caption mới, bật/tắt nhiều lần | Ẩn đúng lớp, khôi phục đầy đủ |
| EQ | Preset, Normal, lỗi capture, đổi tab, đóng popup/tab | Tiếng được trả ra loa, track/graph được dọn |
| Capture | Frame có hình, canvas, mirror, video chưa ready, canvas bị taint, DPR/crop | PNG đúng nội dung/kích thước; fallback có nhãn đúng |
| URL | Link chuẩn, short link, host giả `tiktok.com.evil`, redirect ra ngoài, URL sai | Chỉ phân giải link hợp lệ và đúng video ID |
| Download | 0–4 nguồn thật, HD/no-WM trùng nhau, watermark unknown, thiếu no-WM | Mặc định đúng, không tạo số file hoặc dung lượng giả |
| Download lifecycle | 403, hết hạn, double-click, URL A/B phản hồi đảo thứ tự, popup đóng, worker restart | Không tải trùng/nhầm, retry hữu hạn, trạng thái khôi phục |
| MP3 | Audio nguồn khác định dạng, clip có lời thoại, cancel, thiếu bộ nhớ | MP3 thật, đầy đủ clip, không đổi đuôi giả |
| Popup | Dark/light, chiều cao giới hạn, bàn phím, lỗi độc lập theo nhóm | Dễ dùng và không tràn ngang |

Dùng fixture và mock resolver cho kiểm thử lặp lại. Với media đầu ra, kiểm tra header/container, thời lượng, độ phân giải và một số frame/audio mẫu; DOM assertion một mình không chứng minh tải đúng file. Test EQ/autoplay được bổ sung thử thật vì môi trường headless không phản ánh đầy đủ âm thanh và thao tác người dùng.

### 8.2. Kiểm thử thủ công trên Chrome

- [ ] Feed đang phát và trang video từ link cụ thể người dùng gửi.
- [ ] Cả video thường và chế độ canvas tăng cường.
- [ ] Popup mở khi video đang phát, pause hoặc vừa chuyển video.
- [ ] Chuyển tab, thu nhỏ cửa sổ, quay lại; pause thủ công vẫn được giữ.
- [ ] Mirror + Clean + Speed + EQ bật cùng lúc.
- [ ] Chụp frame trước/sau lật; mở PNG kiểm tra trực quan.
- [ ] Tải mặc định không logo; chủ động chọn bản có logo và đối chiếu khác biệt.
- [ ] Link chỉ có một số biến thể; trường hợp không có nguồn không logo.
- [ ] MP3 có thời lượng và nội dung khớp clip, không chỉ có bài nhạc nền.
- [ ] URL sai, nguồn hết hạn, mất mạng, video không truy cập được.
- [ ] Đóng popup giữa lúc tải/chuyển mã rồi mở lại.
- [ ] Reload extension và cập nhật từ bản cũ, settings được giữ.

## 9. Rủi ro và cách xử lý

| Rủi ro | Tác động | Hướng xử lý |
| --- | --- | --- |
| TikTok đổi DOM/renderer | Chọn sai video hoặc Clean Mode hỏng | Adapter/selector tập trung, fixture từ DOM thực tế, kiểm tra lỗi riêng từng feature |
| Không có nguồn no-watermark đáng tin cậy | Không đáp ứng yêu cầu download mặc định | Khảo sát trước; chọn provider khi cần; không fallback âm thầm |
| Blob/playlist bị tưởng là MP4 | File tải hỏng hoặc thiếu audio | Phân loại nguồn, hỗ trợ mux khi cần và kiểm tra container đầu ra |
| Autoplay/visibility policy | Background Play không tiếp tục hoặc ép phát nhầm | Tôn trọng user intent, xử lý lỗi play, chỉ phát hành sau thử thật |
| EQ bị mất tiếng/độ trễ | Ảnh hưởng trải nghiệm xem | Phiên capture có khôi phục, limiter/preamp, thử máy thật |
| Canvas bị taint hoặc WebGL không đọc được | Chụp ảnh đen hoặc lỗi | Kiểm tra ảnh đầu ra, fallback chụp vùng có nhãn |
| MP3 WASM nặng | CPU/RAM cao, popup treo | Worker riêng, giới hạn job/kích thước, đo trước khi chọn core |
| Worker bị dừng | UI mất trạng thái tác vụ | Job có ID và khôi phục trạng thái, không giữ việc quan trọng chỉ trong biến RAM |
| Download URL hết hạn | Tải 403 sau khi chờ | Resolve gần lúc tải, phân giải lại một lần |
| Hai popup/tab ghi settings | Lệch lựa chọn giữa các tính năng | PATCH theo field qua một coordinator, schema validation |

## 10. Ước lượng và ưu tiên

Đây là ước lượng công sức kỹ thuật sơ bộ, không phải lịch cam kết. Một ngày công khoảng một ngày làm việc tập trung; cần ước lượng lại sau giai đoạn 0.

| Hạng mục | Khoảng công sức |
| --- | --- |
| Khảo sát nguồn media, Background Play, EQ, capture, MP3 | 1–3 ngày công |
| Nền tảng, migration và popup mới | 1–2 ngày công |
| Speed, Clean, Background Play | 1–3 ngày công |
| Capture Frame | 0.5–1.5 ngày công |
| Resolver và tải video | 2–4 ngày công nếu nguồn đã dùng được |
| EQ và MP3 | 2–4 ngày công |
| Tích hợp, kiểm tra Chrome thực và đóng gói | 1–2 ngày công |

Tổng dự kiến: **8.5–19.5 ngày công**, chưa bao gồm xây/vận hành backend mới, đăng ký provider, phí dịch vụ hoặc xử lý thay đổi của TikTok. Ưu tiên chứng minh download không logo sớm; giao diện download hoàn chỉnh phụ thuộc vào nguồn đã kiểm chứng.

Có thể tạo bản xem trước sau giai đoạn 3 với mirror, giao diện mới, công cụ xem và chụp ảnh. Bản xem trước không được coi là đã hoàn tất yêu cầu tải video/MP3.

## 11. Điều kiện hoàn thành toàn bộ

- [ ] Đủ các chức năng nhìn thấy trong hai ảnh, cộng chức năng lật hiện tại.
- [ ] Download có các hàng tương ứng ảnh 2, dữ liệu và trạng thái khả dụng là thật.
- [ ] Nút tải chính mặc định chọn nguồn không logo chất lượng tốt nhất; thiếu nguồn phải báo rõ.
- [ ] Không đổi file audio sang đuôi MP3 nếu chưa chuyển mã đúng.
- [ ] Video dùng canvas không gây disable sai nút điều khiển.
- [ ] Tác vụ tải/chuyển mã không phụ thuộc popup phải luôn mở.
- [ ] Không mất âm thanh hoặc để capture tồn tại sau khi tắt EQ.
- [ ] Settings v0.1.1 được migrate, mirror và phím tắt cũ tiếp tục hoạt động.
- [ ] Bộ kiểm thử đạt; có bằng chứng kiểm tra thủ công trên Chrome và file tải thật mở được.
- [ ] Có ZIP, README, changelog và hướng dẫn quyền mới; version thống nhất.

## 12. Ngoài phạm vi đợt này

Tải hàng loạt tài khoản/playlist, TikTok LIVE, đăng nhập hộ, tải nội dung riêng tư không truy cập được, auto-like/follow/comment, xóa logo bằng xử lý ảnh, sửa video rồi encode lại theo mirror/speed/EQ, lịch sử xem và analytics không nằm trong yêu cầu của hai ảnh.

Phần nền tảng sẽ cho phép thêm module mới sau này, nhưng không đưa các chức năng này vào bản mở rộng hiện tại để tránh kéo dài phạm vi.
