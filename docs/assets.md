# Icon và tài nguyên hình ảnh

## Icon extension

| Mục | Giá trị |
| --- | --- |
| Nguồn | <https://www.iconpacks.net/free-icon/tiktok-aesthetic-brown-23190.html> |
| Tệp gốc | `tools/icon-source/tiktok-aesthetic-brown-23190.png` (90×90 RGBA) |
| SHA-256 tệp gốc | `4314b3568fffb07069accd39db0971c50ef699675a29f7883a798575ccf55808` |
| Giấy phép | Miễn phí cho dùng cá nhân và thương mại; ghi nguồn iconpacks.net (không bắt buộc nhưng nên có) |
| Tác giả | iconpacks.net |

Kích thước phát hành: `extension/assets/icons/icon-16.png`, `icon-32.png`, `icon-48.png`, `icon-128.png` — đều RGBA, nền trong suốt.

Trong bản phát hành v0.0.1, cùng logo này xuất hiện ở header popup (cả sáng/tối), nút nổi trên TikTok và biểu tượng thanh công cụ Chrome. Logo trong giao diện đặt trên nền kem để giữ màu nâu rõ trên cả hai theme; không đổi màu ảnh gốc. Chỉ tệp `icon-32.png` dành cho nút nổi được khai báo web-accessible và chỉ trên hai hostname TikTok được hỗ trợ.

Ảnh xem trước 512×512: `docs/assets/icon-preview-512.png`.

### Vì sao icon 128 px hơi mềm

Trang nguồn chỉ cung cấp PNG 90×90 (các biến thể `-128`, `-256`, `-512` và `.svg` đều trả 404). Trang đó cũng tự phóng to bằng canvas khi người dùng chọn kích thước, nên bản 128 px ở đây là phóng to LANCZOS từ ảnh 90×90 — không có thêm chi tiết. Nếu cần nét hơn, phải có bản vector từ nguồn khác.

## Tạo lại icon

```powershell
python tools/make_icons.py      # hoặc: npm run icons
```

Script đọc ảnh gốc ở `tools/icon-source/`, ghi bốn kích thước vào `extension/assets/icons/` và ảnh xem trước 512 px vào `docs/assets/`.

## Ghi công

Icon: [TikTok Aesthetic Brown](https://www.iconpacks.net/free-icon/tiktok-aesthetic-brown-23190.html) từ iconpacks.net.
