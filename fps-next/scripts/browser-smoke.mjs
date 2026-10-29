// Real Chrome smoke check: production page -> input setup -> 4-team lobby -> 3D match.
// Run after npm run build: node scripts/browser-smoke.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { C2S, S2C, PHASE, encode, decode, decodeSnapshot } from '../shared/protocol.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = process.env.CHROME_PATH ??
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = mkdtempSync(path.join(os.tmpdir(), 'arena-chrome-'));
const screenshot = process.env.SMOKE_SCREENSHOT ?? path.join(os.tmpdir(), 'arena-fps-match.png');
const children = [];
const sockets = [];
const errors = [];

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function poll(task, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await task();
      if (result) return result;
    } catch (err) { lastError = err; }
    await sleep(100);
  }
  throw lastError ?? new Error(`Timed out after ${timeoutMs}ms`);
}

function sendAndWait(socket, data, predicate, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('WebSocket reply timed out')); }, timeoutMs);
    function onMessage(raw) {
      const msg = decode(raw.toString());
      if (!predicate(msg)) return;
      cleanup();
      resolve(msg);
    }
    function cleanup() { clearTimeout(timer); socket.off('message', onMessage); }
    socket.on('message', onMessage);
    socket.send(data);
  });
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    sockets.push(socket);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

