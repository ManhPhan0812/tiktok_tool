# TikTok Tools v0.0.4

Hỗ trợ Douyin cho các tính năng xem. Luồng TikTok giữ nguyên; tùy chọn đã lưu không bị xoá.

## Có gì mới

- **Chạy trên `douyin.com`**: lật ngang video, đổi tốc độ 0,5×–4×, Clean Mode, phát nền, chụp khung hình và Equalizer.
- Lật video Douyin chỉ lật `<video>` (player `xgplayer` không có lớp canvas riêng như TikTok), có khôi phục nguyên trạng.
- **Clean Mode Douyin** ẩn đạn màn hình, dòng "tác giả khai báo" và thanh tiến trình; nút thích/bình luận/lưu/chia sẻ vẫn còn.
- Popup ghi rõ đang kết nối **tab TikTok** hay **tab Douyin**; tên tệp chụp trên Douyin có tiền tố `douyin_`.
- **Tải Douyin**: mặc định gọi seekin.ai với chữ ký sinh tại máy, không gửi cookie/token đăng nhập; popup hiện đúng các bản trả về (720p/540p tải được, 1080p khoá kèm lý do) và tải bằng `chrome.downloads` với tên `Douyin/<id>_<quality>.mp4`. Đổi được sang endpoint riêng — [docs/DOUYIN-DOWNLOAD.md](DOUYIN-DOWNLOAD.md).

## Chưa hỗ trợ

- **Tải Douyin phụ thuộc seekin.ai** (dịch vụ bên thứ ba): họ có thể đổi API, chặn hoặc tính phí; khi hỏng extension báo lỗi rõ chứ không treo. Bản 1080p tuỳ tài khoản dịch vụ (API mẫu trả `locked: true`, không có link).
- Chưa kiểm chứng trên phiên Douyin có đăng nhập và ở chế độ toàn màn hình của `xgplayer`.

## Giới hạn cần biết trước

- Douyin trả **captcha** (`验证码中间页`) cho traffic ngoài Trung Quốc và cho trình duyệt tự động. Khi trang không tải được thì extension không có gì để điều khiển — đây là giới hạn của Douyin, không phải lỗi extension.
- Một số video cần đăng nhập mới xem. Extension chỉ đọc `<video>` đang có trên trang, không gửi cookie hay thông tin tài khoản đi đâu.
- Download (TikTok) vẫn gửi URL video tới **tikwm.com** như bản trước; không gửi cookie hay thông tin tài khoản.
- Audio MP3 lấy từ trường `music` của TikTok, có thể khác phần lời thoại/nhạc ghép trong clip. Bản HD có thể dùng H.265/HEVC; chọn bản chuẩn (H.264) nếu máy thiếu bộ giải mã.
- Equalizer vẫn là tính năng **thử nghiệm**, chưa được kiểm chứng chất lượng bằng tai.

## Cài đặt / cập nhật

1. Tải **tiktok-tools-v0.0.4.zip** ở mục Assets bên dưới và giải nén.
2. Mở `chrome://extensions` hoặc `edge://extensions`.
3. Bấm **Reload** trên TikTok Tools (hoặc **Load unpacked** và chọn thư mục có `manifest.json` nếu cài mới).
4. Tải lại tab TikTok/Douyin rồi bấm icon extension. Popup phải hiện **v0.0.4**.

## Kiểm chứng

- **82/82 bài kiểm thử đạt** trên Edge/Chromium, gồm 18 bài mới cho Douyin: 7 bài tính năng xem chạy trên fixture dựng theo đúng DOM đo được của `douyin.com/video/<id>` (content script chạy và đọc đúng video, lật chỉ đụng `<video>`, tốc độ áp dụng và theo tùy chọn đã lưu, Clean Mode ẩn đúng lớp phủ và giữ nút thao tác, chụp PNG đúng kích thước và tên `douyin_…`, popup nhận đúng nền tảng) và 11 bài tải (bốn dạng link, chưa cấu hình thì báo đúng lý do, giữ đúng bản khoá/khả dụng, máy chủ lỗi không hiện hàng giả, popup hiện đúng hàng, bấm tải gọi `chrome.downloads` đúng link và tên tệp, link sai báo lỗi rõ).
- Đo trên trang Douyin thật trước khi viết mã: `playbackRate = 2` giữ nguyên sau 2,5 s, `scaleX(-1)` áp được, `drawImage(video)` không bị taint.
- Nạp chính thư mục `extension/` vào Edge rồi mở `douyin.com/video/7697907897409228095`: nút nổi hiện, bấm thì `<video>` được lật (`matrix(-1, 0, 0, 1, 0, 0)`). Chưa thử trên phiên có đăng nhập.
