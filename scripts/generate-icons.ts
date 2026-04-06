import sharp from 'sharp';
import { mkdirSync } from 'fs';

mkdirSync('public/icons', { recursive: true });

async function generateIcon(size: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="#1e1b4b"/>
    <rect x="${size * 0.06}" y="${size * 0.06}" width="${size * 0.88}" height="${size * 0.88}" rx="${size * 0.16}" fill="url(#g)"/>
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#8b5cf6"/>
    </linearGradient></defs>
    <text x="${size / 2}" y="${size * 0.4}" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="${size * 0.22}" fill="white">KN</text>
    <text x="${size / 2}" y="${size * 0.68}" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="${size * 0.15}" fill="white">NANDU</text>
  </svg>`;

  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(`public/icons/icon-${size}.png`);
  console.log(`Generated icon-${size}.png`);
}

await generateIcon(192);
await generateIcon(512);
