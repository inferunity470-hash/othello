#!/usr/bin/env node
import sharp from 'sharp';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const ICON_SRC = 'public/icon.svg';
const RESOURCES_DIR = 'resources';

const iconSvgRaw = await readFile(ICON_SRC, 'utf8');

const appIconSvg = iconSvgRaw
  .replace('rx="96"', 'rx="0"')
  .replace('<svg ', '<svg ');

const splashSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2732 2732" width="2732" height="2732">
  <rect width="2732" height="2732" fill="#0b1d2a"/>
  <g transform="translate(866, 866)">
    <svg viewBox="0 0 512 512" width="1000" height="1000">
      <defs>
        <radialGradient id="bg" cx="0.5" cy="0.4" r="0.7">
          <stop offset="0%" stop-color="#2d8f48"/>
          <stop offset="80%" stop-color="#1c5d2c"/>
        </radialGradient>
        <radialGradient id="black" cx="0.35" cy="0.3" r="0.7">
          <stop offset="0%" stop-color="#5a5a5a"/>
          <stop offset="60%" stop-color="#1a1a1a"/>
          <stop offset="100%" stop-color="#000"/>
        </radialGradient>
        <radialGradient id="white" cx="0.35" cy="0.3" r="0.7">
          <stop offset="0%" stop-color="#fff"/>
          <stop offset="60%" stop-color="#dcdcdc"/>
          <stop offset="100%" stop-color="#a5a5a5"/>
        </radialGradient>
      </defs>
      <rect width="512" height="512" rx="96" fill="url(#bg)"/>
      <circle cx="180" cy="280" r="120" fill="url(#black)"/>
      <circle cx="332" cy="280" r="120" fill="url(#white)"/>
      <text x="256" y="120" font-family="ui-sans-serif, system-ui" font-size="72" font-weight="800" text-anchor="middle" fill="#f5b041">¥</text>
    </svg>
  </g>
</svg>`;

await mkdir(RESOURCES_DIR, { recursive: true });

await sharp(Buffer.from(appIconSvg))
  .resize(1024, 1024)
  .flatten({ background: '#1c5d2c' })
  .png()
  .toFile(path.join(RESOURCES_DIR, 'icon.png'));

await sharp(Buffer.from(splashSvg))
  .resize(2732, 2732)
  .flatten({ background: '#0b1d2a' })
  .png()
  .toFile(path.join(RESOURCES_DIR, 'splash.png'));

await sharp(Buffer.from(splashSvg.replace('#0b1d2a', '#0b1d2a')))
  .resize(2732, 2732)
  .flatten({ background: '#0b1d2a' })
  .png()
  .toFile(path.join(RESOURCES_DIR, 'splash-dark.png'));

console.log('Generated:');
console.log('  resources/icon.png       (1024x1024)');
console.log('  resources/splash.png     (2732x2732)');
console.log('  resources/splash-dark.png (2732x2732)');
console.log('\nNext: npx capacitor-assets generate --ios');
