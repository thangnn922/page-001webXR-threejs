'use strict';
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-webgl', '--use-gl=swiftshader'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 600 });

  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => logs.push(`[ERROR] ${err.message}`));

  await page.goto('http://127.0.0.1:8883/test-glb.html', { waitUntil: 'networkidle0', timeout: 15000 });

  // Wait for GLB to load (log text changes from "Loading" to something else)
  await page.waitForFunction(
    () => !document.getElementById('log')?.textContent.startsWith('Loading'),
    { timeout: 10000 }
  ).catch(() => {});

  // Extra frame time for Three.js to render
  await new Promise(r => setTimeout(r, 1000));

  const logText = await page.$eval('#log', el => el.textContent);
  console.log('=== Page Log ===\n' + logText);
  console.log('\n=== Console ===');
  logs.forEach(l => console.log(l));

  await page.screenshot({ path: 'tools/glb-preview.png', fullPage: false });
  console.log('\n✅ Screenshot: tools/glb-preview.png');

  await browser.close();
})().catch(err => { console.error('Puppeteer error:', err.message); process.exit(1); });
