"""Sua tep bi loi ma hoa kep: UTF-8 bi doc nhu CP1252 roi ghi lai thanh UTF-8."""

from pathlib import Path
import sys

TARGETS = sys.argv[1:] or ["README.md", "docs/status.md"]
MARKERS = ("\u00c3", "\u00c2", "\u00e1\u00ba", "\u00e1\u00bb", "\u00c4\u2018")


def to_bytes(text: str) -> bytes:
    out = bytearray()
    for char in text:
        code = ord(char)
        if code == 0xFEFF:
            continue
        if code <= 0xFF:
            out.append(code)
        else:
            out.extend(char.encode("cp1252"))
    return bytes(out)


def looks_broken(text: str) -> bool:
    return any(marker in text for marker in MARKERS)


for target in TARGETS:
    path = Path(target)
    original = path.read_text(encoding="utf-8", errors="replace")
    if not looks_broken(original):
        print(f"{target}: no mojibake marker, skipped")
        continue
    try:
        fixed = to_bytes(original).decode("utf-8")
    except UnicodeDecodeError as error:
        print(f"{target}: decode failed -> {error}")
        continue
    if looks_broken(fixed):
        print(f"{target}: still has mojibake, not written")
        continue
    path.write_text(fixed, encoding="utf-8")
    print(f"{target}: repaired ({len(original)} -> {len(fixed)} chars)")
