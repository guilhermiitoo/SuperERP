// Gera os PNGs do aplicativo a partir de public/icons/icon.svg (só para desenvolvimento).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icons/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
for (const size of [180, 192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: new URL(`../public/icons/icon-${size}.png`, import.meta.url).pathname });
  await page.close();
}
await browser.close();
console.log('ícones gerados');