async function run() {
  assert.ok(existsSync(chromePath), `Chrome not found at ${chromePath}`);
  assert.ok(existsSync(path.join(root, 'dist', 'index.html')), 'Run npm run build first');

  const server = spawn(process.execPath, ['scripts/start.mjs'], {
    cwd: root, env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  children.push(server);
  let serverOutput = '';
  server.stdout.on('data', (data) => { serverOutput += data.toString(); });
  server.stderr.on('data', (data) => { serverOutput += data.toString(); });
  const port = await poll(() => {
    if (server.exitCode !== null) throw new Error(serverOutput);
    return Number(serverOutput.match(/arena server on :(\d+)/)?.[1] ?? 0);
  });

  const chrome = spawn(chromePath, [
    '--headless=new', '--no-first-run', '--no-default-browser-check',
    '--enable-unsafe-swiftshader', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, '--window-size=1440,900', 'about:blank',
  ], { stdio: 'ignore', windowsHide: true });
  children.push(chrome);
  const debugPort = await poll(() => {
    if (chrome.exitCode !== null) throw new Error(`Chrome exited ${chrome.exitCode}`);
    const portFile = path.join(profile, 'DevToolsActivePort');
    if (!existsSync(portFile)) return 0;
    return Number(readFileSync(portFile, 'utf8').split(/\r?\n/)[0]);
  });
  const tabs = await poll(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    return (await response.json()).find((tab) => tab.type === 'page');
  });

  const cdp = await connect(tabs.webSocketDebuggerUrl);
  let requestId = 0;
  const pending = new Map();
  cdp.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject, timer } = pending.get(msg.id);
      pending.delete(msg.id);
      clearTimeout(timer);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(msg.params.exceptionDetails?.text ?? 'Uncaught exception');
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push(msg.params.args.map((arg) => arg.value ?? arg.description).join(' '));
    }
  });
  function command(method, params = {}) {
    const id = ++requestId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP ${method} timed out`)); }, 20_000);
      pending.set(id, { resolve, reject, timer });
      cdp.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await command('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result?.value;
  }
  async function waitFor(expression) {
    return poll(() => evaluate(expression), 20_000);
  }

  await command('Page.enable');
  await command('Runtime.enable');
  await command('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  // Wait for main.js to initialise and open the calibration overlay; the static
  // markup exists before any event handlers are registered.
  await waitFor(`document.querySelector('#scheme-options .scheme-card[data-scheme="mouse"]') !== null && !document.querySelector('#scheme-picker').classList.contains('hidden')`);
  await evaluate(`document.querySelector('[data-scheme="mouse"]').click()`);
  await waitFor(`document.querySelector('#scheme-picker').classList.contains('hidden')`);
  await evaluate(`(() => { const el = document.querySelector('#nickname'); el.value = 'BrowserHost'; el.dispatchEvent(new Event('input', {bubbles:true})); document.querySelector('#mode-select').value = 'tdm'; document.querySelector('#btn-create').click(); })()`);
  let roomCode;
  try {
    roomCode = await waitFor(`!document.querySelector('#lobby').classList.contains('hidden') && document.querySelector('#lobby-code').textContent.trim().length === 4 && document.querySelector('#lobby-code').textContent.trim()`);
  } catch (error) {
    const state = await evaluate(`({menu:document.querySelector('#menu').className,lobby:document.querySelector('#lobby').className,code:document.querySelector('#lobby-code').textContent,error:document.querySelector('#menu-error').textContent,errorClass:document.querySelector('#menu-error').className,buttons:[...document.querySelectorAll('.menu-actions button')].map(x=>[x.id,x.disabled])})`);
    throw new Error(`${error.message}; UI: ${JSON.stringify(state)}; browser errors: ${errors.join('; ')}`);
  }
  await evaluate(`(() => { const el = document.querySelector('#lobby-team-count-select'); el.value='4'; el.dispatchEvent(new Event('change', {bubbles:true})); })()`);
  await waitFor(`document.querySelectorAll('#lobby-slots .slot-col').length === 4`);

  const guest = await connect(`ws://127.0.0.1:${port}/ws`);
  guest.send(encode(C2S.HELLO, { name: 'BrowserGuest' }));
  const guestJoin = await sendAndWait(guest, encode(C2S.JOIN, { code: roomCode }), (msg) => msg?.m === S2C.JOINED);
  let live = false;
  let lastSnapshot = null;
  let shotsSeen = 0;
  guest.on('message', (raw) => {
    const msg = decode(raw.toString());
    if (msg?.m === S2C.PHASE && msg.phase === PHASE.LIVE) live = true;
    if (msg?.m === S2C.SNAPSHOT) lastSnapshot = decodeSnapshot(msg);
    if (msg?.m === S2C.SHOTS) shotsSeen++;
  });
  await waitFor(`document.querySelector('#lobby-count').textContent.startsWith('2 / 16')`);
  await evaluate(`document.querySelector('#btn-start').click()`);
  await waitFor(`document.querySelector('#lobby').classList.contains('hidden') && document.querySelector('#menu').classList.contains('hidden') && document.querySelector('#game').width > 0`);
  await poll(() => live && lastSnapshot, 12_000);
  await sleep(500); // allow scene to render and models/textures to load

  // Headless Chrome may refuse pointer lock even after a CDP-dispatched click.
  // When that happens, emulate only the DOM pointer-lock state in the test page
  // so that WASD and fire still exercise the *actual* browser game loop and WS
  // server. This does not establish that native pointer lock works headfully.
  const resume = await evaluate(`(() => { const r = document.querySelector('#btn-resume').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: resume.x, y: resume.y, button: 'left', clickCount: 1 });
  await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: resume.x, y: resume.y, button: 'left', clickCount: 1 });
  const pointerLocked = await poll(() => evaluate(`document.pointerLockElement === document.querySelector('#game')`), 2_500).catch(() => false);
  let emulatedPointerLock = false;
  if (!pointerLocked) {
    emulatedPointerLock = true;
    await evaluate(`(() => {
      Object.defineProperty(document, 'pointerLockElement', {
        configurable: true, get: () => document.querySelector('#game')
      });
      document.dispatchEvent(new Event('pointerlockchange'));
    })()`);
    assert.equal(await evaluate(`document.querySelector('#pause').classList.contains('hidden')`), true,
      'Game did not resume after simulated pointer lock');
  }
  let movementMeters = null;
  let shotConfirmed = false;
  {
    const hostPosition = () => lastSnapshot?.players.find((p) => p.id !== guestJoin.you.id)?.pos;
    const before = [...hostPosition()];
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 });
    await sleep(900);
    await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 });
    await sleep(150);
    const after = hostPosition();
    movementMeters = Math.hypot(after[0] - before[0], after[2] - before[2]);
    assert.ok(movementMeters > 0.35, `Browser player did not move: ${movementMeters}m`);

    const gunX = await evaluate(`window.innerWidth / 2`);
    const gunY = await evaluate(`window.innerHeight / 2`);
    await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: gunX, y: gunY, button: 'left', clickCount: 1 });
    await sleep(300);
    await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: gunX, y: gunY, button: 'left', clickCount: 1 });
    shotConfirmed = await poll(() => shotsSeen > 0, 4_000).then(() => true).catch(() => false);
    assert.ok(shotConfirmed, 'Browser fired but the server did not broadcast the shot');
  }
  const result = await evaluate(`({canvas:[document.querySelector('#game').width,document.querySelector('#game').height],teamCols:4,room:location.hash,paused:!document.querySelector('#pause').classList.contains('hidden'),webgl:!!document.querySelector('#game').getContext('webgl2')})`);
  assert.equal(result.webgl, true, '3D WebGL context was not created');
  assert.deepEqual(errors, [], `Browser errors: ${errors.join('; ')}`);
  // Hide any pointer-lock overlay for a useful terrain screenshot. Report
  // native pointer lock separately from the test-only emulation above.
  await evaluate(`document.querySelector('#pause').classList.add('hidden')`);
  await sleep(250);
  const shot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(screenshot, Buffer.from(shot.data, 'base64'));
  console.log(JSON.stringify({ ok: true, roomCode, ...result, pointerLocked, emulatedPointerLock, movementMeters, shotConfirmed, screenshot }));
}

try {
  await run();
} catch (error) {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
} finally {
  for (const socket of sockets) socket.terminate();
  for (const child of children.reverse()) if (child.exitCode === null) child.kill();
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 3 }); } catch { /* Chrome may still be shutting down */ }
}
