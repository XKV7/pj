// 앱 아이콘을 코드로 그려 PNG로 저장한다 (외부 이미지 없음). 32x32 픽셀 아트를 정수 배율로 확대.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const G = 32;
function drawGrid(pad) {
  // pad: 마스커블 아이콘용 안전 여백 (격자 단위)
  const px = new Array(G * G).fill([12, 10, 20]);
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
    // 배경: 심연의 어두운 보라 그라데이션 + 바닥 용암 빛
    const t = y / G;
    px[y * G + x] = [Math.round(14 + 20 * t), Math.round(10 + 4 * t), Math.round(26 + 10 * (1 - t))];
  }
  const s = (G - pad * 2) / 2.6;
  const cx = G / 2;
  const cy = G / 2 - 0.5;
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
    const nx = (x + 0.5 - cx) / s;
    const ny = -((y + 0.5 - cy) / s) + 0.25;
    const a = nx * nx + ny * ny - 1;
    const v = a * a * a - nx * nx * ny * ny * ny;
    if (v > 0) continue;
    const facet = ((Math.floor(x / 3) + Math.floor(y / 3)) & 1) ? 0.82 : 1;
    const d = Math.hypot(nx, ny - 0.1);
    const core = Math.max(0, 1 - d * 1.5);
    let r = 70 + 110 * facet + core * 75;
    let g = 30 + 60 * facet + core * 150;
    let b = 120 + 110 * facet + core * 25;
    if (v > -0.035) { r = 245; g = 225; b = 255; }
    px[y * G + x] = [Math.min(255, r) | 0, Math.min(255, g) | 0, Math.min(255, b) | 0];
  }
  // 불씨 입자
  for (const [x, y, c] of [[6 + pad / 2, 24, [255, 140, 40]], [25 - pad / 2, 22, [255, 200, 80]], [9 + pad / 2, 8, [140, 200, 255]], [23 - pad / 2, 9, [255, 120, 200]]]) {
    const i = Math.round(y) * G + Math.round(x);
    if (i >= 0 && i < G * G) px[i] = c;
  }
  return px;
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, grid) {
  const scale = size / G;
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const c = grid[Math.floor(y / scale) * G + Math.floor(x / scale)];
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = c[0];
      raw[o + 1] = c[1];
      raw[o + 2] = c[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync('public/icons', { recursive: true });
const normal = drawGrid(2);
const maskable = drawGrid(6);
writeFileSync('public/icons/icon-192.png', png(192, normal));
writeFileSync('public/icons/icon-512.png', png(512, normal));
writeFileSync('public/icons/maskable-512.png', png(512, maskable));
writeFileSync('public/icons/apple-touch-icon.png', png(192, maskable));
console.log('icons generated');
