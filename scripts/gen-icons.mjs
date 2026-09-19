// Generates placeholder PWA icons (solid dark + cyan target ring) as real PNGs
// using only node built-ins (zlib). Replace with designed assets before launch.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(root, 'public', 'icons'), { recursive: true });

function crc32(buf) {
  let table = crc32.t;
  if (!table) {
    table = crc32.t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** size×size PNG: dark bg + cyan ring + dot (target motif). */
function makeIcon(size) {
  const raw = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const R = size * 0.36;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dist = Math.hypot(x - cx, y - cx);
      const ring = Math.abs(dist - R) < size * 0.035;
      const dot = dist < size * 0.05;
      const cross =
        (Math.abs(x - cx) < size * 0.02 && Math.abs(y - cx) < R) ||
        (Math.abs(y - cx) < size * 0.02 && Math.abs(x - cx) < R);
      const cyan = ring || dot || cross;
      raw[i] = cyan ? 0x22 : 0x0a;
      raw[i + 1] = cyan ? 0xd3 : 0x0e;
      raw[i + 2] = cyan ? 0xee : 0x14;
      raw[i + 3] = 0xff;
    }
  }
  // PNG rows need filter byte prefix
  const rows = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    rows[y * (1 + size * 4)] = 0;
    raw.copy(rows, y * (1 + size * 4) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return png;
}

for (const s of [192, 512]) {
  const p = join(root, 'public', 'icons', `icon-${s}.png`);
  writeFileSync(p, makeIcon(s));
  console.log(`wrote ${p}`);
}
