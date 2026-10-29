// Browser-level menu smoke: layout at desktop/mobile sizes and a working 1v1 room.
// Requires npm run build and Chrome; never downloads external resources.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const cwd = path.resolve(import.meta.dirname, '..');
const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const desktopShot = process.env.MENU_DESKTOP_SHOT ?? path.join(os.tmpdir(), 'arena-fps-menu-desktop.png');
const mobileShot = process.env.MENU_MOBILE_SHOT ?? path.join(os.tmpdir(), 'arena-fps-menu-mobile.png');
const profile = mkdtempSync(path.join(os.tmpdir(), 'arena-menu-'));
const children = [];
let socket;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function poll(fn, timeout = 18000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) { lastError = error; }
    await sleep(100);
  }
  throw lastError ?? new Error(`Timed out after ${timeout}ms`);
}

async function main() {
  assert.ok(existsSync(chromePath), `Chrome unavailable: ${chromePath}`);
  assert.ok(existsSync(path.join(cwd, 'dist', 'index.html')), 'Build before running menu smoke');
  const server = spawn(process.execPath, ['scripts/start.mjs'], {
    cwd, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  children.push(server);
  let serverOutput = '';
  server.stdout.on('data', (data) => { serverOutput += data.toString(); });
  server.stderr.on('data', (data) => { serverOutput += data.toString(); });
  const port = await poll(() => {
    if (server.exitCode !== null) throw new Error(serverOutput);
    return +serverOutput.match(/arena server on :(\d+)/)?.[1] || 0;
  });

  const chrome = spawn(chromePath, [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1440,900', 'about:blank',
  ], { stdio: 'ignore', windowsHide: true });
  children.push(chrome);
  const debugPort = await poll(() => {
    if (chrome.exitCode !== null) throw new Error(`Chrome exited ${chrome.exitCode}`);
    const file = path.join(profile, 'DevToolsActivePort');
    return existsSync(file) ? +readFileSync(file, 'utf8').split(/\r?\n/)[0] : 0;
  });
  const tab = await poll(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    return (await response.json()).find((entry) => entry.type === 'page');
  });
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  let sequence = 0;
  const pending = new Map();
  const errors = [];
  socket.on('message', (raw) => {
    const message = JSON.parse(String(raw));
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails?.text);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      errors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' '));
    }
    const promise = pending.get(message.id);
    if (!promise) return;
    pending.delete(message.id);
    message.error ? promise.reject(new Error(JSON.stringify(message.error))) : promise.resolve(message.result);
  });
  function call(method, params = {}) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evalJs(expression) {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result?.value;
  }
  async function capture(file) {
    const result = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(file, Buffer.from(result.data, 'base64'));
  }

  await call('Runtime.enable');
  await call('Page.enable');
  await call('Page.navigate', { url: `http://127.0.0.1:${port}` });
  await poll(() => evalJs(`document.querySelector('#scheme-options [data-scheme="mouse"]') && !document.querySelector('#scheme-picker').classList.contains('hidden')`));
  await evalJs(`document.querySelector('#scheme-options [data-scheme="mouse"]').click()`);
  await poll(() => evalJs(`document.querySelector('#scheme-picker').classList.contains('hidden')`));
  await sleep(400);

  const inspect = `(() => ({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,hero:!!document.querySelector('.strike-hero'),modes:document.querySelectorAll('[data-create-mode]').length,menuVisible:!document.querySelector('#menu').classList.contains('hidden'),buttons:[...document.querySelectorAll('[data-create-mode]')].every((el)=>el.getBoundingClientRect().width>0)}))()`;
  const desktop = await evalJs(inspect);
  assert.ok(desktop.hero && desktop.modes >= 6 && desktop.menuVisible && desktop.buttons);
  assert.equal(await evalJs(`document.querySelector('#server-state').textContent`), 'CONNECT TO PLAY');
  assert.ok(desktop.scrollWidth <= desktop.width + 2, `Desktop horizontal overflow: ${JSON.stringify(desktop)}`);
  await capture(desktopShot);

  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(300);
  const mobile = await evalJs(inspect);
  assert.ok(mobile.hero && mobile.menuVisible && mobile.buttons);
  assert.ok(mobile.scrollWidth <= mobile.width + 2, `Mobile horizontal overflow: ${JSON.stringify(mobile)}`);
  await capture(mobileShot);
  await call('Emulation.clearDeviceMetricsOverride');

  await evalJs(`(() => { document.querySelector('#nickname').value='MenuSmoke'; document.querySelector('[data-create-mode="duel"]').click(); })()`);
  const duel = await poll(() => evalJs(`(() => !document.querySelector('#lobby').classList.contains('hidden') && document.querySelector('#lobby-mode').textContent.includes('Sniper') ? {code:document.querySelector('#lobby-code').textContent,slots:document.querySelector('#lobby-count').textContent} : null)()`));
  assert.match(duel.slots, /1\s*\/\s*2/);
  assert.equal(await evalJs(`document.querySelector('#server-state').textContent`), 'SERVER CONNECTED');
  assert.deepEqual(errors, [], `Browser errors: ${errors.join('; ')}`);
  console.log(JSON.stringify({ ok: true, desktop, mobile, duel, desktopShot, mobileShot }));
}

try { await main(); }
catch (error) { console.error(error.stack ?? error.message); process.exitCode = 1; }
finally {
  socket?.terminate();
  for (const child of children.reverse()) if (child.exitCode === null) child.kill();
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 3 }); } catch { /* Chrome may be shutting down. */ }
}
