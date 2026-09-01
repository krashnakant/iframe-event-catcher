import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPNG(width, height) {
  const rawData = Buffer.alloc(width * height * 4);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const nx = x / width;
      const ny = y / height;
      
      let r = Math.floor(99 + nx * 50 - ny * 30);
      let g = Math.floor(102 + ny * 100);
      let b = Math.floor(241 + nx * 14);
      let a = 255;

      const margin = Math.floor(width * 0.15);
      const isOuterBorder = (x >= margin && x < width - margin && (y === margin || y === height - margin - 1)) ||
                          (y >= margin && y < height - margin && (x === margin || x === width - margin - 1));
      
      const isTopHeader = (y >= margin + 1 && y <= margin + Math.floor(height * 0.15) && x >= margin + 1 && x < width - margin - 1);
      const isInnerContent = (y > margin + Math.floor(height * 0.15) && y < height - margin - 1 && x > margin + 1 && x < width - margin - 1);

      if (isOuterBorder) {
        r = 255; g = 255; b = 255;
      } else if (isTopHeader) {
        r = 59; g = 130; b = 246;
      } else if (isInnerContent) {
        const dotDx = nx - 0.5;
        const dotDy = ny - 0.6;
        if (dotDx * dotDx + dotDy * dotDy < 0.02) {
          r = 245; g = 158; b = 11;
        } else {
          r = Math.floor(r * 0.4);
          g = Math.floor(g * 0.4);
          b = Math.floor(b * 0.4);
        }
      }

      rawData[idx] = r;
      rawData[idx + 1] = g;
      rawData[idx + 2] = b;
      rawData[idx + 3] = a;
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  
  const ihdrChunk = makeChunk('IHDR', ihdr);

  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    scanlines[y * (width * 4 + 1)] = 0;
    rawData.copy(scanlines, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  
  const compressed = zlib.deflateSync(scanlines);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(8 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, 'ascii');
  data.copy(buf, 8);
  
  const crcVal = crc32(buf.subarray(4, 8 + len));
  buf.writeUInt32BE(crcVal, 8 + len);
  return buf;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let j = 0; j < 8; j++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

const iconsDir = path.join(process.cwd(), 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

[16, 48, 128].forEach(size => {
  const iconBuf = createPNG(size, size);
  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), iconBuf);
  console.log(`Generated icon${size}.png`);
});
