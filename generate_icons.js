const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPNG(width, height, getPixelRGBA) {
  // Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // 8-bit depth
  ihdrData.writeUInt8(6, 9); // RGBA color type
  ihdrData.writeUInt8(0, 10); // Compression
  ihdrData.writeUInt8(0, 11); // Filter
  ihdrData.writeUInt8(0, 12); // Interlace
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // Scanlines with filter byte 0
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;
  for (let y = 0; y < height; y++) {
    scanlines.writeUInt8(0, offset++); // Filter byte 0 (None)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixelRGBA(x, y, width, height);
      scanlines.writeUInt8(r, offset++);
      scanlines.writeUInt8(g, offset++);
      scanlines.writeUInt8(b, offset++);
      scanlines.writeUInt8(a, offset++);
    }
  }

  const idatData = zlib.deflateSync(scanlines);
  const idatChunk = makeChunk('IDAT', idatData);

  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(8 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const crc = crc32(chunk.subarray(4, 8 + len));
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

// Standard CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function drawIconPixel(x, y, w, h) {
  // Normalize to 0..1
  const nx = x / w;
  const ny = y / h;
  const cx = 0.5;
  const cy = 0.5;

  // Rounded rectangle background
  const cornerR = 0.22;
  const dx = Math.max(0, Math.abs(nx - cx) - (0.5 - cornerR));
  const dy = Math.max(0, Math.abs(ny - cy) - (0.5 - cornerR));
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > cornerR) {
    return [0, 0, 0, 0]; // Transparent outside
  }

  // Smooth antialiasing edge
  const edgeAlpha = Math.min(1, Math.max(0, (cornerR - dist) * w));

  // Gradient background: Electric Indigo #6366F1 to Cyan #06B6D4
  const bgR = Math.round(99 + (6 - 99) * ((nx + ny) / 2));
  const bgG = Math.round(102 + (182 - 102) * ((nx + ny) / 2));
  const bgB = Math.round(241 + (212 - 241) * ((nx + ny) / 2));

  // Clipboard icon shape
  // Main board: x from 0.25 to 0.75, y from 0.28 to 0.82
  const inBoard = nx >= 0.26 && nx <= 0.74 && ny >= 0.28 && ny <= 0.82;
  // Clip top: x from 0.38 to 0.62, y from 0.18 to 0.32
  const inClip = nx >= 0.38 && nx <= 0.62 && ny >= 0.18 && ny <= 0.32;
  // Inner white paper
  const inPaper = nx >= 0.32 && nx <= 0.68 && ny >= 0.36 && ny <= 0.74;

  // Text lines on paper
  const isLine1 = inPaper && ny >= 0.44 && ny <= 0.48 && nx >= 0.38 && nx <= 0.62;
  const isLine2 = inPaper && ny >= 0.52 && ny <= 0.56 && nx >= 0.38 && nx <= 0.58;
  const isLine3 = inPaper && ny >= 0.60 && ny <= 0.64 && nx >= 0.38 && nx <= 0.50;

  if (isLine1 || isLine2 || isLine3) {
    return [99, 102, 241, Math.round(255 * edgeAlpha)];
  }
  if (inPaper) {
    return [255, 255, 255, Math.round(255 * edgeAlpha)];
  }
  if (inClip) {
    return [224, 231, 255, Math.round(255 * edgeAlpha)];
  }
  if (inBoard) {
    return [49, 46, 129, Math.round(255 * edgeAlpha)];
  }

  return [bgR, bgG, bgB, Math.round(255 * edgeAlpha)];
}

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

[16, 48, 128].forEach(size => {
  const buf = createPNG(size, size, drawIconPixel);
  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), buf);
  console.log(`Created icon${size}.png`);
});
