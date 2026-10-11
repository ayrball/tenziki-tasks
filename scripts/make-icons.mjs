// Generates the PNG app icons from the brand mark. Run: node scripts/make-icons.mjs
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const gradient = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b4cf5"/><stop offset="1" stop-color="#a14bf0"/></linearGradient></defs>`;
const check = (scale) =>
  `<g transform="translate(50 50) scale(${scale}) translate(-50 -50)"><path d="M28 52L43 67L73 34" stroke="white" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" fill="none"/></g>`;

// Rounded tile (browsers, iOS, "any" purpose)
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${gradient}<rect width="100" height="100" rx="22" fill="url(#g)"/>${check(1)}</svg>`;
// Full-bleed with the mark inside the safe zone (Android adaptive/maskable icons crop the corners)
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${gradient}<rect width="100" height="100" fill="url(#g)"/>${check(0.7)}</svg>`;
// iOS draws its own rounded corners, so it wants a full square
const apple = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${gradient}<rect width="100" height="100" fill="url(#g)"/>${check(0.85)}</svg>`;

const jobs = [
  ['public/icons/icon-192.png', rounded, 192],
  ['public/icons/icon-512.png', rounded, 512],
  ['public/icons/maskable-512.png', maskable, 512],
  ['public/icons/apple-touch-icon.png', apple, 180],
];
for (const [file, svg, size] of jobs) {
  await sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png().toFile(file);
  console.log('wrote', file);
}
// Keep the SVG favicon on the same colours
writeFileSync(
  'public/favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">${gradient}<rect width="100" height="100" rx="28" fill="url(#g)"/><path d="M28 52L43 67L73 34" stroke="white" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></svg>\n`
);
console.log('wrote public/favicon.svg');
