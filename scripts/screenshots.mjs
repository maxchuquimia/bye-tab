// Takes the README and store screenshots at 1280x800, the size both the Chrome Web Store
// and Firefox Add-ons ask for. Needs `npm install` and `npx playwright install chromium`.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const extension = join(root, 'dist', 'chrome');
const out = join(root, 'screenshots');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const meetingUrl = 'https://meet.example.com/launch/8214-5520';
const settings = {
  enabled: true,
  pauseWhenHidden: false,
  seconds: 5,
  patterns: ['meet.example.com/launch/*', '*://*.example.org/signed-out*', '*/oauth/callback*'],
};

// A made up meeting launch page for the countdown to sit on.
const meetingPage = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Acme Meet</title>
    <style>
      body { margin: 0; font: 15px/1.5 system-ui, -apple-system, sans-serif; color: #1f1f24; background: #f4f5f7; }
      header { display: flex; align-items: center; gap: 12px; height: 54px; padding: 0 28px; background: #fff; border-bottom: 1px solid #e3e4e8; }
      .logo { width: 26px; height: 26px; border-radius: 7px; background: #3d6ef5; }
      .brand { font-size: 17px; font-weight: 700; }
      main { text-align: center; padding-top: 88px; }
      h1 { font-size: 26px; margin: 0 0 14px; }
      p { margin: 0 0 24px; color: #5b5d66; }
      .launch { display: inline-block; padding: 11px 22px; border-radius: 8px; background: #3d6ef5; color: #fff; font-weight: 600; }
      .fallback { margin-top: 26px; font-size: 13px; color: #7a7c85; }
      .fallback a { color: #3d6ef5; text-decoration: none; }
    </style>
  </head>
  <body>
    <header><div class="logo"></div><div class="brand">Acme Meet</div></header>
    <main>
      <h1>Opening Acme Meet&hellip;</h1>
      <p>Your meeting should have opened in the Acme Meet app. You can close this tab.</p>
      <span class="launch">Launch meeting</span>
      <div class="fallback">Nothing happened? <a href="#">Join from your browser</a></div>
    </main>
  </body>
</html>`;

execFileSync('node', [join(root, 'scripts', 'build.mjs'), 'chrome'], { stdio: 'inherit' });

const profile = mkdtempSync(join(tmpdir(), 'bye-tab-screenshots-'));

// Each shot gets its own launch so it can use its own viewport and scale. The profile
// is shared, so settings saved in the first launch carry over.
async function withBrowser(viewport, deviceScaleFactor, run) {
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    viewport,
    deviceScaleFactor,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await run(context, worker, new URL(worker.url()).host);
  } finally {
    await context.close();
  }
}

try {
  // Countdown: 800x500 at 1.6x, with a long timer so the bar sits part way along.
  await withBrowser({ width: 800, height: 500 }, 1.6, async (context, worker) => {
    await worker.evaluate((values) => chrome.storage.sync.set(values), { ...settings, seconds: 10 });
    const page = await context.newPage();
    await page.route(meetingUrl, (route) => route.fulfill({ contentType: 'text/html', body: meetingPage }));
    await page.goto(meetingUrl);
    await sleep(4000);
    await page.screenshot({ path: join(out, 'countdown.png') });
  });

  // Settings: the page is taller, so render 1440x900 and scale it down to 1280x800.
  await withBrowser({ width: 1440, height: 900 }, 1280 / 1440, async (context, worker, extensionId) => {
    await worker.evaluate((values) => chrome.storage.sync.set(values), settings);
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await page.waitForSelector('#patterns input');
    await page.fill('#testUrl', meetingUrl);
    await page.screenshot({ path: join(out, 'settings.png') });
  });
} finally {
  rmSync(profile, { recursive: true, force: true });
}

console.log(`Saved screenshots to ${out}`);
