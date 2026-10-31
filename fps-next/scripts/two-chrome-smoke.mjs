// Two *independent* Chrome renderers and two real browser clients in one TDM room.
// Build with VITE_VISUAL_DIAGNOSTICS=1 before using this script.
// DUAL_BENCH_MS=60000 npm run smoke:dual  (PowerShell: $env:DUAL_BENCH_MS='60000')
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { S2C, PHASE, FLAG, decodeSnapshot } from '../shared/protocol.js';
import { ALL_WEAPON_IDS } from '../shared/weapons.js';
import { SOURCE_WEAPON_RIGS } from '../client/src/sourceWeaponRig.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const durationMs = Number(process.env.DUAL_BENCH_MS ?? 60000);
const width = Number(process.env.DUAL_WIDTH ?? 1280);
const height = Number(process.env.DUAL_HEIGHT ?? 720);
const deviceScaleFactor = Number(process.env.DUAL_DPR ?? 1);
const quality = process.env.DUAL_QUALITY ?? 'auto';
const requireGpu = process.env.DUAL_REQUIRE_GPU === '1';
const captureScreenshots = process.env.DUAL_CAPTURE_SCREENSHOTS === '1';
const captureArsenal = process.env.DUAL_CAPTURE_ARSENAL === '1';
const captureReload = process.env.DUAL_CAPTURE_RELOAD === '1';
const collectGpuTelemetry = process.env.DUAL_GPU_TELEMETRY === '1';
const mapId = process.env.DUAL_MAP ?? 'courtyard';
// User-supplied, non-identifying label to distinguish different computers
// with identical GPU renderer strings in a cross-machine benchmark.
const machineLabel = process.env.DUAL_MACHINE_LABEL || null;
const reportDir = path.resolve(root, process.env.DUAL_REPORT_DIR ?? 'docs/benchmarks');
assert.ok(machineLabel === null || /^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/.test(machineLabel),
  'DUAL_MACHINE_LABEL must be 1..40 letters, digits, dots, underscores or hyphens');
assert.ok(!captureArsenal || captureScreenshots,
  'Set DUAL_CAPTURE_SCREENSHOTS=1 when using DUAL_CAPTURE_ARSENAL=1');
assert.ok(!captureReload || captureArsenal,
  'Set DUAL_CAPTURE_ARSENAL=1 when using DUAL_CAPTURE_RELOAD=1');
assert.ok(Number.isInteger(durationMs) && durationMs >= 2000 && durationMs <= 600000,
  'DUAL_BENCH_MS must be 2000..600000');
assert.ok(Number.isInteger(width) && width >= 640 && width <= 3840 &&
  Number.isInteger(height) && height >= 480 && height <= 2160, 'Invalid DUAL_WIDTH/DUAL_HEIGHT');
assert.ok(Number.isFinite(deviceScaleFactor) && deviceScaleFactor >= 1 && deviceScaleFactor <= 2,
  'DUAL_DPR must be within 1..2');
assert.ok(['auto', 'low', 'medium', 'high'].includes(quality),
  'DUAL_QUALITY must be auto, low, medium, or high');
assert.ok(existsSync(chromePath), `Chrome missing: ${chromePath}`);
assert.ok(existsSync(path.join(root, 'dist', 'index.html')), 'Run npm run build before smoke:dual');
const children = [];
const profiles = [];
const clients = [];
let serverOutput = '';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

