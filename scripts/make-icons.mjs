// Generates PWA icons from an inline SVG: the Fate Direct
// four-point star in silver over a frost aurora on midnight.
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';

const svg = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="aurora" cx="30%" cy="8%" r="90%">
      <stop offset="0%" stop-color="#4E8FAC" stop-opacity="0.55"/>
      <stop offset="45%" stop-color="#2A2A52" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#0D0E22" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="star" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#E9E7F4"/>
      <stop offset="100%" stop-color="#9BD7E8"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="#0D0E22"/>
  <rect width="512" height="512" fill="url(#aurora)"/>
  <!-- thread of fate -->
  <path d="M40 ${396 - pad} C 160 ${340 - pad}, 352 ${452 - pad}, 472 ${396 - pad}"
        fill="none" stroke="#C23A52" stroke-width="7" stroke-linecap="round" opacity="0.95"/>
  <!-- four-point star -->
  <path d="M256 ${86 + pad}
           C 266 ${186 + pad}, 276 ${196 + pad}, 376 206
           C 276 216, 266 226, 256 ${326 - pad}
           C 246 226, 236 216, 136 206
           C 236 196, 246 ${186 + pad}, 256 ${86 + pad} Z"
        fill="url(#star)"/>
  <circle cx="118" cy="118" r="5" fill="#CDD4E0" opacity="0.9"/>
  <circle cx="404" cy="96" r="3.5" fill="#CDD4E0" opacity="0.7"/>
  <circle cx="430" cy="300" r="4" fill="#CDD4E0" opacity="0.6"/>
  <circle cx="86" cy="330" r="3" fill="#CDD4E0" opacity="0.7"/>
</svg>`;

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/star.svg', svg(0));

await sharp(Buffer.from(svg(0))).resize(192, 192).png().toFile('public/icons/icon-192.png');
await sharp(Buffer.from(svg(0))).resize(512, 512).png().toFile('public/icons/icon-512.png');
// maskable: content pulled inward so OS-level masks don't clip it
await sharp(Buffer.from(svg(58))).resize(512, 512).png().toFile('public/icons/icon-maskable-512.png');

console.log('Icons written to public/icons/');
