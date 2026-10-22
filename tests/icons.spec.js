const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const ROOT = path.join(__dirname, "..");
const ICONS = path.join(ROOT, "extension", "assets", "icons");
const SIZES = [16, 32, 48, 128];
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, "extension", "manifest.json"), "utf8"));

// Đọc PNG RGBA 8-bit (không dùng thư viện) để kiểm tra icon thật sự có hình, không phải tệp rỗng.
function decodePng(file) {
  const buffer = fs.readFileSync(file);
  expect(buffer.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");

  let offset = 8;
  let header = null;
  const data = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      header = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        bitDepth: body[8],
        colorType: body[9],
        interlace: body[12]
      };
    } else if (type === "IDAT") {
      data.push(body);
    } else if (type === "IEND") {
      break;
    }
    offset += length + 12;
  }
  expect(header, "PNG thiếu IHDR").not.toBeNull();
  expect(header.bitDepth).toBe(8);
  expect(header.colorType).toBe(6);
  expect(header.interlace).toBe(0);

  const raw = zlib.inflateSync(Buffer.concat(data));
  const bytesPerPixel = 4;
  const stride = header.width * bytesPerPixel;
  const pixels = Buffer.alloc(stride * header.height);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  };

  for (let y = 0; y < header.height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let x = 0; x < stride; x += 1) {
      const left = x >= bytesPerPixel ? pixels[y * stride + x - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? pixels[(y - 1) * stride + x - bytesPerPixel] : 0;
      let value = line[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += Math.floor((left + up) / 2);
      else if (filter === 4) value += paeth(left, up, upLeft);
      pixels[y * stride + x] = value & 0xff;
    }
  }
  return { ...header, pixels };
}

function stats(image) {
  const total = image.width * image.height;
  let opaque = 0;
  let brown = 0;
  let transparent = 0;
  for (let index = 0; index < total; index += 1) {
    const offset = index * 4;
    const [r, g, b, a] = image.pixels.subarray(offset, offset + 4);
    if (a > 200) {
      opaque += 1;
      if (r >= 120 && r <= 180 && g >= 55 && g <= 110 && b <= 45) brown += 1;
    }
    if (a < 20) transparent += 1;
  }
  return { opaque: opaque / total, brown: brown / total, transparent: transparent / total };
}

test.describe("Icon extension", () => {
  for (const size of SIZES) {
    test(`icon-${size}.png đúng kích thước, có nền trong suốt và có hình`, () => {
      const file = path.join(ICONS, `icon-${size}.png`);
      expect(fs.existsSync(file), `thiếu ${file}`).toBe(true);
      const image = decodePng(file);
      expect(image.width).toBe(size);
      expect(image.height).toBe(size);

      const { opaque, brown, transparent } = stats(image);
      // Icon là glyph nâu đặc trên nền trong suốt: phải có cả vùng đục lẫn vùng trong.
      expect(opaque).toBeGreaterThan(0.5);
      expect(opaque).toBeLessThan(0.9);
      expect(transparent).toBeGreaterThan(0.1);
      expect(brown).toBeGreaterThan(0.3);
    });
  }

  test("manifest trỏ đúng các tệp icon đã tạo", () => {
    const declared = Object.values(MANIFEST.icons);
    expect(new Set(declared)).toEqual(new Set(SIZES.map(size => `assets/icons/icon-${size}.png`)));
    for (const relative of declared) {
      expect(fs.existsSync(path.join(ROOT, "extension", relative)), `manifest trỏ tới ${relative} nhưng không có`).toBe(true);
    }
    expect(MANIFEST.action.default_icon).toEqual(MANIFEST.icons);
  });
});