// Host-wide NVIDIA telemetry is optional: it includes other GPU consumers and
// cannot assign VRAM or watts to either Chrome process. Unsupported GPU vendors
// still get browser-renderer/rAF benchmark data without a fatal dependency.
async function gpuSnapshot() {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const probe = spawn('nvidia-smi', [
      '--query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw',
      '--format=csv,noheader,nounits',
    ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    probe.stdout.on('data', (part) => { stdout += part.toString(); });
    probe.stderr.on('data', (part) => { stderr += part.toString(); });
    probe.on('error', (error) => resolve({ error: error.message }));
    probe.on('close', (exitCode) => {
      if (exitCode !== 0) {
        resolve({ error: `nvidia-smi exited ${exitCode}: ${stderr.slice(0, 300)}` });
        return;
      }
      const fields = stdout.trim().split(/\r?\n/).filter(Boolean).map((row) =>
        row.split(',').map((value) => value.trim()));
      const metric = (value) => value && value !== '[N/A]' &&
        Number.isFinite(Number(value)) ? Number(value) : null;
      resolve({ devices: fields.map(([index, name, utilization, memoryUsed,
        memoryTotal, temperature, power]) => ({
        index: metric(index), name, utilizationPercent: metric(utilization),
        memoryUsedMiB: metric(memoryUsed), memoryTotalMiB: metric(memoryTotal),
        temperatureC: metric(temperature), powerW: metric(power),
      })) });
    });
  });
}

function startGpuTelemetry() {
  if (!collectGpuTelemetry) return { stop: async () => null };
  const started = Date.now();
  const samples = [];
  let pending = null;
  const tick = () => {
    if (pending) return;
    pending = gpuSnapshot();
    void pending.then((snapshot) => {
      samples.push({ elapsedMs: Date.now() - started, ...snapshot });
    }).finally(() => { pending = null; });
  };
  tick();
  const timer = setInterval(tick, 5000);
  return {
    stop: async () => {
      clearInterval(timer);
      if (pending) await pending;
      return { provider: 'nvidia-smi', sampleIntervalMs: 5000,
        scope: 'host-wide; includes unrelated GPU processes', samples };
    },
  };
}

async function poll(task, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await task();
      if (value) return value;
    } catch (error) { lastError = error; }
    await sleep(100);
  }
  throw lastError ?? new Error(`Timed out after ${timeoutMs}ms`);
}

