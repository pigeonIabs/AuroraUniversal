// Capture live websites in an isolated, signed-out Firefox profile.
const { firefox } = require('playwright');
const { mkdir, readFile, writeFile, access } = require('node:fs/promises');
const { resolve } = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const root = resolve(__dirname, '../..');
const media = resolve(root, 'release/media');
const takeDirectory = resolve(root, 'work/live-release-' + Date.now());
const run = promisify(execFile);
const sleep = milliseconds => new Promise(done => setTimeout(done, milliseconds));

async function addCursor(page) {
  await page.evaluate(() => {
    const cursor = document.createElement('div');
    cursor.id = 'aurora-recording-cursor';
    cursor.setAttribute('aria-hidden', 'true');
    cursor.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;width:27px;height:34px;transform:translate(1010px,720px);filter:drop-shadow(1px 2px 2px #0005)';
    cursor.innerHTML = '<svg viewBox="0 0 28 34" width="27" height="34"><path d="M3 2v25l6-6 5 11 5-2-5-10h9Z" fill="white" stroke="#242636" stroke-width="1.4"/></svg>';
    document.documentElement.appendChild(cursor);
    document.addEventListener('mousemove', event => cursor.style.transform = `translate(${event.clientX}px,${event.clientY}px)`, { passive: true });
  });
}

async function glide(page, from, to, seconds = 1) {
  const steps = Math.round(seconds * 30);
  for (let step = 1; step <= steps; step++) {
    const progress = step / steps;
    const eased = progress * progress * (3 - 2 * progress);
    await page.mouse.move(from.x + (to.x - from.x) * eased, from.y + (to.y - from.y) * eased);
    await sleep(1000 / 30);
  }
  return to;
}

async function center(locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('The native capture control is not visible');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function still(page, name) {
  await page.locator('#aurora-recording-cursor').evaluate(node => node.style.visibility = 'hidden');
  await page.screenshot({ path: resolve(media, `aurora-universal-${name}.png`), scale: 'device' });
  await page.locator('#aurora-recording-cursor').evaluate(node => node.style.visibility = '');
  console.log(`Captured the real ${name} view`);
}

async function recordSite(context, name, url, modelName) {
  const page = await context.newPage();
  const started = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('#cgpt-qs-btn').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: name === 'qwen' ? 'Log in' : 'Sign in', exact: true }).or(page.getByRole('link', { name: 'Sign in', exact: true })).first().waitFor({ state: 'visible' });
  if (name === 'grok') {
    const reject = page.getByRole('button', { name: 'Reject All', exact: true });
    await reject.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
    if (await reject.isVisible()) await reject.click();
  }
  await sleep(2500);
  await addCursor(page);
  const ready = (Date.now() - started) / 1000;
  const events = [];
  let pointer = { x: 1010, y: 720 };
  await page.mouse.move(pointer.x, pointer.y);
  await sleep(2200);
  await still(page, name === 'qwen' ? 'cover' : 'grok');
  const model = page.getByRole('button', { name: modelName, exact: true });
  pointer = await glide(page, pointer, await center(model), 1.2);
  await model.click();
  events.push({ time: (Date.now() - started) / 1000, action: 'Native model menu', point: pointer });
  await sleep(1700);
  await still(page, `${name}-models`);
  await page.keyboard.press('Escape');
  await page.mouse.click(1000, 300);
  const quick = page.locator('#cgpt-qs-btn');
  pointer = await glide(page, pointer, await center(quick), 1.4);
  await quick.click();
  events.push({ time: (Date.now() - started) / 1000, action: 'Aurora quick settings', point: pointer });
  await sleep(1300);
  await still(page, `${name}-settings`);
  const dimmed = page.getByRole('button', { name: 'Dimmed', exact: true });
  pointer = await glide(page, pointer, await center(dimmed), .8);
  await dimmed.click();
  events.push({ time: (Date.now() - started) / 1000, action: 'Dimmed glass', point: pointer });
  await sleep(1500);
  const clear = page.getByRole('button', { name: 'Clear', exact: true });
  pointer = await glide(page, pointer, await center(clear), .7);
  await clear.click();
  await sleep(800);
  await page.keyboard.press('Escape');
  pointer = await glide(page, pointer, {x:1100,y:750},1);
  await sleep(2000);
  const ended = (Date.now() - started) / 1000;
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, pixelRatio: devicePixelRatio }));
  const video = page.video();
  await page.close();
  const path = await video.path();
  return { name, url, signedOut: true, start: ready, end: ended, viewport, video: path, events };
}

async function main() {
  await Promise.all([mkdir(media, { recursive: true }), mkdir(takeDirectory, { recursive: true })]);
  const profile = resolve(root, 'work/live-promo-profile');
  const initialized = await access(resolve(profile, 'prefs.js')).then(() => true, () => false);
  if (!initialized) {
    const firstLaunch = await firefox.launchPersistentContext(profile, { headless: true });
    await firstLaunch.close();
  }
  const context = await firefox.launchPersistentContext(profile, {
    headless: true, viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2,
    args: ['--marionette', '--remote-allow-system-access'],
    firefoxUserPrefs: { 'marionette.port': 2830 },
    recordVideo: { dir: resolve(takeDirectory, 'video'), size: { width: 1920, height: 1080 } }
  });
  try {
    await context.clearCookies();
    const receiptPath = resolve(takeDirectory, 'addon.json');
    const installed = await run('python', [resolve(__dirname, 'install_addon.py'), '--receipt', receiptPath], { windowsHide: true });
    console.log(installed.stdout.trim());
    const addon = JSON.parse(await readFile(receiptPath, 'utf8'));
    if (!addon.active) throw new Error('Aurora is not active in the capture browser');
    const takes = [];
    takes.push(await recordSite(context, 'qwen', 'https://chat.qwen.ai/', 'Select Model'));
    takes.push(await recordSite(context, 'grok', 'https://grok.com/', 'Model: Fast'));
    const manifest = { addon, profile: 'Isolated signed-out capture profile', capturedAt: new Date().toISOString(), promptsSubmitted: false, takes };
    await writeFile(resolve(root, 'work/live-release-capture.json'), JSON.stringify(manifest, null, 2));
    console.log('Finished recording both live signed-out websites');
  } finally {
    await context.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
