# TikTok Tools v0.0.1

Bản phát hành đầu tiên cho Chrome/Edge 116 trở lên, dựa trên toàn bộ chức năng của bản thử nghiệm 0.2.2.

## Chức năng

- Lật ngang video TikTok, hỗ trợ cả trình phát canvas; có nút nổi và phím tắt `Alt + Shift + H`.
- Điều chỉnh tốc độ 0,5×–4×, Clean Video Mode và phát nền.
- Chụp khung hình PNG theo đúng chiều đang xem; có phương án chụp vùng hiển thị.
- Phân tích URL qua TikWM và tải HD, video không logo, video có logo hoặc audio MP3 khi nguồn có sẵn. Mặc định ưu tiên bản không logo.
- Equalizer 5 dải với các preset Normal, Bass Boost, Vocal và Treble Boost (thử nghiệm).
- Giao diện sáng/tối, lưu tùy chọn cục bộ và logo TikTok Aesthetic Brown thống nhất.

## Cài đặt

1. Tải **tiktok-tools-v0.0.1.zip** ở mục Assets bên dưới và giải nén.
2. Mở `chrome://extensions` hoặc `edge://extensions`.
3. Bật **Developer mode** và chọn **Load unpacked**.
4. Chọn thư mục vừa giải nén có chứa trực tiếp `manifest.json`.
5. Tải lại tab TikTok, ghim TikTok Tools lên thanh công cụ.

Nếu dùng mã nguồn Git, chọn thư mục `extension/` khi Load unpacked.

## Kiểm chứng và giới hạn

- 56 bài kiểm thử tự động đạt trên Edge/Chromium. Đã phân tích URL thật qua popup và kiểm tra các file media tải thật trong quá trình phát triển.
- Download gửi URL video tới **tikwm.com**; không gửi cookie hay thông tin tài khoản. Khả năng tải phụ thuộc nguồn và tình trạng dịch vụ.
- Audio MP3 lấy từ trường `music` của TikTok, có thể khác phần lời thoại/nhạc ghép trong clip.
- HD có thể dùng H.265/HEVC; chọn bản chuẩn nếu máy không có bộ giải mã tương ứng.
- EQ là tính năng thử nghiệm, chưa được kiểm chứng chất lượng bằng tai.

Số phiên bản được đặt lại từ bản thử nghiệm 0.2.2 thành 0.0.1; chức năng và tùy chọn đã lưu được giữ nguyên. Các mốc 0.1.x/0.2.x trong tài liệu khảo sát chỉ là lịch sử phát triển nội bộ.
