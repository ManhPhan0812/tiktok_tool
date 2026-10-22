"""Tao icon extension tu anh nguon iconpacks.net.

Nguon: https://www.iconpacks.net/free-icon/tiktok-aesthetic-brown-23190.html
       (free-tiktok-aesthetic-brown-icon-23190.png, 90x90 RGBA)
Giay phep: free for personal and commercial use, ghi nguon iconpacks.net.

Chay: python tools/make_icons.py
"""

from pathlib import Path

from PIL import Image

SOURCE = Path("tools/icon-source/tiktok-aesthetic-brown-23190.png")
OUT_DIR = Path("extension/assets/icons")
PREVIEW = Path("docs/assets/icon-preview-512.png")
SIZES = (16, 32, 48, 128)


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"Thieu anh nguon: {SOURCE}")

    src = Image.open(SOURCE).convert("RGBA")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW.parent.mkdir(parents=True, exist_ok=True)

    # Anh nguon chi 90x90 nen moi co icon duoc tao truc tiep tu no (khong qua trung gian).
    for size in SIZES:
        icon = src.resize((size, size), Image.Resampling.LANCZOS)
        target = OUT_DIR / f"icon-{size}.png"
        icon.save(target, "PNG", optimize=True)
        print(f"{target} {icon.size} {target.stat().st_size} bytes")

    src.resize((512, 512), Image.Resampling.LANCZOS).save(PREVIEW, "PNG", optimize=True)
    print(f"{PREVIEW} 512x512 (anh xem truoc cho README)")


if __name__ == "__main__":
    main()