async function startChromeProcess(name) {
  // Windows Crashpad can fail to bind its pipe when two fresh headless Chrome
  // processes start together. Retry only that known, transient startup failure.
  for (let attempt = 1; attempt <= 3; attempt++) {
    const profile = mkdtempSync(path.join(os.tmpdir(), `crownstrike-${name}-`));
    profiles.push(profile);
    let launchErrors = '';
    let spawnError = null;
    const processHandle = spawn(chromePath, [
      '--headless=new', '--no-first-run', '--no-default-browser-check',
      '--enable-logging=stderr',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows', '--remote-debugging-port=0',
      `--user-data-dir=${profile}`, `--window-size=${width},${height}`, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    processHandle.on('error', (error) => { spawnError = error; });
    processHandle.stderr?.on('data', (data) => {
      launchErrors = (launchErrors + data.toString()).slice(-4000);
    });
    children.push(processHandle);
    try {
      const debugPort = await poll(() => {
        if (spawnError) throw spawnError;
        if (processHandle.exitCode !== null) throw new Error(
          `${name} Chrome exited ${processHandle.exitCode}: ${launchErrors}`);
        const portFile = path.join(profile, 'DevToolsActivePort');
        return existsSync(portFile) ? Number(readFileSync(portFile, 'utf8').split(/\r?\n/)[0]) : 0;
      });
      return { profile, processHandle, debugPort };
    } catch (error) {
      if (processHandle.exitCode === null) processHandle.kill();
      const crashpadFailure = /Crashpad|crashpad|TransactNamedPipe|crash server/i
        .test(`${error.message}\n${launchErrors}`);
      if (!crashpadFailure || attempt === 3) throw error;
      console.warn(`${name}: Chrome Crashpad startup failed (attempt ${attempt}/3); retrying`);
      await sleep(500 * attempt);
    }
  }
  throw new Error(`${name}: Chrome failed to start`);
}

async function launchBrowser(name, url) {
  const { profile, processHandle, debugPort } = await startChromeProcess(name);
  const tab = await poll(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    return (await response.json()).find((item) => item.type === 'page');
  });
  assert.ok(tab?.webSocketDebuggerUrl, `${name} has no CDP page`);
  const socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  const client = {
    name, pid: processHandle.pid, profile, debugPort, socket, errors: [], warnings: [],
    frames: 0, shots: 0, reloads: 0, joined: null, live: false, snapshot: null, remoteCount: 0,
    requestId: 0, pending: new Map(),
  };
  clients.push(client);
  socket.on('message', (raw) => {
    let event;
    try { event = JSON.parse(raw.toString()); } catch { return; }
    if (event.id && client.pending.has(event.id)) {
      const { resolve, reject, timeout } = client.pending.get(event.id);
      client.pending.delete(event.id);
      clearTimeout(timeout);
      event.error ? reject(new Error(JSON.stringify(event.error))) : resolve(event.result);
    }
    if (event.method === 'Runtime.exceptionThrown') {
      client.errors.push(event.params.exceptionDetails?.exception?.description ??
        event.params.exceptionDetails?.text ?? 'Uncaught exception');
    }
    if (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') {
      client.errors.push(event.params.args.map((arg) => arg.value ?? arg.description).join(' '));
    }
    if (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'warning') {
      client.warnings.push(event.params.args.map((arg) => arg.value ?? arg.description).join(' '));
    }
    if (event.method === 'Network.webSocketFrameReceived') {
      const payload = event.params?.response?.payloadData;
      if (!payload) return;
      let msg;
      try { msg = JSON.parse(payload); } catch { return; }
      if (msg.m === S2C.JOINED) client.joined = msg;
      if (msg.m === S2C.PHASE && msg.phase === PHASE.LIVE) client.live = true;
      if (msg.m === S2C.SHOTS) client.shots++;
      if (msg.m === S2C.RELOAD) client.reloads++;
      if (msg.m === S2C.SNAPSHOT) {
        client.frames++;
        try {
          client.snapshot = decodeSnapshot(msg);
          client.remoteCount = Math.max(0, (client.snapshot?.players?.length ?? 0) - 1);
        } catch (error) { client.errors.push(`Invalid snapshot: ${error.message}`); }
      }
    }
  });
  client.command = (method, params = {}, timeoutMs = 25000) => new Promise((resolve, reject) => {
    const id = ++client.requestId;
    const timeout = setTimeout(() => {
      client.pending.delete(id);
      reject(new Error(`${name}: CDP ${method} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    client.pending.set(id, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id, method, params }));
  });
  client.eval = async (expression, timeoutMs = 25000) => {
    const result = await client.command('Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true }, timeoutMs);
    if (result.exceptionDetails) throw new Error(
      `${name}: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
    return result.result?.value;
  };
  client.wait = (expression, ms = 25000) => poll(() => client.eval(expression), ms);
  await client.command('Page.enable');
  await client.command('Runtime.enable');
  await client.command('Network.enable');
  await client.command('Emulation.setDeviceMetricsOverride',
    { width, height, deviceScaleFactor, mobile: false });
  await client.command('Page.navigate', { url });
  await client.wait(`document.querySelector('[data-scheme="mouse"]') &&
    !document.querySelector('#scheme-picker').classList.contains('hidden')`);
  await client.eval(`document.querySelector('[data-scheme="mouse"]').click()`);
  await client.wait(`document.querySelector('#scheme-picker').classList.contains('hidden')`);
  return client;
}

async function unlockControls(client) {
  // Native pointer lock can be denied in headless Chrome; emulate the DOM state
  // solely for this automated input smoke. Gameplay still runs in a real Chrome.
  await client.eval(`(() => {
    document.activeElement?.blur();
    if (document.pointerLockElement === document.querySelector('#game')) return;
    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true, get: () => document.querySelector('#game')
    });
    document.dispatchEvent(new Event('pointerlockchange'));
  })()`);
  await client.wait(`document.querySelector('#pause').classList.contains('hidden')`);
}

async function inputKey(client, key, ms) {
  const code = `Key${key.toUpperCase()}`;
  const windowsVirtualKeyCode = key.toUpperCase().charCodeAt(0);
  await client.command('Input.dispatchKeyEvent',
    { type: 'keyDown', key, code, windowsVirtualKeyCode });
  await sleep(ms);
  await client.command('Input.dispatchKeyEvent',
    { type: 'keyUp', key, code, windowsVirtualKeyCode });
}

async function verifyMovementAndShot(client, observer) {
  const id = client.joined?.you?.id;
  assert.ok(id, `${client.name}: missing browser JOINED message`);
  const position = () => client.snapshot?.players?.find((player) => player.id === id)?.pos;
  const before = position();
  assert.ok(before, `${client.name}: own player missing from server snapshot`);
  await inputKey(client, 'w', 850);
  await sleep(300);
  const after = position();
  assert.ok(after, `${client.name}: own player disappeared from server snapshot`);
  const movedMeters = Math.hypot(after[0] - before[0], after[2] - before[2]);
  assert.ok(movedMeters > 0.25, `${client.name}: no authoritative movement (${movedMeters}m)`);
  // Verify the other browser actually receives the crouch flag from the server.
  await client.command('Input.dispatchKeyEvent',
    { type: 'keyDown', key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67 });
  try {
    await poll(() => {
      const remote = observer.snapshot?.players?.find((player) => player.id === id);
      return remote && (remote.flags & FLAG.CROUCH) !== 0;
    }, 3500);
  } finally {
    await client.command('Input.dispatchKeyEvent',
      { type: 'keyUp', key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67 });
  }
  // The server broadcasts shots to *other* peers; the shooter will not see its
  // own shot echoed back over WebSocket.
  const beforeShots = observer.shots;
  await client.command('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: width / 2, y: height / 2, button: 'left', clickCount: 1,
  });
  await sleep(350);
  await client.command('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: width / 2, y: height / 2, button: 'left', clickCount: 1,
  });
  await poll(() => observer.shots > beforeShots, 6000);
  const beforeReloads = observer.reloads;
  await inputKey(client, 'r', 120);
  await poll(() => observer.reloads > beforeReloads, 6000);
  return { movedMeters: Math.round(movedMeters * 100) / 100,
    crouchFlagSeenByOtherChrome: true,
    shotsSeenByOtherChrome: observer.shots - beforeShots,
    reloadEventsSeenByOtherChrome: observer.reloads - beforeReloads };
}

const benchExpression = `(async () => {
  const d = window.__arenaVisualDebug;
  if (!d?.renderDiagnostics || !d?.remotes)
    throw new Error('Benchmark requires VITE_VISUAL_DIAGNOSTICS=1 npm run build');
  const duration = ${durationMs};
  const intervals = [];
  // Track separate windows instead of trusting only the long-run average.
  const windowMs = 30000;
  const windows = Array.from({ length: Math.ceil(duration / windowMs) }, () => []);
  const heapSamples = [];
  const heap = () => performance.memory?.usedJSHeapSize ?? null;
  let last = null;
  const start = performance.now();
  const finishAt = start + duration;
  heapSamples.push({ elapsedMs: 0, usedJSHeapBytes: heap() });
  let sampledWindow = -1;
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, duration + 1500);
    const tick = (now) => {
      const elapsed = now - start;
      if (last !== null) {
        const delta = now - last;
        intervals.push(delta);
        windows[Math.min(windows.length - 1, Math.floor(Math.max(0, elapsed) / windowMs))].push(delta);
      }
      last = now;
      const currentWindow = Math.floor(Math.max(0, elapsed) / windowMs);
      if (currentWindow !== sampledWindow) {
        if (sampledWindow >= 0)
          heapSamples.push({ elapsedMs: Math.round(elapsed), usedJSHeapBytes: heap() });
        sampledWindow = currentWindow;
      }
      if (now >= finishAt) { clearTimeout(timer); resolve(); }
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const percentile = (values, p) => values.length
    ? Math.round(values[Math.min(values.length - 1, Math.floor((values.length - 1) * p))] * 100) / 100
    : null;
  const actualDurationMs = performance.now() - start;
  heapSamples.push({ elapsedMs: Math.round(actualDurationMs), usedJSHeapBytes: heap() });
  intervals.sort((a, b) => a - b);
  const segments = windows.map((values, index) => {
    values.sort((a, b) => a - b);
    return {
      startSeconds: index * windowMs / 1000,
      endSeconds: Math.min(duration, (index + 1) * windowMs) / 1000,
      frameCount: values.length,
      p95Ms: percentile(values, .95), p99Ms: percentile(values, .99),
      over16ms: values.filter(ms => ms > 16.67).length,
      over33ms: values.filter(ms => ms > 33.34).length,
    };
  });
  const diagnostics = { ...d.renderDiagnostics };
  return {
    actualDurationMs: Math.round(actualDurationMs), sampleCount: intervals.length,
    meanFps: Math.round(intervals.length * 1000 / actualDurationMs * 10) / 10,
    p50Ms: percentile(intervals, .50), p95Ms: percentile(intervals, .95),
    p99Ms: percentile(intervals, .99),
    segments, heapSamples,
    framesOver16ms: intervals.filter(ms => ms > 16.67).length,
    framesOver33ms: intervals.filter(ms => ms > 33.34).length,
    maxFrameMs: intervals.length ? intervals[intervals.length - 1] : null,
    browserResolution: { width: window.innerWidth, height: window.innerHeight,
      pixelRatio: window.devicePixelRatio },
    remoteEntities: d.remotes.entities.size,
    gpuRenderer: diagnostics.gpuRenderer, render: diagnostics,
    heapBytes: heap(),
    visible: document.visibilityState,
    weaponModels: window.__arenaWeaponModels
      ? Object.fromEntries(Object.entries(window.__arenaWeaponModels)
          .map(([id, model]) => [id, {
            status: model.status, source: model.source ?? null,
            authored: !!(model.authoredSniperRig || model.tacticalRifleRig),
            sourceSeparatedParts: model.sourceSeparatedParts ?? [],
            supplementalMechanism: model.supplementalMechanism ?? null,
            proceduralHands: !!model.proceduralHands,
            skinnedHands: !!model.skinnedHands,
            skinnedBones: model.skinnedBones ?? 0,
            handAnimation: model.handAnimation ?? null,
          }]))
      : null,
  };
})()`;

async function run() {
  const server = spawn(process.execPath, ['scripts/start.mjs'], {
    cwd: root, env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  children.push(server);
  server.stdout.on('data', (data) => { serverOutput += data.toString(); });
  server.stderr.on('data', (data) => { serverOutput += data.toString(); });
  const port = await poll(() => {
    if (server.exitCode !== null) throw new Error(`Server exited: ${serverOutput}`);
    return Number(serverOutput.match(/arena server on :(\d+)/)?.[1] ?? 0);
  });
  const url = `http://127.0.0.1:${port}/?debugAssets=1&gpuQuality=${quality}`;
  // Start the browsers one at a time to avoid Crashpad's Windows pipe race;
  // they remain independent, alive, and render concurrently during the test.
  const host = await launchBrowser('host', url);
  const guest = await launchBrowser('guest', url);
  assert.notEqual(host.pid, guest.pid, 'Both clients must use independent Chrome processes');
  assert.notEqual(host.profile, guest.profile, 'Browser profiles must be independent');
  await host.eval(`(() => {
    const name = document.querySelector('#nickname');
    name.value = 'DualChromeHost';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#mode-select').value = 'tdm';
    document.querySelector('#btn-create').click();
  })()`);
  const roomCode = await host.wait(`!document.querySelector('#lobby').classList.contains('hidden') &&
    document.querySelector('#lobby-code').textContent.trim().length === 4 &&
    document.querySelector('#lobby-code').textContent.trim()`);
  {
    await host.eval(`(() => {
      const select = document.querySelector('#lobby-map-select');
      if (!select.querySelector('option[value=${JSON.stringify(mapId)}]'))
        throw new Error('Map unavailable: ${mapId}');
      select.value = ${JSON.stringify(mapId)};
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await host.wait(`(() => {
      const el = document.querySelector('#lobby-map-select');
      return el.value === ${JSON.stringify(mapId)} &&
        document.querySelector('#lobby-mode').textContent.includes(el.selectedOptions[0].textContent);
    })()`);
  }
  await guest.eval(`(() => {
    const name = document.querySelector('#nickname');
    name.value = 'DualChromeGuest';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    const code = document.querySelector('#room-code');
    code.value = ${JSON.stringify(roomCode)};
    code.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#btn-join').click();
  })()`);
  await Promise.all([
    host.wait(`document.querySelector('#lobby-count').textContent.startsWith('2 /')`),
    guest.wait(`!document.querySelector('#lobby').classList.contains('hidden')`),
  ]);
  await host.eval(`document.querySelector('#btn-start').click()`);
  await Promise.all(clients.map((client) =>
    client.wait(`document.querySelector('#lobby').classList.contains('hidden') &&
      document.querySelector('#menu').classList.contains('hidden') &&
      document.querySelector('#game').width > 0`, 30000)));
  await Promise.all(clients.map((client) =>
    poll(() => client.joined?.you?.id && client.snapshot?.players?.length === 2, 25000)));
  await Promise.all(clients.map((client) => poll(() => client.live, 20000)));
  await Promise.all(clients.map(unlockControls));
  await sleep(500);
  // Sequential input avoids mutual collision and makes each server position measurable.
  const hostAction = await verifyMovementAndShot(host, guest);
  const guestAction = await verifyMovementAndShot(guest, host);
  assert.ok(host.remoteCount >= 1 && guest.remoteCount >= 1,
    'Both clients must receive remote characters');
  // CDP evaluations overlap so both browsers render the full benchmark at once.
  const telemetry = startGpuTelemetry();
  let benches;
  let gpuTelemetry;
  try {
    benches = await Promise.all(clients.map((client) =>
      client.eval(benchExpression, durationMs + 30000)));
  } finally {
    gpuTelemetry = await telemetry.stop();
  }
  const report = {
    ok: true, createdAt: new Date().toISOString(), mapId, roomCode,
    machineLabel,
    hardwareGpuRequired: requireGpu, requestedDurationMs: durationMs,
    quality, deviceScaleFactor, ...(gpuTelemetry ? { gpuTelemetry } : {}),
    independentChromeProcesses: host.pid !== guest.pid,
    clients: clients.map((client, index) => ({
      name: client.name, chromePid: client.pid, cdpPort: client.debugPort,
      id: client.joined?.you?.id, serverSnapshots: client.frames,
      serverShotEvents: client.shots, remotePlayers: client.remoteCount,
      actions: index === 0 ? hostAction : guestAction,
      ...benches[index], errors: client.errors, warnings: client.warnings.slice(0, 12),
    })),
    constraints: ['Automated headless Chrome playtest; native mouse pointer lock not validated',
      'rAF timings measure frame scheduling, not GPU timestamps or VRAM bytes',
      'JS heap snapshots fluctuate with garbage collection and cannot alone prove absence of leaks',
      'Two independent Chrome instances share the same host GPU unless moved to different hardware',
      'Multi-GPU comparisons require running this script on each actual hardware configuration'],
  };
  if (captureScreenshots) {
    mkdirSync(reportDir, { recursive: true });
    report.screenshots = [];
    for (const client of clients) {
      const { data } = await client.command('Page.captureScreenshot', {
        format: 'png', fromSurface: true, captureBeyondViewport: false,
      });
      const screenshotPath = path.join(reportDir, `two-chrome-${stamp}-${client.name}.png`);
      writeFileSync(screenshotPath, Buffer.from(data, 'base64'));
      report.screenshots.push({ name: client.name, path: screenshotPath });
    }
    if (captureArsenal) {
      report.arsenalScreenshots = [];
      if (captureReload) report.reloadScreenshots = [];
      // Visual-only model selection after timing collection. This does not
      // change gameplay loadouts or represent a physical input playtest.
      for (const client of clients) {
        const previousId = await client.eval(`window.__arenaVisualDebug.weaponView.currentId`);
        try {
          for (const id of ALL_WEAPON_IDS) {
            await client.eval(`(() => {
              const view = window.__arenaVisualDebug.weaponView;
              if (!view?.models?.[${JSON.stringify(id)}])
                throw new Error('Missing visual model: ${id}');
              if (view.currentId && view.models[view.currentId])
                view.models[view.currentId].group.visible = false;
              view.currentId = ${JSON.stringify(id)};
              view.models[view.currentId].group.visible = true;
              view.lowerAmount = 0;
              view.shotPunch = 0;
            })()`);
            await sleep(260);
            const { data } = await client.command('Page.captureScreenshot', {
              format: 'jpeg', quality: 82, fromSurface: true,
              captureBeyondViewport: false,
            });
            const screenshotPath = path.join(reportDir,
              `two-chrome-${stamp}-${client.name}-${id}.jpg`);
            writeFileSync(screenshotPath, Buffer.from(data, 'base64'));
            report.arsenalScreenshots.push({ name: client.name, weaponId: id,
              path: screenshotPath, selection: 'visual-only' });
            if (captureReload && id !== 'knife') {
              // Inspect an actual moving source part and articulated glove at
              // its action phase. The override affects only diagnostic builds,
              // and never changes server ammo or the player's weapon inventory.
              const motionPart = SOURCE_WEAPON_RIGS[id]?.parts[0];
              const late = ['Slide', 'Pump', 'Bolt', 'Barrel'].includes(motionPart);
              const reloadProgress = late ? 0.86 : 0.45;
              await client.eval(`window.__arenaVisualDebug.weaponView.diagnosticReloadProgress = ${reloadProgress}`);
              await sleep(210);
              const observation = await client.eval(`(() => {
                const view = window.__arenaVisualDebug.weaponView;
                const m = view.models[${JSON.stringify(id)}];
                const sourceParts = Object.fromEntries(Object.entries(m.sourceRig?.parts ?? {})
                  .map(([name, { pivot, restPosition, restRotation }]) => [name, {
                    translation: pivot.position.distanceTo(restPosition),
                    rotation: Math.abs(pivot.rotation.x - restRotation.x) +
                      Math.abs(pivot.rotation.y - restRotation.y) +
                      Math.abs(pivot.rotation.z - restRotation.z),
                  }]));
                const skinned = m.skinnedRig;
                const supportHandTravel = skinned
                  ? skinned.left.control.position.distanceTo(
                    skinned.rest.left.control.clone().add(skinned.restOffset.left))
                  : m.handRig?.left.position.distanceTo(m.handRig.rest.left) ?? null;
                return { sourceParts, supportHandTravel,
                  skinBoneCount: skinned?.mesh.skeleton.bones.length ?? 0,
                  diagnosticReloadProgress: view.diagnosticReloadProgress };
              })()`);
              if (motionPart) {
                const movement = observation.sourceParts[motionPart];
                assert.ok(movement && movement.translation + movement.rotation > 0.001,
                  `${client.name} ${id}: source part did not move during reload`);
                assert.ok(observation.supportHandTravel > 0.02,
                  `${client.name} ${id}: support glove did not follow reload`);
              }
              const { data: reloadJpeg } = await client.command('Page.captureScreenshot', {
                format: 'jpeg', quality: 82, fromSurface: true,
                captureBeyondViewport: false,
              });
              const reloadPath = path.join(reportDir,
                `two-chrome-${stamp}-${client.name}-${id}-reload.jpg`);
              writeFileSync(reloadPath, Buffer.from(reloadJpeg, 'base64'));
              report.reloadScreenshots.push({ name: client.name, weaponId: id,
                path: reloadPath, selection: 'diagnostic-only', ...observation });
              await client.eval(`window.__arenaVisualDebug.weaponView.diagnosticReloadProgress = null`);
            }
          }
        } finally {
          await client.eval(`(() => {
            const view = window.__arenaVisualDebug.weaponView;
            view.diagnosticReloadProgress = null;
            if (view.currentId && view.models[view.currentId])
              view.models[view.currentId].group.visible = false;
            view.currentId = ${JSON.stringify(previousId)};
            if (view.currentId && view.models[view.currentId])
              view.models[view.currentId].group.visible = true;
            view.lowerAmount = 0;
          })()`);
        }
      }
    }
  }
  for (const client of report.clients) {
    assert.ok(client.sampleCount >= 20, `${client.name}: too few frame samples`);
    assert.ok(client.segments.length === Math.ceil(durationMs / 30000),
      `${client.name}: missing time segments`);
    assert.equal(client.browserResolution.pixelRatio, deviceScaleFactor,
      `${client.name}: Chrome did not apply the requested device scale`);
    assert.ok(client.remotePlayers === 1, `${client.name}: missing remote player`);
    assert.equal(client.errors.length, 0, `${client.name}: browser errors: ${client.errors.join('; ')}`);
    assert.ok(client.weaponModels, `${client.name}: visual weapon diagnostics unavailable`);
    for (const id of ALL_WEAPON_IDS) {
      const model = client.weaponModels[id];
      assert.equal(model?.status, 'ready', `${client.name}: ${id} failed asset loading`);
      assert.equal(model.skinnedHands, true,
        `${client.name}: ${id} did not bind the first-person skinned armature`);
      assert.ok(model.skinnedBones >= 60,
        `${client.name}: ${id} skinned rig has too few bones`);
      assert.equal(model.handAnimation, 'weapon-specific-keyframes',
        `${client.name}: ${id} has no authored cosmetic action timeline`);
      assert.equal(model.proceduralHands, false,
        `${client.name}: ${id} still draws the placeholder gloves`);
      if (id === 'rifle' || id === 'sniper') {
        assert.equal(model.authored, true, `${client.name}: ${id} missing authored rig`);
      } else if (SOURCE_WEAPON_RIGS[id]) {
        assert.deepEqual(model.sourceSeparatedParts, SOURCE_WEAPON_RIGS[id].parts,
          `${client.name}: ${id} missing independently movable source geometry`);
        assert.equal(model.supplementalMechanism, null,
          `${client.name}: ${id} overlaps extracted parts with cosmetic parts`);
      } else {
        if (id !== 'knife') {
          assert.ok(model.supplementalMechanism,
            `${client.name}: ${id} missing independent cosmetic mechanism`);
        }
      }
    }
    if (requireGpu) {
      assert.match(client.gpuRenderer ?? '', /NVIDIA|AMD|Radeon|Intel|Apple|Adreno|Mali/i,
        `${client.name}: hardware GPU was not detected`);
      assert.doesNotMatch(client.gpuRenderer, /SwiftShader|llvmpipe|WARP|Software/i);
    }
  }
  mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `two-chrome-${stamp}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok: true, reportPath, mapId, roomCode, durationMs,
    clients: report.clients.map(({ name, chromePid, gpuRenderer, meanFps, p95Ms,
      p99Ms, remotePlayers, actions, errors }) =>
      ({ name, chromePid, gpuRenderer, meanFps, p95Ms, p99Ms, remotePlayers, actions, errors })),
  }));
}

try {
  await run();
} catch (error) {
  console.error(error.stack ?? error.message);
  if (clients.length) console.error(JSON.stringify(clients.map(({ name, errors, warnings,
    joined, frames, shots }) => ({ name, errors, warnings: warnings.slice(0, 5),
    joined: !!joined, frames, shots }))));
  process.exitCode = 1;
} finally {
  for (const client of clients) {
    client.socket.close();
    for (const item of client.pending.values()) clearTimeout(item.timeout);
    client.pending.clear();
  }
  for (const child of children.reverse()) if (child.exitCode === null) child.kill();
  for (const profile of profiles) {
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 3 }); }
    catch { /* Chrome can keep profile files open briefly on Windows */ }
  }
}
