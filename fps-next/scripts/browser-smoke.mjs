// Real Chrome smoke check: production page -> input setup -> lobby -> 3D match.
// Run after npm run build: node scripts/browser-smoke.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { C2S, S2C, PHASE, encode, decode, decodeSnapshot } from '../shared/protocol.js';
import { LARGE_TEAM_MAPS, ROTATION } from '../shared/maps/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = process.env.CHROME_PATH ??
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = mkdtempSync(path.join(os.tmpdir(), 'arena-chrome-'));
const screenshot = process.env.SMOKE_SCREENSHOT ?? path.join(os.tmpdir(), 'arena-fps-match.png');
const viewportWidth = Number(process.env.SMOKE_WIDTH || 0);
const viewportHeight = Number(process.env.SMOKE_HEIGHT || 0);
const perfDurationMs = Number(process.env.SMOKE_PERF_DURATION_MS ?? 2000);
assert.ok(Number.isInteger(perfDurationMs) && perfDurationMs >= 2000 && perfDurationMs <= 60000,
  'SMOKE_PERF_DURATION_MS must be between 2000 and 60000 milliseconds');
assert.ok((viewportWidth === 0 && viewportHeight === 0) ||
  (Number.isInteger(viewportWidth) && Number.isInteger(viewportHeight) &&
   viewportWidth >= 640 && viewportWidth <= 3840 && viewportHeight >= 480 && viewportHeight <= 2160),
  'Set both SMOKE_WIDTH and SMOKE_HEIGHT to a supported pixel size');
