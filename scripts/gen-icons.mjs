// 生成 PWA 图标：纯 Node 实现（zlib PNG 编码 + 几何绘制），无第三方依赖
// 设计：暗底 + 五根下降阶梯柱 + 基线（与 src/components/ui-kit.tsx 的 Logo 一致）
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../public/icons');
fs.mkdirSync(OUT, { recursive: true });

// ---------- PNG 编码 ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, pixels /* RGBA Uint8Array */) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // 每行前加 filter byte 0
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0;
    pixels.subarray(y * width * 4, (y + 1) * width * 4).forEach((v, i) => {
      raw[y * (1 + width * 4) + 1 + i] = v;
    });
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- 绘制 ----------

function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}

const BAR_H = [300, 240, 185, 135, 90];
const BAR_COLORS = ['#5b6172', '#7d6a6b', '#a85a50', '#d2483a', '#ff4d3a'].map(hex);
const BG = hex('#101218');
const BASE = hex('#3a4152');

/** 像素对矩形(带圆角)的覆盖率，1px 软边 */
function rectCoverage(x, y, x0, y0, x1, y1, r) {
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  const dx = Math.max(x0 + r - Math.min(x, x1 - r), Math.min(x, x0 + r) - x0, 0);
  void cx; void cy;
  // 简化：先算轴向覆盖，圆角区域按与圆心距离近似
  const inside =
    x >= x0 - 1 && x <= x1 + 1 && y >= y0 - 1 && y <= y1 + 1
      ? Math.min(
          Math.min(x - (x0 - 0.5), x1 + 0.5 - x),
          Math.min(y - (y0 - 0.5), y1 + 0.5 - y),
          1,
        )
      : 0;
  return Math.max(0, Math.min(1, inside));
}

function drawIcon(size) {
  const px = new Uint8Array(size * size * 4);
  const s = size / 512;
  const shapes = [];
  // 五根柱子
  BAR_H.forEach((h, i) => {
    shapes.push({
      x0: (98 + i * 68) * s,
      x1: (98 + i * 68 + 44) * s,
      y0: (356 - h) * s,
      y1: 356 * s,
      color: BAR_COLORS[i],
      r: 10 * s,
    });
  });
  // 基线
  shapes.push({ x0: 88 * s, x1: 424 * s, y0: 368 * s, y1: 378 * s, color: BASE, r: 5 * s });

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = BG[0], g = BG[1], b = BG[2], a = 0;
      for (const sh of shapes) {
        const cov = rectCoverage(x + 0.5, y + 0.5, sh.x0, sh.y0, sh.x1, sh.y1, sh.r);
        if (cov > 0) {
          const na = cov * 255;
          // source-over 合成
          const sa = a / 255;
          const da = na / 255;
          const outA = da + sa * (1 - da);
          if (outA > 0) {
            r = (sh.color[0] * da + r * sa * (1 - da)) / outA;
            g = (sh.color[1] * da + g * sa * (1 - da)) / outA;
            b = (sh.color[2] * da + b * sa * (1 - da)) / outA;
            a = outA * 255;
          }
        }
      }
      const idx = (y * size + x) * 4;
      px[idx] = Math.round(r);
      px[idx + 1] = Math.round(g);
      px[idx + 2] = Math.round(b);
      px[idx + 3] = 255; // 背景不透明
    }
  }
  return encodePNG(size, size, px);
}

for (const size of [192, 512]) {
  fs.writeFileSync(path.join(OUT, `icon-${size}.png`), drawIcon(size));
  console.log(`✓ icon-${size}.png`);
}
fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), drawIcon(180));
console.log('✓ apple-touch-icon.png (180)');
