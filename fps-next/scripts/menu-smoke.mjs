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
const mobileHeaderShot = process.env.MENU_MOBILE_HEADER_SHOT ?? path.join(os.tmpdir(), 'arena-fps-menu-mobile-header.png');
const arsenalShot = process.env.MENU_ARSENAL_SHOT ?? path.join(os.tmpdir(), 'arena-fps-arsenal-desktop.png');
const surfShot = process.env.MENU_SURF_SHOT ?? path.join(os.tmpdir(), 'arena-fps-surf-desktop.png');
const utopiaShot = process.env.MENU_UTOPIA_SHOT ?? path.join(os.tmpdir(), 'arena-fps-utopia-desktop.png');
const practiceShot = process.env.MENU_PRACTICE_SHOT ?? path.join(os.tmpdir(), 'arena-fps-practice-desktop.png');
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
  async function browserClick(selector) {
    const center = await evalJs(`(() => {
      const rect = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`);
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: center.x, y: center.y });
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: center.x, y: center.y, button: 'left', clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: center.x, y: center.y, button: 'left', clickCount: 1 });
  }

  await call('Runtime.enable');
  await call('Page.enable');
  await call('Page.navigate', { url: `http://127.0.0.1:${port}/?debugAssets` });
  await poll(() => evalJs(`document.querySelector('#scheme-options [data-scheme="mouse"]') && !document.querySelector('#scheme-picker').classList.contains('hidden')`));
  await evalJs(`document.querySelector('#scheme-options [data-scheme="mouse"]').click()`);
  await poll(() => evalJs(`document.querySelector('#scheme-picker').classList.contains('hidden')`));
  await poll(() => evalJs(`(() => document.querySelector('.strike-hero')?.dataset.operator === 'tactical' && document.querySelector('.strike-hero')?.dataset.operatorWeapon === 'ready')()`));
  await poll(() => evalJs(`document.querySelector('.strike-hero')?.dataset.operatorMask === 'licensed'`));
  await poll(() => evalJs(`document.querySelector('#game')?.dataset.retakeObjective === 'licensed'`));
  await sleep(180);

  const inspect = `(() => ({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,hero:!!document.querySelector('.strike-hero'),operator:document.querySelector('.strike-hero')?.dataset.operator,weapon:document.querySelector('.strike-hero')?.dataset.operatorWeapon,modes:document.querySelectorAll('[data-create-mode]').length,menuVisible:!document.querySelector('#menu').classList.contains('hidden'),buttons:[...document.querySelectorAll('[data-create-mode]')].every((el)=>el.getBoundingClientRect().width>0)}))()`;
  const desktop = await evalJs(inspect);
  const poseProbe = JSON.parse(await evalJs(`document.querySelector('.strike-hero')?.dataset.poseProbe`) || '{}');
  assert.ok(poseProbe.gripErrors?.length === 2 && poseProbe.gripErrors.every((error) => Number.isFinite(error) && error < 0.08),
    `Operator fists must align to the rifle grip sockets: ${JSON.stringify(poseProbe)}`);
  assert.ok(poseProbe.spareMagazineHidden,
    'Lobby rifle spare magazine must not float under the operator');
  assert.ok(poseProbe.muzzle?.[1] - poseProbe.stock?.[1] > 0.25,
    `Lobby muzzle must angle modestly upward from the stock: ${JSON.stringify(poseProbe)}`);
  assert.ok(desktop.hero && desktop.modes >= 6 && desktop.menuVisible && desktop.buttons);
  assert.equal(await evalJs(`document.querySelector('#server-state').textContent`), 'CONNECT TO PLAY');
  assert.ok(desktop.scrollWidth <= desktop.width + 2, `Desktop horizontal overflow: ${JSON.stringify(desktop)}`);
  // The install CTA must be functional, and its assets served by the production
  // backend. A simulated browser event covers the native-prompt lifecycle.
  const installManifest = await evalJs(`fetch('/manifest.webmanifest').then(async (r) => ({status:r.status,body:await r.json()}))`);
  assert.equal(installManifest.status, 200);
  assert.equal(installManifest.body.display, 'standalone');
  assert.deepEqual(installManifest.body.icons.map((icon) => icon.sizes), ['192x192', '512x512']);
  for (const icon of installManifest.body.icons) {
    assert.equal(await evalJs(`fetch(${JSON.stringify(icon.src)}).then((r)=>r.status)`), 200);
  }
  assert.equal(await evalJs(`fetch('/app-icon.svg').then((r)=>r.status)`), 200);
  const installDesktop = await evalJs(`(() => {
    const button = document.querySelector('.strike-app-install-desktop');
    const rect = button.getBoundingClientRect();
    const nav = document.querySelector('.strike-nav').getBoundingClientRect();
    return { visible: rect.width > 0, right: rect.right, left: rect.left, navRight: nav.right };
  })()`);
  assert.ok(installDesktop.visible && installDesktop.right <= desktop.width + 2
    && installDesktop.left >= installDesktop.navRight - 2,
  `Desktop GET APP must fit beside the navigation: ${JSON.stringify(installDesktop)}`);
  await evalJs(`(() => {
    const event = new Event('beforeinstallprompt', {cancelable:true});
    event.prompt = async () => { window.__installPromptCalled = true; };
    event.userChoice = Promise.resolve({outcome:'accepted'});
    window.dispatchEvent(event);
    document.querySelector('.strike-app-install-desktop').click();
  })()`);
  assert.ok(await poll(() => evalJs(`window.__installPromptCalled === true`)));
  await evalJs(`document.querySelector('.strike-app-install-desktop').click()`);
  assert.equal(await evalJs(`document.querySelector('#install-app-dialog').open`), true);
  assert.match(await evalJs(`document.querySelector('#install-dialog-help').textContent`), /browser menu|Safari/);
  await evalJs(`document.querySelector('#install-dialog-close').click()`);
  assert.equal(await evalJs(`document.querySelector('#install-app-dialog').open`), false);
  // Sound controls and both volume sliders share one persisted setting. The
  // latest audible level survives muting, including a zeroed volume slider.
  assert.equal(await evalJs(`document.querySelector('#btn-sound').getAttribute('aria-pressed')`), 'false');
  await evalJs(`document.querySelector('#btn-sound').click()`);
  assert.deepEqual(await evalJs(`(() => ({
    volume: JSON.parse(localStorage.getItem('arena.settings.v1')).volume,
    slider: document.querySelector('#vol').value,
    pauseSlider: document.querySelector('#p-vol').value,
    pressed: document.querySelector('#btn-sound').getAttribute('aria-pressed'),
  }))()`), { volume: 0, slider: '0', pauseSlider: '0', pressed: 'true' });
  await evalJs(`document.querySelector('#btn-sound').click()`);
  assert.equal(await evalJs(`JSON.parse(localStorage.getItem('arena.settings.v1')).volume`), 0.7);
  await evalJs(`(() => { const slider=document.querySelector('#vol'); slider.value='35'; slider.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await evalJs(`document.querySelector('#btn-sound').click()`);
  assert.deepEqual(await evalJs(`(() => { const s=JSON.parse(localStorage.getItem('arena.settings.v1')); return [s.volume,s.lastAudibleVolume]; })()`), [0, 0.35]);
  await evalJs(`document.querySelector('#btn-sound').click()`);
  assert.equal(await evalJs(`document.querySelector('#p-vol').value`), '35');
  await evalJs(`(() => { const slider=document.querySelector('#vol'); slider.value='0'; slider.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await evalJs(`document.querySelector('#btn-sound').click()`);
  assert.equal(await evalJs(`JSON.parse(localStorage.getItem('arena.settings.v1')).volume`), 0.35);
  // Use real CDP mouse input: synthetic element.click() is not a trusted
  // activation for requestFullscreen in Chrome.
  const fullscreenSupported = await evalJs(`document.fullscreenEnabled`);
  if (fullscreenSupported) {
    await browserClick('#btn-fullscreen');
    await poll(() => evalJs(`Boolean(document.fullscreenElement)`), 5000);
    assert.equal(await evalJs(`document.querySelector('#btn-fullscreen').getAttribute('aria-pressed')`), 'true');
    await browserClick('#btn-fullscreen');
    await poll(() => evalJs(`!document.fullscreenElement`), 5000);
    assert.equal(await evalJs(`document.querySelector('#btn-fullscreen').getAttribute('aria-pressed')`), 'false');
  }
  // Presence is backed by /api/rooms, not a fake online count.
  await poll(() => evalJs(`document.querySelector('#online-count')?.textContent === '0 ONLINE' && [...document.querySelectorAll('[data-online-mode]')].every((el) => el.textContent === '0 ONLINE')`));
  // The visible lobby identity panel edits the same persisted guest name as room creation.
  assert.ok(await evalJs(`!!document.querySelector('#hero-callsign')?.offsetWidth`));
  await evalJs(`(() => { document.querySelector('#hero-callsign').value='GuestAce'; document.querySelector('#btn-guest-profile').click(); })()`);
  assert.equal(await evalJs(`document.querySelector('#nickname').value`), 'GuestAce');
  assert.equal(await evalJs(`JSON.parse(localStorage.getItem('arena.settings.v1')).nickname`), 'GuestAce');
  await evalJs(`(() => { const el=document.querySelector('#nickname'); el.value='SecondGuest'; el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  assert.equal(await evalJs(`document.querySelector('#hero-callsign').value`), 'SecondGuest');
  const railBottom = await evalJs(`document.querySelector('#btn-practice').getBoundingClientRect().bottom`);
  const desktopHeight = await evalJs(`innerHeight`);
  assert.ok(railBottom <= desktopHeight - 8,
    `Desktop rail cut off its final mode at ${railBottom}px in ${desktopHeight}px viewport`);
  assert.ok(await evalJs(`document.querySelector('#btn-quickplay').closest('.strike-bottom-strip') !== null`),
    'Battle Royale quick play remains accessible below the reference rail');
  await capture(desktopShot);

  // Inspect a real licensed model, equip it, and verify settings persistence.
  const available = await evalJs(`document.querySelectorAll('#arsenal-gun-list [data-weapon-id]').length`);
  assert.ok(available >= 12, `Arsenal list only contains ${available} weapons`);
  await evalJs(`document.querySelector('[data-nav-target="arsenal"]').click()`);
  const initialPreview = await poll(() => evalJs(`document.querySelector('#arsenal-stage').dataset.modelState === 'ready' ? document.querySelector('#arsenal-name').textContent : null`), 25000);
  assert.ok(initialPreview);
  await evalJs(`document.querySelector('#arsenal-filters [data-filter="sniper"]').click()`);
  await evalJs(`document.querySelector('#arsenal-gun-list [data-weapon-id="sniper"]').click()`);
  await poll(() => evalJs(`document.querySelector('#arsenal-stage').dataset.modelState === 'ready'`), 25000);
  assert.equal(await evalJs(`document.querySelector('#arsenal-stage').dataset.modelFile`),
    'models/guns-real/ChassisSniper_CC0.glb', 'Arsenal should show the detailed CC0 sniper mesh');
  // Measure moving parts of the rendered, cloned GLB during the real Arsenal
  // animation loop. A correct model path alone cannot detect a frozen preview.
  const magazinePreviewOffset = await poll(() => evalJs(`(() => {
    const rig = window.__arenaArsenalSniperRig;
    if (!rig) return 0;
    const delta = rig.magazine.position.distanceTo(rig.magRest);
    return delta > 0.04 ? delta : 0;
  })()`), 9000);
  const boltPreviewOffset = await poll(() => evalJs(`(() => {
    const rig = window.__arenaArsenalSniperRig;
    if (!rig) return 0;
    const delta = rig.bolt.position.distanceTo(rig.boltRest);
    return delta > 0.04 ? delta : 0;
  })()`), 9000);
  await poll(() => evalJs(`(() => {
    const rig = window.__arenaArsenalSniperRig;
    return rig && rig.magazine.position.distanceTo(rig.magRest) < 0.001
      && rig.bolt.position.distanceTo(rig.boltRest) < 0.001;
  })()`), 9000);
  await evalJs(`document.querySelector('#arsenal-equip').click()`);
  assert.equal(await evalJs(`JSON.parse(localStorage.getItem('arena.settings.v1')).primaryId`), 'sniper');
  assert.equal(await evalJs(`document.querySelector('#arsenal-equipped-status').textContent`), 'EQUIPPED');
  assert.equal(await evalJs(`document.querySelector('#arsenal-gun-list [data-weapon-id="sniper"]').getAttribute('aria-pressed')`), 'true');
  await capture(arsenalShot);

  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(300);
  const mobile = await evalJs(inspect);
  assert.ok(mobile.hero && mobile.menuVisible && mobile.buttons);
  assert.ok(mobile.scrollWidth <= mobile.width + 2, `Mobile horizontal overflow: ${JSON.stringify(mobile)}`);
  assert.ok(await evalJs(`document.querySelector('#arsenal-stage').getBoundingClientRect().width <= innerWidth`));
  const mobileNav = await evalJs(`(() => {
    const targets = ['arsenal','play-modes','lobby-news','invite-panel','settings'];
    return targets.map((target) => {
      const button = [...document.querySelectorAll('.strike-nav [data-nav-target]')].find((el) => el.dataset.navTarget === target);
      const rect = button?.getBoundingClientRect();
      const style = button ? getComputedStyle(button) : null;
      return { target, visible: !!rect?.width && !!rect?.height && style?.visibility !== 'hidden' && style?.display !== 'none', width: rect?.width ?? 0 };
    });
  })()`);
  assert.ok(mobileNav.every((item) => item.visible && item.width >= 25), `Mobile navigation destinations missing or too small: ${JSON.stringify(mobileNav)}`);
  await evalJs(`document.querySelector('.strike-header').scrollIntoView({block:'start',behavior:'instant'})`);
  await sleep(180);
  const mobileNavPosition = await evalJs(`(() => {
    const header = document.querySelector('.strike-header').getBoundingClientRect();
    const buttons = [...document.querySelectorAll('.strike-nav button')].map((el) => el.getBoundingClientRect());
    return { headerTop: header.top, headerBottom: header.bottom, viewportHeight: innerHeight,
      maxRight: Math.max(...buttons.map((rect) => rect.right)),
      minLeft: Math.min(...buttons.map((rect) => rect.left)) };
  })()`);
  assert.ok(mobileNavPosition.headerTop >= -2 && mobileNavPosition.headerBottom <= mobileNavPosition.viewportHeight
    && mobileNavPosition.minLeft >= 0 && mobileNavPosition.maxRight <= 390,
  `Mobile navigation must be on screen with no clipped links: ${JSON.stringify(mobileNavPosition)}`);
  assert.ok(await evalJs(`document.querySelector('.strike-app-install-mobile').getBoundingClientRect().width > 0`));
  await evalJs(`document.querySelector('.strike-app-install-mobile').click()`);
  const mobileInstallDialog = await evalJs(`(() => {
    const dialog = document.querySelector('#install-app-dialog');
    const rect = dialog.getBoundingClientRect();
    return {open:dialog.open,left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom};
  })()`);
  assert.ok(mobileInstallDialog.open && mobileInstallDialog.left >= 0
    && mobileInstallDialog.right <= 390 && mobileInstallDialog.top >= 0
    && mobileInstallDialog.bottom <= 844,
  `Mobile install instructions must remain inside viewport: ${JSON.stringify(mobileInstallDialog)}`);
  await evalJs(`document.querySelector('#install-dialog-done').click()`);
  await evalJs(`document.querySelector('.strike-nav [data-nav-target="settings"]').click()`);
  assert.ok(await poll(() => evalJs(`document.getElementById('settings').open`)), 'Mobile settings navigation should open the actual settings controls');
  await evalJs(`document.querySelector('.strike-nav [data-nav-target="play-modes"]').click()`);
  assert.ok(await evalJs(`document.querySelector('.strike-nav [data-nav-target="play-modes"]').classList.contains('active')`));
  await evalJs(`document.querySelector('.strike-header').scrollIntoView({block:'start',behavior:'instant'})`);
  await sleep(180);
  await capture(mobileHeaderShot);
  // Mobile capture must show the actual first-screen lobby and mode rail;
  // the arsenal was already captured separately at desktop resolution.
  await evalJs(`document.querySelector('.strike-hero').scrollIntoView({block:'start',behavior:'instant'})`);
  await sleep(180);
  assert.ok(await evalJs(`document.querySelector('.strike-hero').getBoundingClientRect().top <= 2`));
  await capture(mobileShot);
  await call('Emulation.clearDeviceMetricsOverride');

  await evalJs(`(() => { document.querySelector('#nickname').value='MenuSmoke'; document.querySelector('[data-create-mode="duel"]').click(); })()`);
  const duel = await poll(() => evalJs(`(() => !document.querySelector('#lobby').classList.contains('hidden') && document.querySelector('#lobby-mode').textContent.includes('Sniper') ? {code:document.querySelector('#lobby-code').textContent,slots:document.querySelector('#lobby-count').textContent} : null)()`));
  assert.match(duel.slots, /1\s*\/\s*2/);
  assert.equal(await evalJs(`document.querySelector('#server-state').textContent`), 'SERVER CONNECTED');
  const onlineDuel = await poll(() => evalJs(`fetch('/api/rooms', {cache:'no-store'}).then((r)=>r.json()).then((data)=>data.rooms.some((room)=>room.code === document.querySelector('#lobby-code').textContent && room.mode === 'duel' && room.humans === 1))`));
  assert.ok(onlineDuel, 'Public room endpoint must count connected human player');
  await evalJs(`document.dispatchEvent(new Event('visibilitychange'))`);
  await poll(() => evalJs(`document.querySelector('#online-count')?.textContent === '1 ONLINE' && document.querySelector('[data-online-mode="duel"]')?.textContent === '1 ONLINE'`));
  await evalJs(`document.querySelector('#btn-leave').click()`);
  await poll(() => evalJs(`!document.querySelector('#menu').classList.contains('hidden')`));
  await poll(() => evalJs(`fetch('/api/rooms', {cache:'no-store'}).then((r)=>r.json()).then((data)=>data.rooms.every((room)=>room.humans===0))`));
  await evalJs(`document.dispatchEvent(new Event('visibilitychange'))`);
  await poll(() => evalJs(`document.querySelector('#online-count')?.textContent === '0 ONLINE' && document.querySelector('[data-online-mode="duel"]')?.textContent === '0 ONLINE'`));

  // Exercise Surf in the actual production WebGL scene, including movement and
  // checkpoint/full resets. Headless Chrome may refuse native pointer lock;
  // the same test-only DOM lock simulation used in browser-smoke keeps keyboard
  // events routed through the real input module and fixed-step game loop.
  await evalJs(`document.activeElement?.blur()`);
  await evalJs(`document.querySelector('#btn-surf').click()`);
  await poll(() => evalJs(`document.querySelector('#menu').classList.contains('hidden') && !document.querySelector('#surf-stats').classList.contains('hidden')`));
  const nativeSurfLock = await poll(() => evalJs(`document.pointerLockElement === document.querySelector('#game')`), 2000).catch(() => false);
  if (!nativeSurfLock) {
    await evalJs(`(() => {
      Object.defineProperty(document, 'pointerLockElement', {configurable:true, get:()=>document.querySelector('#game')});
      document.dispatchEvent(new Event('pointerlockchange'));
    })()`);
  }
  await poll(() => evalJs(`document.querySelector('#pause').classList.contains('hidden')`));
  assert.ok(await evalJs(`!!document.querySelector('#game').getContext('webgl2')`), 'Surf needs a WebGL2 scene');
  assert.equal(await evalJs(`document.querySelector('#surf-checkpoints').textContent`), '0 / 3');
  await call('Input.dispatchKeyEvent', {type:'keyDown',key:'w',code:'KeyW',windowsVirtualKeyCode:87});
  await sleep(850);
  await call('Input.dispatchKeyEvent', {type:'keyUp',key:'w',code:'KeyW',windowsVirtualKeyCode:87});
  const surfMotion = await evalJs(`({time:document.querySelector('#surf-time').textContent,speed:+document.querySelector('#surf-speed').textContent})`);
  assert.ok(surfMotion.time !== '00:00.00' && surfMotion.speed > 0, `Surf did not advance: ${JSON.stringify(surfMotion)}`);
  await capture(surfShot);
  await call('Input.dispatchKeyEvent', {type:'keyDown',key:'r',code:'KeyR',windowsVirtualKeyCode:82});
  await call('Input.dispatchKeyEvent', {type:'keyUp',key:'r',code:'KeyR',windowsVirtualKeyCode:82});
  await poll(() => evalJs(`document.querySelector('#surf-event').textContent === 'CHECKPOINT RESET'`));
  assert.equal(await evalJs(`document.querySelector('#surf-falls').textContent`), '1');
  await call('Input.dispatchKeyEvent', {type:'keyDown',key:'R',code:'KeyR',windowsVirtualKeyCode:82,modifiers:8});
  await call('Input.dispatchKeyEvent', {type:'keyUp',key:'R',code:'KeyR',windowsVirtualKeyCode:82,modifiers:8});
  await poll(() => evalJs(`document.querySelector('#surf-event').textContent === 'START'`));
  assert.equal(await evalJs(`document.querySelector('#surf-falls').textContent`), '0');
  // Leave through the same pause-menu action used by players and verify that
  // the Surf-specific UI is torn down before entering another solo mode.
  await evalJs(`document.querySelector('#btn-quit').click()`);
  await poll(() => evalJs(`!document.querySelector('#menu').classList.contains('hidden') && document.querySelector('#surf-stats').classList.contains('hidden')`));
  await evalJs(`document.querySelector('#btn-surf-utopia').click()`);
  await poll(() => evalJs(`document.querySelector('#menu').classList.contains('hidden') && document.querySelector('#surf-course-title').textContent.includes('UTOPIA')`));
  assert.equal(await evalJs(`document.querySelector('#surf-checkpoints').textContent`), '0 / 4');
  assert.ok(await evalJs(`!!document.querySelector('#game').getContext('webgl2')`));
  const knifeModel = await poll(() => evalJs(`window.__arenaWeaponModels?.knife?.status === 'ready' ? window.__arenaWeaponModels.knife : null`));
  assert.match(knifeModel.source, /models\/guns-real\/CombatKnife_CC0\.glb$/);
  assert.ok(knifeModel.meshes >= 3, 'Detailed combat knife should expose blade, guard and handle');
  await sleep(250);
  await capture(utopiaShot);
  await evalJs(`document.querySelector('#btn-quit').click()`);
  await poll(() => evalJs(`!document.querySelector('#menu').classList.contains('hidden') && document.querySelector('#surf-stats').classList.contains('hidden')`));
  await evalJs(`document.querySelector('#arsenal-practice').click()`);
  assert.ok(await poll(() => evalJs(`document.querySelector('#menu').classList.contains('hidden') && !document.querySelector('#game').classList.contains('hidden')`)));
  const sniperModel = await poll(() => evalJs(`window.__arenaWeaponModels?.sniper?.status === 'ready' ? window.__arenaWeaponModels.sniper : null`));
  assert.match(sniperModel.source, /models\/guns-real\/ChassisSniper_CC0\.glb$/);
  assert.ok(sniperModel.meshes >= 10, 'Detailed sniper model should contain multiple visible components');
  await sleep(250);
  await capture(practiceShot);
  // Real pause menu exposes the configurable shooting drill. Changing its
  // controls must immediately rebuild bots and persist across sessions.
  // Surf's fallback headless pointer lock is a configurable DOM getter. Remove
  // that test shim before asking Chrome to release practice's lock.
  await evalJs(`(() => {
    if (Object.getOwnPropertyDescriptor(document, 'pointerLockElement')?.configurable) delete document.pointerLockElement;
    document.exitPointerLock();
    document.dispatchEvent(new Event('pointerlockchange'));
  })()`);
  await poll(() => evalJs(`!document.querySelector('#pause').classList.contains('hidden')`));
  assert.equal(await evalJs(`document.querySelector('#pause-range-settings').classList.contains('hidden')`), false);
  const drill = await evalJs(`(() => {
    for (const [id, value] of [
      ['range-bot-count','3'],['range-distance','10'],['range-movement','run'],['range-armor','heavy'],
    ]) { const field=document.getElementById(id); field.value=value; field.dispatchEvent(new Event('change',{bubbles:true})); }
    const ammo=document.getElementById('range-infinite-ammo'); ammo.checked=true; ammo.dispatchEvent(new Event('change',{bubbles:true}));
    return {label:document.getElementById('pr-drill').textContent, saved:JSON.parse(localStorage.getItem('crown-strike-range-v1'))};
  })()`);
  assert.match(drill.label, /3 BOTS · 10M · RUN · HEAVY ARMOR/);
  assert.deepEqual(drill.saved, {botCount:3,distance:10,movement:'run',armor:'heavy',infiniteAmmo:true});
  assert.deepEqual(errors, [], `Browser errors: ${errors.join('; ')}`);
  console.log(JSON.stringify({ ok: true, desktop, poseProbe, fullscreenSupported, soundVerified: true, mobile, mobileNav, mobileNavPosition, duel, arsenal: { available, initialPreview, equipped: 'sniper', magazinePreviewOffset, boltPreviewOffset }, sniperModel, knifeModel, surf: { ...surfMotion, nativePointerLock: nativeSurfLock, resetVerified: true, utopiaCheckpointCount: 4 }, drill, desktopShot, mobileShot, mobileHeaderShot, arsenalShot, surfShot, utopiaShot, practiceShot }));
}

try { await main(); }
catch (error) { console.error(error.stack ?? error.message); process.exitCode = 1; }
finally {
  socket?.terminate();
  for (const child of children.reverse()) if (child.exitCode === null) child.kill();
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 3 }); } catch { /* Chrome may be shutting down. */ }
}