const legacyRifle = process.env.SMOKE_LEGACY_RIFLE === '1';
const requestedMode = process.env.SMOKE_MODE ?? 'tdm';
const requestedMap = process.env.SMOKE_MAP;
const requestedTeams = Number(process.env.SMOKE_TEAMS ?? (requestedMap && ROTATION.includes(requestedMap) ? 2 : 4));
const requestedHumans = Number(process.env.SMOKE_HUMANS ?? (requestedMode === 'retake' ? 6 : requestedMode === 'squads' ? 4 : 2));
assert.ok(['tdm', 'duel', 'squads', 'retake'].includes(requestedMode), `Unsupported smoke mode: ${requestedMode}`);
assert.ok(!requestedMap || [...ROTATION, ...LARGE_TEAM_MAPS].includes(requestedMap), `Unsupported smoke map: ${requestedMap}`);
assert.ok(requestedMode !== 'tdm' || [2, 3, 4].includes(requestedTeams), `Unsupported smoke team count: ${requestedTeams}`);
assert.ok(!requestedMap || requestedMode === 'tdm' || !LARGE_TEAM_MAPS.includes(requestedMap), 'Duel and squads require compact maps');
assert.ok(!requestedMap || requestedMode !== 'tdm' || requestedTeams <= 2 || LARGE_TEAM_MAPS.includes(requestedMap), 'Compact maps support two teams only');
assert.ok(Number.isInteger(requestedHumans) && requestedHumans >= 2 && requestedHumans <= 16, `Invalid smoke human count: ${requestedHumans}`);
assert.ok(requestedMode === 'tdm' || requestedHumans === (requestedMode === 'retake' ? 6 : requestedMode === 'squads' ? 4 : 2), `${requestedMode} requires a fixed human count`);
const children = [];
const sockets = [];
const errors = [];
const warnings = [];
const mapAssetResponses = new Map();

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
      if (msg?.m === S2C.ERROR) {
        cleanup();
        reject(new Error(`WebSocket rejected request: ${msg.code ?? 'unknown'}: ${msg.message ?? ''}`));
        return;
      }
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
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'warning') {
      warnings.push(msg.params.args.map((arg) => arg.value ?? arg.description).join(' '));
    }
    if (msg.method === 'Network.responseReceived') {
      const file = msg.params.response.url.match(/\/models\/props\/hilltown\/([^/?]+\.glb)(?:[?#]|$)/i)?.[1];
      if (file) mapAssetResponses.set(file, msg.params.response.status);
    }
  });
  function command(method, params = {}) {
    const id = ++requestId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP ${method} timed out`)); },
        method === 'Runtime.evaluate' && process.env.SMOKE_PERF === '1' ? Math.max(20_000, perfDurationMs + 15_000) : 20_000);
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
  await command('Network.enable');
  if (viewportWidth) {
    await command('Emulation.setDeviceMetricsOverride', {
      width: viewportWidth, height: viewportHeight, deviceScaleFactor: 1, mobile: false,
    });
  }
  await command('Page.navigate', { url: `http://127.0.0.1:${port}/?debugAssets=1${legacyRifle ? '&legacyRifle=1' : ''}` });
  // Wait for main.js to initialise and open the calibration overlay; the static
  // markup exists before any event handlers are registered.
  await waitFor(`document.querySelector('#scheme-options .scheme-card[data-scheme="mouse"]') !== null && !document.querySelector('#scheme-picker').classList.contains('hidden')`);
  await evaluate(`document.querySelector('[data-scheme="mouse"]').click()`);
  await waitFor(`document.querySelector('#scheme-picker').classList.contains('hidden')`);
  await evaluate(`(() => { const el = document.querySelector('#nickname'); el.value = 'BrowserHost'; el.dispatchEvent(new Event('input', {bubbles:true})); document.querySelector('#mode-select').value = '${requestedMode}'; document.querySelector('#btn-create').click(); })()`);
  let roomCode;
  try {
    roomCode = await waitFor(`!document.querySelector('#lobby').classList.contains('hidden') && document.querySelector('#lobby-code').textContent.trim().length === 4 && document.querySelector('#lobby-code').textContent.trim()`);
  } catch (error) {
    const state = await evaluate(`({menu:document.querySelector('#menu').className,lobby:document.querySelector('#lobby').className,code:document.querySelector('#lobby-code').textContent,error:document.querySelector('#menu-error').textContent,errorClass:document.querySelector('#menu-error').className,buttons:[...document.querySelectorAll('.menu-actions button')].map(x=>[x.id,x.disabled])})`);
    throw new Error(`${error.message}; UI: ${JSON.stringify(state)}; browser errors: ${errors.join('; ')}`);
  }
  const teamCount = requestedMode === 'tdm' ? requestedTeams : 2;
  if (requestedMode === 'tdm' && requestedTeams !== 2) {
    await evaluate(`(() => { const el = document.querySelector('#lobby-team-count-select'); el.value='${teamCount}'; el.dispatchEvent(new Event('change', {bubbles:true})); })()`);
  }
  await waitFor(`document.querySelectorAll('#lobby-slots .slot-col').length === ${teamCount}`);
  if (requestedMap && requestedMode !== 'retake') {
    assert.equal(await evaluate(`!!document.querySelector('#lobby-map-select option[value="${requestedMap}"]')`), true,
      `Unknown smoke map: ${requestedMap}`);
    await evaluate(`(() => { const el = document.querySelector('#lobby-map-select'); el.value = '${requestedMap}'; el.dispatchEvent(new Event('change', {bubbles:true})); })()`);
    // The select changes immediately, but the lobby header only changes after
    // the server confirms the map. Wait for the latter before inviting guests.
    await waitFor(`(() => { const el = document.querySelector('#lobby-map-select'); return el.value === '${requestedMap}' && document.querySelector('#lobby-mode').textContent.includes(el.selectedOptions[0].textContent); })()`);
  }

  const guest = await connect(`ws://127.0.0.1:${port}/ws`);
  guest.send(encode(C2S.HELLO, { name: 'BrowserGuest' }));
  const guestJoin = await sendAndWait(guest, encode(C2S.JOIN, { code: roomCode }), (msg) => msg?.m === S2C.JOINED);
  assert.equal(guestJoin.mode, requestedMode, `Server did not create ${requestedMode} room`);
  if (requestedMap) {
    assert.equal(guestJoin.mapId, requestedMap, `Server rejected requested map ${requestedMap}`);
  }
  const expectedCapacity = guestJoin.lobby?.capacity ?? (requestedMode === 'duel' ? 2 : requestedMode === 'squads' ? 4 : requestedMode === 'retake' ? 6 : LARGE_TEAM_MAPS.includes(requestedMap ?? 'island') ? 16 : 8);
  assert.ok(requestedHumans <= expectedCapacity,
    `Requested ${requestedHumans} humans, but ${guestJoin.mapId} (${requestedMode}) permits only ${expectedCapacity}; choose a large team map for a 16-player smoke`);
  const guestCount = requestedHumans - 1;
  for (let i = 2; i <= guestCount; i++) {
    const teammate = await connect(`ws://127.0.0.1:${port}/ws`);
    teammate.send(encode(C2S.HELLO, { name: `BrowserGuest${i}` }));
    const joined = await sendAndWait(teammate, encode(C2S.JOIN, { code: roomCode }), (msg) => msg?.m === S2C.JOINED);
    assert.equal(joined.mode, requestedMode, 'Extra guest joined incorrect mode');
  }
  let live = false;
  let lastSnapshot = null;
  let shotsSeen = 0;
  let bombState = null;
  guest.on('message', (raw) => {
    const msg = decode(raw.toString());
    if (msg?.m === S2C.PHASE && msg.phase === PHASE.LIVE) live = true;
    if (msg?.m === S2C.SNAPSHOT) lastSnapshot = decodeSnapshot(msg);
    if (msg?.m === S2C.SHOTS) shotsSeen++;
    if (msg?.m === S2C.BOMB_STATE) bombState = msg;
  });
  await waitFor(`document.querySelector('#lobby-count').textContent === '${guestCount + 1} / ${expectedCapacity}'`);
  await evaluate(`document.querySelector('#btn-start').click()`);
  await waitFor(`document.querySelector('#lobby').classList.contains('hidden') && document.querySelector('#menu').classList.contains('hidden') && document.querySelector('#game').width > 0`);
  await poll(() => live && lastSnapshot, 12_000);
  await poll(() => lastSnapshot?.players.length === requestedHumans, 10_000);
  let retakeUi = null;
  if (requestedMode === 'retake') {
    assert.equal(guestJoin.mapId, 'courtyard', 'Retake must start on the courtyard map');
    await poll(() => bombState?.active && Array.isArray(bombState.pos) && bombState.remainingMs > 0, 10_000);
    retakeUi = await waitFor(`(() => {
      const hud = document.querySelector('#retake-objective');
      if (!hud || hud.classList.contains('hidden') || hud.classList.contains('inactive')) return null;
      const status = document.querySelector('#retake-status').textContent;
      const clock = document.querySelector('#retake-clock').textContent;
      if (!status.includes('BOMB PLANTED') || !/^\\d+:\\d\\d$/.test(clock)) return null;
      return {status,clock,role:document.querySelector('#retake-role').textContent,
        prompt:document.querySelector('#retake-prompt').textContent,
        objectiveModel:document.querySelector('#game').dataset.retakeObjective};
    })()`);
    await waitFor(`document.querySelector('#game').dataset.retakeObjective !== 'loading'`);
    retakeUi.objectiveModel = await evaluate(`document.querySelector('#game').dataset.retakeObjective`);
    assert.equal(retakeUi.objectiveModel, 'licensed', 'Retake objective GLB did not load');
  }
  const gunId = requestedMode === 'duel' ? 'sniper' : 'rifle';
  const gunModel = await waitFor(`window.__arenaWeaponModels?.${gunId}?.status === 'ready' && window.__arenaWeaponModels.${gunId}`);
  if (gunId === 'rifle') {
    assert.equal(gunModel.source, legacyRifle ? 'models/characters/Operator_Rifle.glb' : 'models/fp/m4a1.glb',
      `Expected detailed rifle GLB; actual ${JSON.stringify(gunModel)}, warnings ${JSON.stringify(warnings)}`);
    assert.ok(gunModel.texturedMeshes > 0, `Rifle lacks textured geometry: ${JSON.stringify(gunModel)}`);
    if (legacyRifle) assert.ok(gunModel.hiddenSpareMagazines > 0,
      `Rifle's unused reload magazine is visible: ${JSON.stringify(gunModel)}`);
  }
  assert.ok(gunModel.meshes > 0, `Gun loaded without geometry: ${JSON.stringify(gunModel)}`);
  if (gunId === 'sniper') {
    assert.equal(gunModel.authoredSniperRig, true, 'Chassis sniper GLB animation tracks were not bound');
  }
  if (process.env.SMOKE_SUPPLEMENTAL_QA === '1') {
    const loaded = await waitFor(`(() => {
      const assets = window.__arenaWeaponModels;
      return ['smg','shotgun','revolver','carbine','autoshotgun','knife','sniper'].every(
        id => assets?.[id]?.status === 'ready');
    })()`);
    assert.ok(loaded, 'Supplemental QA needs its source weapon models');
    const mechanisms = await evaluate(`(() => {
      const view = window.__arenaVisualDebug?.weaponView;
      if (!view) return null;
      return Object.fromEntries(['smg','shotgun','revolver','carbine','autoshotgun','knife','rifle','sniper']
        .map(id => {
          const model = view.models[id];
          const rig = model?.supplementalRig;
          return [id, { kind: rig?.kind ?? null, mag: !!rig?.magazine,
            shell: !!rig?.shell, action: !!rig?.mechanism,
            allHiddenAtRest: [rig?.magazine,rig?.shell,rig?.mechanism].every(part => !part?.visible),
            authored: !!(model?.rifleRig || model?.sniperRig) }];
        }));
    })()`);
    assert.ok(mechanisms, 'Run a VITE_VISUAL_DIAGNOSTICS=1 build for supplemental QA');
    for (const id of ['smg','shotgun','revolver','carbine','autoshotgun']) {
      assert.ok(mechanisms[id].kind, `${id} lacks its supplemental viewmodel mechanism`);
      assert.equal(mechanisms[id].allHiddenAtRest, true, `${id} leaves props visible when idle`);
    }
    assert.equal(mechanisms.shotgun.shell, true, 'Tube shotgun has no shell insertion prop');
    assert.equal(mechanisms.autoshotgun.shell, true, 'Semi-auto shotgun has no shell insertion prop');
    assert.equal(mechanisms.revolver.kind, 'speedloader');
    assert.equal(mechanisms.knife.kind, null);
    assert.equal(mechanisms.rifle.kind, null, 'M4A1 authored animation should take priority');
    assert.equal(mechanisms.sniper.kind, null, 'Chassis sniper authored animation should take priority');
    console.log(`supplemental weapon mechanisms: ${JSON.stringify(mechanisms)}`);
  }
  if (guestJoin.mapId === 'courtyard') {
    const expected = ['SandbagWall_CC0.glb', 'TimberCrateStack_CC0.glb',
      'MarketAwningStall_CC0.glb', 'TownFountain_CC0.glb',
      'PlasterWallBay_CC0.glb', 'OchreWallBay_CC0.glb', 'ShutteredWindowBay_CC0.glb'];
    await poll(() => expected.every((file) => mapAssetResponses.has(file)), 15000);
    for (const file of expected) {
      assert.equal(mapAssetResponses.get(file), 200,
        `Courtyard model ${file} could not be served: ${JSON.stringify([...mapAssetResponses])}`);
    }
    assert.ok(!warnings.some((warning) => expected.some((file) => warning.includes(file))),
      `Courtyard GLB load warnings: ${JSON.stringify(warnings)}`);
  }
  await sleep(500); // allow scene to render after the detailed model is loaded

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
  let animationCheck = null;
  let remoteReloadCheck = null;
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
  if (gunId === 'sniper') {
    // Check actual cloned GLB node transforms, not merely loaded animation names.
    const boltShotDelta = await evaluate(`(() => {
      const r = window.__arenaWeaponModels.sniper.rig;
      return Math.abs(r.bolt.position.z - r.boltRest.z);
    })()`);
    assert.ok(boltShotDelta > 0.01, `Sniper bolt did not cycle after a shot: ${boltShotDelta}`);

    await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'r', code: 'KeyR', windowsVirtualKeyCode: 82 });
    await sleep(80);
    await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'r', code: 'KeyR', windowsVirtualKeyCode: 82 });
    await sleep(850);
    const magazineReloadDelta = await evaluate(`(() => {
      const r = window.__arenaWeaponModels.sniper.rig;
      return Math.abs(r.magazine.position.y - r.magRest.y);
    })()`);
    assert.ok(magazineReloadDelta > 0.03,
      `Sniper magazine did not move during reload: ${magazineReloadDelta}`);

    await sleep(2350);
    const magazineRestDelta = await evaluate(`(() => {
      const r = window.__arenaWeaponModels.sniper.rig;
      return Math.abs(r.magazine.position.y - r.magRest.y);
    })()`);
    assert.ok(magazineRestDelta < 0.002,
      `Sniper magazine did not return to rest after reload: ${magazineRestDelta}`);
    animationCheck = { boltShotDelta, magazineReloadDelta, magazineRestDelta };
  }
  if (gunId === 'rifle' && process.env.SMOKE_TACTICAL_QA === '1') {
    const rig = await evaluate(`(() => {
      const r = window.__arenaWeaponModels?.rifle?.rig;
      return r?.magazine && r?.handle ? true : false;
    })()`);
    // The weapon model is exposed only when debugAssets is requested above.
    // The rifle rig itself is located on the cloned in-game viewmodel.
    const rifleRig = await evaluate(`(() => {
      const r = window.__arenaVisualDebug?.weaponView?.models?.rifle?.rifleRig;
      return !!r?.magazine && !!r?.handle;
    })()`);
    assert.ok(rifleRig, `Tactical rifle animation nodes are absent (legacy debug rig: ${rig})`);
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'r', code: 'KeyR', windowsVirtualKeyCode: 82 });
    await sleep(80);
    await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'r', code: 'KeyR', windowsVirtualKeyCode: 82 });
    await sleep(800);
    const magazineReloadDelta = await evaluate(`(() => {
      const r = window.__arenaVisualDebug.weaponView.models.rifle.rifleRig;
      return Math.abs(r.magazine.position.y - r.magRest.y);
    })()`);
    assert.ok(magazineReloadDelta > 0.03, `M4A1 magazine did not move during reload: ${magazineReloadDelta}`);
    await sleep(2100);
    const magazineRestDelta = await evaluate(`(() => {
      const r = window.__arenaVisualDebug.weaponView.models.rifle.rifleRig;
      return Math.abs(r.magazine.position.y - r.magRest.y);
    })()`);
    assert.ok(magazineRestDelta < 0.002, `M4A1 magazine did not return after reload: ${magazineRestDelta}`);
    animationCheck = { magazineReloadDelta, magazineRestDelta };
  }
  if (gunId === 'rifle' && requestedMode === 'tdm' && process.env.SMOKE_TACTICAL_QA === '1') {
    const guestId = guestJoin.you.id;
    const guestWeapon = lastSnapshot?.players.find((p) => p.id === guestId)?.weapon;
    assert.ok(guestWeapon, `No live weapon for remote player ${guestId}`);
    await waitFor(`(() => {
      const entity = window.__arenaVisualDebug?.remotes?.entities.get(${JSON.stringify(guestId)});
      return !!entity?.character?.reloadRig?.magazine && !!entity?.character?.reloadRig?.chargingHandle;
    })()`);
    guest.send(encode(C2S.RELOAD, { w: guestWeapon }));
    await waitFor(`window.__arenaVisualDebug.remotes.reloads.has(${JSON.stringify(guestId)})`);
    await sleep(700);
    const activePose = await evaluate(`(() => {
      const d = window.__arenaVisualDebug;
      const entity = d.remotes.entities.get(${JSON.stringify(guestId)});
      const rig = entity?.character?.reloadRig;
      return { active: rig?.active ?? false, queued: d.remotes.reloads.has(${JSON.stringify(guestId)}),
        magazineDelta: rig?.magazine ? Math.abs(rig.magazine.position.y - rig.magazinePosition.y) : null,
        rifleDelta: rig?.rifle ? Math.abs(rig.rifle.position.y - rig.riflePosition.y) : null };
    })()`);
    assert.equal(activePose.active, true, `Remote reload was not animated: ${JSON.stringify(activePose)}`);
    assert.ok(activePose.magazineDelta > 0.03 && activePose.rifleDelta > 0.005,
      `Remote magazine and rifle did not move: ${JSON.stringify(activePose)}`);
    await poll(() => evaluate(`!window.__arenaVisualDebug.remotes.reloads.has(${JSON.stringify(guestId)})`), 7000);
    const restPose = await evaluate(`(() => {
      const rig = window.__arenaVisualDebug.remotes.entities.get(${JSON.stringify(guestId)})?.character?.reloadRig;
      return { active: rig?.active ?? null,
        magazineDelta: rig?.magazine ? Math.abs(rig.magazine.position.y - rig.magazinePosition.y) : null,
        rifleDelta: rig?.rifle ? Math.abs(rig.rifle.position.y - rig.riflePosition.y) : null };
    })()`);
    assert.equal(restPose.active, false, `Remote reload animation remained active: ${JSON.stringify(restPose)}`);
    assert.ok(restPose.magazineDelta < 0.002 && restPose.rifleDelta < 0.002,
      `Remote reload did not restore its starting pose: ${JSON.stringify(restPose)}`);
    remoteReloadCheck = { weapon: guestWeapon, activePose, restPose };
  }
  const result = await evaluate(`({canvas:[document.querySelector('#game').width,document.querySelector('#game').height],room:location.hash,paused:!document.querySelector('#pause').classList.contains('hidden'),webgl:!!document.querySelector('#game').getContext('webgl2')})`);
  assert.equal(result.webgl, true, '3D WebGL context was not created');
  if (viewportWidth) assert.deepEqual(result.canvas, [viewportWidth, viewportHeight], 'Requested render resolution was not applied');
  assert.deepEqual(errors, [], `Browser errors: ${errors.join('; ')}`);
  // Hide any pointer-lock overlay for a useful terrain screenshot. Report
  // native pointer lock separately from the test-only emulation above.
  await evaluate(`document.querySelector('#pause').classList.add('hidden')`);
  // Diagnostic A/B rendering: identify meshes that stretch across the screen.
  const rifleMeshInfo = gunId === 'rifle' ? await evaluate(`(() => {
    const root = window.__arenaWeaponModels?.rifle?.viewRoot;
    const out = [];
    root?.traverse(node => {
      if (node.isMesh) out.push({ name: node.name, parent: node.parent?.name,
        skinned: node.isSkinnedMesh, visible: node.visible,
        materials: (Array.isArray(node.material) ? node.material : [node.material]).map(m => m?.name) });
    });
    return out;
  })()`) : null;
  const bodyTriangleStats = gunId === 'rifle' && process.env.SMOKE_ANALYZE_BODY === '1'
    ? await evaluate(`(() => {
      const body = window.__arenaWeaponModels.rifle.viewRoot.getObjectByName('Body');
      const g = body.geometry, p = g.getAttribute('position'), ids = g.getIndex();
      g.computeBoundingBox();
      const top = [], count = ids ? ids.count / 3 : p.count / 3;
      let overHalf = 0, overOne = 0, overTwo = 0;
      let behindCamera = 0, nearClipped = 0, beyondRight = 0, screenFilling = 0;
      const largestScreen = [], depthRange = [Infinity, -Infinity], xRange = [Infinity, -Infinity];
      let sceneRoot = body;
      while (sceneRoot.parent) sceneRoot = sceneRoot.parent;
      sceneRoot.updateMatrixWorld(true);
      const v3 = () => new body.position.constructor();
      const tanHalfFov = Math.tan(25 * Math.PI / 180);
      for (let i = 0; i < count; i++) {
        const ix = [0,1,2].map(j => ids ? ids.getX(i*3+j) : i*3+j);
        const v = ix.map(n => [p.getX(n),p.getY(n),p.getZ(n)]);
        const edges = [0,1,2].map(j => Math.hypot(...[0,1,2].map(k => v[j][k]-v[(j+1)%3][k])));
        const largest = Math.max(...edges);
        const projected = ix.map(n => {
          const w = v3().set(p.getX(n), p.getY(n), p.getZ(n)).applyMatrix4(body.matrixWorld);
          depthRange[0] = Math.min(depthRange[0], w.z);
          depthRange[1] = Math.max(depthRange[1], w.z);
          xRange[0] = Math.min(xRange[0], w.x);
          xRange[1] = Math.max(xRange[1], w.x);
          const d = Math.max(-w.z, 0.00001);
          return [w.x / (d * tanHalfFov * 1.6), w.y / (d * tanHalfFov), w.z];
        });
        if (projected.every(v => v[2] >= 0)) behindCamera++;
        if (projected.some(v => v[2] > -0.01)) nearClipped++;
        if (projected.some(v => v[0] > 1)) beyondRight++;
        const screenSpan = Math.max(...projected.map(v => v[0])) - Math.min(...projected.map(v => v[0]));
        if (screenSpan > 0.4) screenFilling++;
        if (largestScreen.length < 8 || screenSpan > largestScreen[largestScreen.length-1].span) {
          largestScreen.push({ i, span: Number(screenSpan.toFixed(2)), vertices: projected.map(v => v.map(n => Number(n.toFixed(3)))) });
          largestScreen.sort((a,b) => b.span - a.span);
          if (largestScreen.length > 8) largestScreen.pop();
        }
        if (largest > 0.5) overHalf++;
        if (largest > 1) overOne++;
        if (largest > 2) overTwo++;
        if (top.length < 12 || largest > top[top.length-1].largest) {
          top.push({ i, largest: Number(largest.toFixed(3)), v: v.map(vv => vv.map(n => Number(n.toFixed(3)))) });
          top.sort((a,b) => b.largest - a.largest);
          if (top.length > 12) top.pop();
        }
      }
      return { triangles: count, overHalf, overOne, overTwo, behindCamera,
        nearClipped, beyondRight, screenFilling, depthRange, xRange,
        size: g.boundingBox.getSize(v3()).toArray(), top, largestScreen,
        nodeScale: body.scale.toArray(), matrixWorld: body.matrixWorld.elements };
    })()`) : null;
  if (process.env.SMOKE_HIDE_FP_ARMS === '1') {
    const hidden = await evaluate(`(() => {
      const root = window.__arenaWeaponModels?.rifle?.viewRoot;
      const arms = root?.getObjectByName('FPArms');
      if (!arms) {
        const names = [];
        root?.traverse((node) => names.push(node.name));
        return { found: false, root: !!root, names };
      }
      arms.visible = false;
      return { found: true };
    })()`);
    assert.ok(hidden.found, `Could not find the detailed rifle arms: ${JSON.stringify(hidden)}`);
  }
  if (process.env.SMOKE_HIDE_RIFLE_MESHES) {
    const hide = process.env.SMOKE_HIDE_RIFLE_MESHES;
    const hidden = await evaluate(`(() => {
      const root = window.__arenaWeaponModels?.rifle?.viewRoot;
      const hidden = [];
      root?.traverse(node => {
        if (node.isMesh && (${JSON.stringify(hide)} === 'all' || ${JSON.stringify(hide)}.split(',').includes(node.name))) {
          node.visible = false;
          hidden.push(node.name);
        }
      });
      return hidden;
    })()`);
    console.log(JSON.stringify({ hiddenRifleMeshes: hidden }));
  }
  await sleep(250);
  const shot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(screenshot, Buffer.from(shot.data, 'base64'));
  let tacticalCloseup = null;
  let tacticalCloseupInfo = null;
  if (process.env.SMOKE_TACTICAL_CLOSEUP === '1') {
    // Render a diagnostic third-person view in the same WebGL context. This is
    // cosmetic only: keep the live camera and authoritative positions intact.
    const capture = await evaluate(`(() => {
      const d = window.__arenaVisualDebug;
      const players = [...(d?.remotes?.entities.values() ?? [])];
      const entity = players.find(e => e.character && e.character.clipName !== 'Death'
        && e.character.held.get('AK')?.visible) ?? players.find(e => e.character && e.character.clipName !== 'Death');
      if (!entity) throw new Error('Tactical closeup requires a remote player and QA build');
      const view = d.camera.clone();
      const yaw = entity.group.rotation.y;
      const target = entity.group.position.clone();
      target.y += 1;
      view.position.set(target.x - Math.sin(yaw) * 2.6, target.y + 0.35, target.z - Math.cos(yaw) * 2.6);
      view.lookAt(target);
      const getBone = (name) => {
        const bone = entity.character.mixerRoot?.skeleton?.bones.find(b => b.name.includes(name));
        if (!bone) return null;
        bone.updateWorldMatrix(true, false);
        const p = bone.getWorldPosition(entity.group.position.clone());
        return {name:bone.name,position:p.toArray(),quaternion:bone.quaternion.toArray(),
          worldQuaternion:bone.getWorldQuaternion(bone.quaternion.clone()).toArray()};
      };
      const bones = {hips:getBone('Hips_'),head:getBone('Head_'),leftFoot:getBone('LeftFoot_'),rightFoot:getBone('RightFoot_')};
      const samplePose = () => ({head:getBone('Head_')?.position,
        leftFoot:getBone('LeftFoot_')?.position,rightFoot:getBone('RightFoot_')?.position,
        leftHand:getBone('LeftHand_')?.position,rightHand:getBone('RightHand_')?.position,
        leftThigh:getBone('LeftUpLeg_')?.quaternion,rightThigh:getBone('RightUpLeg_')?.quaternion,
        leftKnee:getBone('LeftLeg_')?.quaternion,rightKnee:getBone('RightLeg_')?.quaternion});
      const inspectTracks = (clipName) => {
        const clip = entity.character.clips.get(clipName);
        if (!clip) return null;
        return {clip:clipName, totalTracks:clip.tracks.length, legs:clip.tracks.filter(track =>
          /(?:LeftUpLeg|RightUpLeg|LeftLeg|RightLeg|Hips)_/.test(track.name)).map(track => {
          const mid = Math.floor(track.values.length / 8) * 4;
          return {name:track.name, first:[...track.values.slice(0,4)], middle:[...track.values.slice(mid,mid+4)],
            last:[...track.values.slice(-4)]};
        })};
      };
      const motionTracks = ['Idle', 'Walk', 'Run_Gun', 'Duck'].map(inspectTracks);
      const poses = [];
      d.renderer.render(d.world.scene, view);
      const png = d.renderer.domElement.toDataURL('image/png');
      if (${JSON.stringify(process.env.SMOKE_TACTICAL_POSES === '1')}) {
        for (const clipName of ['Idle', 'Idle_Shoot', 'Walk', 'Run_Gun', 'Duck']) {
          const clip = entity.character.clips.get(clipName);
          if (!clip) continue;
          entity.character.mixer.stopAllAction();
          entity.character.mixer.clipAction(clip).reset().play();
          entity.character.mixer.update(0.35);
          entity.character.setCrouchVisual(clipName === 'Duck', 1);
          d.world.scene.updateMatrixWorld(true);
          d.renderer.render(d.world.scene, view);
          poses.push({clip:clipName, bones:samplePose(), png:d.renderer.domElement.toDataURL('image/png')});
        }
      }
      return { png, poses, motionTracks, baseY: entity.group.position.y,
        model: entity.character.root.name,
        rifleVisible: !!entity.character.held.get('AK')?.visible,
        clip: entity.character.clipName, bones };
    })()`);
    assert.ok(capture.png?.startsWith('data:image/png;base64,'), 'Failed to capture closeup from WebGL');
    const { head, leftFoot, rightFoot } = capture.bones;
    assert.ok(head && leftFoot && rightFoot, 'Missing tactical locomotion bones');
    assert.ok(head.position[1] - Math.max(leftFoot.position[1], rightFoot.position[1]) > 0.95,
      'Tactical Idle is prone/horizontal: head must be higher than both feet');
    const footCenterX = (leftFoot.position[0] + rightFoot.position[0]) / 2;
    const footCenterZ = (leftFoot.position[2] + rightFoot.position[2]) / 2;
    assert.ok(Math.hypot(head.position[0] - footCenterX, head.position[2] - footCenterZ) < 0.8,
      'Tactical Idle tilts too far from the feet');
    if (process.env.SMOKE_TACTICAL_POSES === '1') {
      const crouch = capture.poses.find(p => p.clip === 'Duck')?.bones;
      assert.ok(crouch?.head && crouch?.leftFoot && crouch?.rightFoot,
        'Tactical Duck pose must expose head and feet');
      assert.ok(crouch.head[1] - capture.baseY < 1.2,
        `Duck head exceeds crouching hitbox: ${crouch.head[1] - capture.baseY}m`);
      for (const foot of [crouch.leftFoot, crouch.rightFoot]) {
        assert.ok(foot[1] - capture.baseY > -0.14 && foot[1] - capture.baseY < 0.18,
          `Duck foot floats or clips below ground: ${foot[1] - capture.baseY}m`);
      }
    }
    tacticalCloseup = screenshot.replace(/\.png$/i, '-tactical-closeup.png');
    writeFileSync(tacticalCloseup, Buffer.from(capture.png.slice('data:image/png;base64,'.length), 'base64'));
    const poseScreenshots = capture.poses.map(({clip, bones, png}) => {
      const imagePath = tacticalCloseup.replace(/\.png$/i, `-${clip.toLowerCase()}.png`);
      writeFileSync(imagePath, Buffer.from(png.slice('data:image/png;base64,'.length), 'base64'));
      return { clip, bones, screenshot:imagePath };
    });
    tacticalCloseupInfo = { model: capture.model, rifleVisible: capture.rifleVisible,
      clip: capture.clip, bones: capture.bones, poseScreenshots, motionTracks:capture.motionTracks };
  }
  const visualAB = {};
  if (process.env.SMOKE_VISUAL_AB === '1' && gunId === 'rifle') {
    const details = await evaluate(`(() => {
      const d = window.__arenaVisualDebug;
      if (!d?.world.current) return null;
      const { props, propByIndex, mesh, map } = d.world.current;
      mesh.geometry.computeBoundingBox();
      const Box3 = mesh.geometry.boundingBox.constructor;
      const inspect = (node) => {
        const box = new Box3().setFromObject(node);
        const center = box.getCenter(node.position.clone());
        return { name: node.name, boxMin: box.min.toArray(), boxMax: box.max.toArray(),
          distance: center.distanceTo(d.camera.position), scale: node.scale.toArray() };
      };
      const fittedProps = [...propByIndex].map(([index, node]) => ({ index, ...inspect(node) }));
      const fittingErrors = fittedProps.flatMap(({ index, boxMin, boxMax }) => {
        const solid = map.solids[index];
        const mismatch = [0, 1, 2].some((axis) =>
          Math.abs(boxMin[axis] - solid.min[axis]) > 0.035 ||
          Math.abs(boxMax[axis] - solid.max[axis]) > 0.035);
        return mismatch ? [{ index, expectedMin: solid.min, expectedMax: solid.max, boxMin, boxMax }] : [];
      });
      return { player: d.player.pos, yaw: d.player.yaw, pitch: d.player.pitch,
        camera: d.camera.position.toArray(), propCount: props.children.length,
        closestProps: props.children.map(inspect).sort((a,b) => a.distance - b.distance).slice(0, 15),
        fittedProps, fittingErrors };
    })()`);
    assert.ok(details, 'Visual A/B requires VITE_VISUAL_DIAGNOSTICS=1 during build');
    assert.deepEqual(details.fittingErrors, [], 'Rendered prop bounds must match collision boxes');
    visualAB.details = details;
    for (const [label, target] of [
      ['no-world-props', 'd.world.current.props'],
      ['no-map-surfaces', 'd.world.current.surfaces'],
      ['no-rifle', 'd.weaponView.models.rifle.group'],
      ['no-rifle-arms', "d.weaponView.models.rifle.group.getObjectByName('FPArms')"],
      ['no-rifle-body', "d.weaponView.models.rifle.group.getObjectByName('Body')"],
    ]) {
      const visible = await evaluate(`(() => {
        const d = window.__arenaVisualDebug;
        const node = ${target};
        if (!node) return null;
        const previous = node.visible;
        node.visible = false;
        return previous;
      })()`);
      assert.notEqual(visible, null, `Missing visual A/B target: ${label}`);
      await sleep(160);
      const alternate = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const alternatePath = screenshot.replace(/\.png$/i, `-${label}.png`);
      writeFileSync(alternatePath, Buffer.from(alternate.data, 'base64'));
      visualAB[label] = alternatePath;
      await evaluate(`(() => { const d = window.__arenaVisualDebug; ${target}.visible = ${JSON.stringify(visible)}; })()`);
    }
  }
  const componentScreenshots = {};
  if (gunId === 'rifle' && process.env.SMOKE_CAPTURE_COMPONENTS === '1') {
    for (const meshName of ['allViewmodel', 'Body', 'FPArms']) {
      const hidden = await evaluate(`(() => {
        const root = window.__arenaWeaponModels.rifle.viewRoot;
        const target = ${JSON.stringify(meshName)} === 'allViewmodel' ? root.parent : root.getObjectByName(${JSON.stringify(meshName)});
        target.visible = false;
        return Boolean(target);
      })()`);
      assert.equal(hidden, true, `Component ${meshName} not found`);
      await sleep(140);
      const alternate = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const alternatePath = screenshot.replace(/\.png$/i, `-${meshName}.png`);
      writeFileSync(alternatePath, Buffer.from(alternate.data, 'base64'));
      componentScreenshots[meshName] = alternatePath;
      await evaluate(`(() => {
        const root = window.__arenaWeaponModels.rifle.viewRoot;
        const target = ${JSON.stringify(meshName)} === 'allViewmodel' ? root.parent : root.getObjectByName(${JSON.stringify(meshName)});
        target.visible = true;
      })()`);
    }
  }
  // Only QA builds expose renderer.info and remote model instances. Sample the
  // real browser animation loop without claiming headless software GPU equals
  // desktop hardware FPS; save its counts as a reproducible visual baseline.
  let renderPerf = null;
  if (process.env.SMOKE_PERF === '1') {
    renderPerf = await evaluate(`(async () => {
      const d = window.__arenaVisualDebug;
      if (!d?.renderDiagnostics || !d?.remotes) throw new Error('SMOKE_PERF requires VITE_VISUAL_DIAGNOSTICS=1 npm run build');
      const start = performance.now();
      const intervals = [];
      let previous = null;
      let finished = false;
      return await new Promise((resolve) => {
        const timer = setTimeout(() => finish(performance.now()), ${perfDurationMs + 1000});
        function finish(now) {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          intervals.sort((a, b) => a - b);
          const p95 = intervals.length ? intervals[Math.min(intervals.length - 1, Math.floor(intervals.length * 0.95))] : null;
          resolve({
            frameSamples: intervals.length,
            durationMs: Math.round(now - start),
            meanFps: intervals.length ? Math.round(intervals.length * 1000 / (now - start)) : null,
            p95FrameMs: p95 === null ? null : Math.round(p95 * 10) / 10,
            framesOver16ms: intervals.filter(ms => ms > 16.67).length,
            renderer: { ...d.renderDiagnostics },
            remoteEntities: d.remotes.entities.size,
            riggedRemotes: [...d.remotes.entities.values()].filter((entity) => Boolean(entity.character)).length,
            tacticalAsset: Boolean(d.remotes.character.model?.tactical),
            tacticalRemotes: [...d.remotes.entities.values()].filter((entity) =>
              Boolean(entity.character?.root.getObjectByName('mixamorigHips_01'))).length,
            remoteRifles: [...d.remotes.entities.values()].filter((entity) =>
              Boolean(entity.character?.held.get('AK'))).length,
            tacticalMeshStats: (() => {
              const root = [...d.remotes.entities.values()].find(e => e.character?.tactical)?.character.root;
              if (!root) return null;
              const meshes = [];
              root.traverse(node => {
                if (node.isMesh || node.isSkinnedMesh) meshes.push({
                  name: node.name, castsShadow: node.castShadow,
                  skinned: Boolean(node.isSkinnedMesh),
                  visible: node.visible,
                  triangles: node.geometry?.index ? node.geometry.index.count / 3 : node.geometry?.attributes?.position?.count / 3,
                });
              });
              return { total: meshes.length, casters: meshes.filter(m => m.castsShadow).length,
                skinned: meshes.filter(m => m.skinned).length,
                top: meshes.sort((a, b) => b.triangles - a.triangles).slice(0, 15) };
            })(),
          });
        }
        function tick(now) {
          if (finished) return;
          if (previous !== null) intervals.push(now - previous);
          previous = now;
          if (now - start >= ${perfDurationMs}) finish(now);
          else requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
    })()`);
  }
  if (process.env.SMOKE_TACTICAL_QA === '1') {
    assert.equal(renderPerf?.tacticalAsset, true,
      `Tactical retargeting fell back to Soldier: ${JSON.stringify({ renderPerf, warnings })}`);
    assert.equal(renderPerf?.tacticalRemotes, requestedHumans - 1, 'A remote has no tactical 88-bone rig');
    assert.equal(renderPerf?.remoteRifles, requestedHumans - 1, 'A tactical character has no hand-mounted rifle');
    // The body includes one legitimate non-skinned shadow mesh. The many
    // separate M4A1 pieces should remain visible without shadow pass draws.
    assert.ok(renderPerf?.tacticalMeshStats?.casters <= renderPerf?.tacticalMeshStats?.skinned + 1,
      `Tactical rifle micro-meshes should not cast expensive shadows: ${JSON.stringify(renderPerf?.tacticalMeshStats)}`);
  }
  if (process.env.SMOKE_REQUIRE_GPU === '1') {
    const renderer = renderPerf?.renderer?.gpuRenderer ?? '';
    assert.match(renderer, /NVIDIA|AMD|Radeon|Intel|Apple|Adreno|Mali/i, `Hardware GPU not detected: ${renderer}`);
    assert.doesNotMatch(renderer, /SwiftShader|llvmpipe|WARP|Software/i, 'Browser is using software rendering');
  }
  console.log(JSON.stringify({ ok: true, roomCode, mode: requestedMode, map: guestJoin.mapId, teams: teamCount, guests: guestCount, players: lastSnapshot?.players.length, retakeUi, bombActive: bombState?.active ?? null, ...result, gunModel, rifleMeshInfo, bodyTriangleStats, mapAssetResponses: [...mapAssetResponses], pointerLocked, emulatedPointerLock, movementMeters, shotConfirmed, animationCheck, remoteReloadCheck, screenshot, tacticalCloseup, tacticalCloseupInfo, visualAB, componentScreenshots, renderPerf, playerPosition: lastSnapshot?.players.find((p) => p.id !== guestJoin.you.id)?.pos }));
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
