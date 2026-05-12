import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [inputDir, outputDir, expectedFramesArg] = process.argv.slice(2);
const expectedFrames = Number.parseInt(expectedFramesArg || '121', 10);

if (!inputDir || !outputDir || !Number.isFinite(expectedFrames)) {
  console.error('Usage: node stabilize_frames.mjs <inputDir> <outputDir> [expectedFrames]');
  process.exit(2);
}

const ALPHA_THRESHOLD = 24;

function inIgnoredCorner(x, y) {
  return (x < 110 && y < 90) || (x > 520 && y > 530);
}

function centerFromPixels(data, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      if (inIgnoredCorner(x, y)) {
        data[offset + 3] = 0;
        continue;
      }

      if (data[offset + 3] > ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) {
    throw new Error('No foreground pixels found');
  }

  return {
    x: Math.round((minX + maxX) / 2),
    y: Math.round((minY + maxY) / 2),
  };
}

async function shiftFrame(sourceBuffer, width, height, dx, dy) {
  const sourceLeft = Math.max(0, -dx);
  const sourceTop = Math.max(0, -dy);
  const outputLeft = Math.max(0, dx);
  const outputTop = Math.max(0, dy);
  const cropWidth = width - Math.abs(dx);
  const cropHeight = height - Math.abs(dy);

  const cropped = await sharp(sourceBuffer, {
    raw: { width, height, channels: 4 },
  })
    .extract({
      left: sourceLeft,
      top: sourceTop,
      width: cropWidth,
      height: cropHeight,
    })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: cropped, left: outputLeft, top: outputTop }])
    .png()
    .toBuffer();
}

const entries = (await fs.readdir(inputDir))
  .filter((name) => name.endsWith('.png'))
  .sort()
  .slice(0, expectedFrames);

if (entries.length !== expectedFrames) {
  throw new Error(`Expected ${expectedFrames} frames, found ${entries.length}`);
}

await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });

const frames = [];
for (const name of entries) {
  const file = path.join(inputDir, name);
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mutable = Buffer.from(data);
  const center = centerFromPixels(mutable, info.width, info.height);
  frames.push({ name, data: mutable, info, center });
}

const target = frames[0].center;
const beforeX = frames.map((frame) => frame.center.x);
const beforeY = frames.map((frame) => frame.center.y);

for (let i = 0; i < frames.length; i++) {
  const frame = frames[i];
  const dx = target.x - frame.center.x;
  const dy = target.y - frame.center.y;
  const output = await shiftFrame(frame.data, frame.info.width, frame.info.height, dx, dy);
  await fs.writeFile(path.join(outputDir, `frame_${String(i + 1).padStart(3, '0')}.png`), output);
}

console.log(JSON.stringify({
  frames: frames.length,
  target,
  before: {
    x: [Math.min(...beforeX), Math.max(...beforeX)],
    y: [Math.min(...beforeY), Math.max(...beforeY)],
  },
}, null, 2));
