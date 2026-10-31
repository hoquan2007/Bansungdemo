// Lazy-rendered weapon inspection workbench. Uses the same independently
// licensed models and server-approved primary IDs as multiplayer loadouts.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PRIMARY_IDS, WEAPON_TYPES, getWeapon } from '@shared/weapons.js';
import { loadModel, instantiate } from './models.js';
import { modelSpecFor, createChassisSniperRig, poseChassisSniper } from './weaponView.js';

const ICONS = { rifle: '⌁', smg: '≋', shotgun: '✣', sniper: '⌖', lmg: '✦', pistol: '●' };
const TYPE_NAMES = Object.fromEntries(WEAPON_TYPES.map((type) => [type.id, type.name]));

function stat(label, display, value, max) {
  const row = document.createElement('div');
  row.className = 'arsenal-stat';
  const line = document.createElement('span');
  line.append(document.createTextNode(label));
  const number = document.createElement('b');
  number.textContent = display;
  line.appendChild(number);
  const bar = document.createElement('div');
  bar.className = 'arsenal-stat-track';
  const fill = document.createElement('div');
  fill.className = 'arsenal-stat-fill';
  fill.style.width = `${Math.max(2, Math.min(100, (value / max) * 100))}%`;
  bar.appendChild(fill);
  row.append(line, bar);
  return row;
}

function proceduralGun(weapon) {
  // Placeholder if the network or model decoder fails. 3D inspection remains usable.
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: weapon.viewColor ?? 0x454b45, metalness: 0.5, roughness: 0.45 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x161e1c, metalness: 0.4, roughness: 0.6 });
  const box = (x, y, z, w, h, d, material = metal) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    group.add(mesh);
  };
  const short = weapon.type === 'pistol' || weapon.type === 'smg';
  const length = short ? 2 : weapon.type === 'sniper' ? 3.3 : 2.75;
  box(0, 0, 0, length * 0.63, .32, .26);
  box(length * .36, -.015, 0, length * .3, .095, .095, dark);
  box(-length * .38, -.025, 0, length * .22, .27, .23, dark);
  box(-.25, -.38, 0, .29, .48, .21, dark);
  if (weapon.type !== 'pistol') box(.12, -.4, 0, .19, .48, .19, dark);
  if (weapon.type === 'sniper') box(.02, .25, 0, .9, .16, .18, dark);
  return group;
}

/** Attaches inventory UI to the menu and bridges equips into existing game state. */
export function mountArsenal({ onEquip, onPractice, getEquipped }) {
  const section = document.getElementById('arsenal');
  if (!section) return { refresh() {} };
  const menu = document.getElementById('menu');
  const canvas = document.getElementById('arsenal-preview');
  const stage = document.getElementById('arsenal-stage');
  const filters = document.getElementById('arsenal-filters');
  const list = document.getElementById('arsenal-gun-list');
  const equip = document.getElementById('arsenal-equip');
  const practice = document.getElementById('arsenal-practice');
  const status = document.getElementById('arsenal-equipped-status');
  const modelState = document.getElementById('arsenal-model-state');
  const modelSource = document.getElementById('arsenal-model-source');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const debugAssets = new URLSearchParams(location.search).has('debugAssets');
  let selected = getEquipped();
  let filter = 'all';
  let visible = false;
  let intersecting = false;
  let renderer;
  let contextReady = true;
  let scene;
  let camera;
  let display;
  let mountedModel;
  let sniperPreview = null;
  let sniperPreviewStarted = 0;
  let version = 0;
  let previewId = null;
  let frame = 0;
  let angle = 0;
  let dragging = false;
  let lastPointer = 0;

  const weapons = PRIMARY_IDS.map(getWeapon);
  document.getElementById('arsenal-count').textContent = `${weapons.length} READY`;

  function renderEquipped() {
    const equipped = selected === getEquipped();
    equip.disabled = equipped;
    equip.textContent = equipped ? 'EQUIPPED ✓' : 'EQUIP WEAPON →';
    status.classList.toggle('active', equipped);
    status.textContent = equipped ? 'EQUIPPED' : 'AVAILABLE';
    for (const button of list.querySelectorAll('[data-weapon-id]')) {
      button.classList.toggle('active', button.dataset.weaponId === selected);
      button.setAttribute('aria-pressed', String(button.dataset.weaponId === selected));
      const mark = button.querySelector('.arsenal-gun-mark');
      if (mark) mark.textContent = button.dataset.weaponId === getEquipped() ? '✓' : '↗';
    }
  }

  function renderStats(weapon) {
    document.getElementById('arsenal-name').textContent = weapon.name.toUpperCase();
    document.getElementById('arsenal-class').textContent = `PRIMARY / ${TYPE_NAMES[weapon.type]?.toUpperCase() ?? weapon.type.toUpperCase()}`;
    const behavior = weapon.auto ? 'Automatic' : 'Semi-automatic / manual';
    const falloff = weapon.falloffEnd >= 110 ? 'long-range' : weapon.falloffEnd >= 55 ? 'mid-range' : 'close-range';
    document.getElementById('arsenal-description').textContent = `${behavior} · ${falloff} configuration. Select EQUIP to use this weapon in multiplayer, or enter the practice range to test it.`;
    const container = document.getElementById('arsenal-stats');
    container.replaceChildren(
      stat('Damage', `${weapon.damage}${weapon.pellets > 1 ? ` ×${weapon.pellets}` : ''}`, weapon.damage * (weapon.pellets > 1 ? Math.min(weapon.pellets, 4) : 1), 110),
      stat('Fire rate', `${weapon.rpm} RPM`, weapon.rpm, 1200),
      stat('Range', `${weapon.range} M`, weapon.range, 220),
      stat('Magazine', weapon.mag === Infinity ? '∞' : String(weapon.mag), weapon.mag === Infinity ? 100 : weapon.mag, 100),
    );
  }

  function renderList() {
    list.replaceChildren();
    const filtered = filter === 'all' ? weapons : weapons.filter((weapon) => weapon.type === filter);
    for (const weapon of filtered) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'arsenal-gun';
      button.dataset.weaponId = weapon.id;
      button.setAttribute('aria-pressed', String(weapon.id === selected));
      const icon = document.createElement('span');
      icon.className = 'arsenal-gun-icon';
      icon.textContent = ICONS[weapon.type] ?? '✛';
      const copy = document.createElement('span');
      copy.className = 'arsenal-gun-copy';
      const name = document.createElement('strong');
      name.textContent = weapon.name.toUpperCase();
      const small = document.createElement('small');
      small.textContent = `${weapon.damage} DMG / ${weapon.rpm} RPM`;
      copy.append(name, small);
      const mark = document.createElement('span');
      mark.className = 'arsenal-gun-mark';
      button.append(icon, copy, mark);
      button.addEventListener('click', () => inspect(weapon.id));
      list.appendChild(button);
    }
    renderEquipped();
  }

  for (const type of [{ id: 'all', name: 'ALL' }, ...WEAPON_TYPES]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'arsenal-filter';
    button.textContent = type.id === 'all' ? 'ALL' : type.name.replace('Assault ', '').replace(' & Marksman', '');
    button.dataset.filter = type.id;
    button.addEventListener('click', () => {
      filter = type.id;
      for (const item of filters.children) {
        item.classList.toggle('active', item === button);
        item.setAttribute('aria-pressed', String(item === button));
      }
      renderList();
    });
    button.classList.toggle('active', type.id === 'all');
    button.setAttribute('aria-pressed', String(type.id === 'all'));
    filters.appendChild(button);
  }

  function clearModel() {
    if (debugAssets) window.__arenaArsenalSniperRig = null;
    if (!mountedModel) return;
    sniperPreview = null;
    display.remove(mountedModel);
    const materials = new Set();
    mountedModel.traverse((node) => {
      if (node.isMesh) {
        if (node.userData.arsenalGenerated) node.geometry.dispose();
        // instantiate() clones materials but references shared textures/geometries.
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
          if (material) materials.add(material);
        }
      }
    });
    for (const material of materials) material.dispose();
    mountedModel = null;
  }

  function fitModel(root, yaw = 0) {
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const extent = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(extent) || extent < .001) return false;
    const scale = 4.2 / extent;
    root.scale.multiplyScalar(scale);
    root.position.copy(box.getCenter(new THREE.Vector3()).multiplyScalar(-scale));
    const pivot = new THREE.Group();
    pivot.rotation.y = yaw;
    pivot.rotation.z = -0.045;
    pivot.add(root);
    display.add(pivot);
    mountedModel = pivot;
    return true;
  }

  function draw() {
    if (renderer && contextReady && visible) renderer.render(scene, camera);
  }

  function mountFallback(weapon) {
    const fallback = proceduralGun(weapon);
    fallback.traverse((node) => { if (node.isMesh) node.userData.arsenalGenerated = true; });
    fitModel(fallback);
    stage.dataset.modelState = 'fallback';
    modelState.textContent = '3D FALLBACK';
    modelSource.textContent = 'BUILT-IN WEAPON SILHOUETTE';
    draw();
  }

  async function loadSelected() {
    if (!renderer || !contextReady || !visible || previewId === selected) return;
    const request = ++version;
    previewId = selected;
    clearModel();
    modelState.textContent = 'LOADING MODEL';
    stage.dataset.modelState = 'loading';
    modelSource.textContent = 'LOADING LICENSED MODEL';
    const weapon = getWeapon(selected);
    const spec = modelSpecFor(selected);
    const candidates = selected === 'sniper'
      ? [spec, { url: 'models/guns-real/BoltSniper_CC0.glb', forward: '+z' },
        { url: 'models/guns-obj/SniperRifle_1.obj', forward: '+x' }]
      : [spec];
    let model = null;
    let activeSpec = null;
    for (const candidate of candidates) {
      if (!candidate) continue;
      model = await loadModel(candidate.url);
      if (version !== request || !renderer || !contextReady) return;
      if (model) { activeSpec = candidate; break; }
    }
    if (version !== request || !renderer || !contextReady) return;
    if (model) {
      const cloned = instantiate(model);
      const yaw = activeSpec.forward === '+z' ? Math.PI / 2
        : activeSpec.forward === '-x' ? Math.PI : activeSpec.forward === '-z' ? -Math.PI / 2 : 0;
      if (fitModel(cloned, yaw)) {
        if (selected === 'sniper' && /ChassisSniper_CC0\.glb$/i.test(activeSpec.url)) {
          sniperPreview = { sniperRig: createChassisSniperRig(cloned, model.animations) };
          sniperPreviewStarted = performance.now();
          // Expose only the authored animation's local clone to browser QA.
          if (debugAssets) window.__arenaArsenalSniperRig = sniperPreview.sniperRig;
        }
        stage.dataset.modelState = 'ready';
        stage.dataset.modelFile = activeSpec.url;
        modelState.textContent = 'MODEL READY';
        modelSource.textContent = '3D / LICENSED ASSET';
        draw();
        return;
      }
    }
    mountFallback(weapon);
  }

  function resize() {
    if (!renderer || !contextReady) return;
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (width < 2 || height < 2) return;
    camera.aspect = width / height;
    // Keep the longest rifle readable at both wide desktop and narrow mobile sizes.
    const halfFov = (camera.fov * Math.PI / 180) / 2;
    const distance = 4.2 / (2 * Math.tan(halfFov) * camera.aspect * .73);
    camera.position.set(0, .35, Math.max(3.7, Math.min(10.5, distance)));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    draw();
  }

  function initializeRenderer() {
    if (renderer) return contextReady;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch {
      stage.dataset.modelState = 'unavailable';
      modelState.textContent = '3D PREVIEW UNAVAILABLE';
      return false;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // Preserve contrast in the PBR alloy and polymer finishes. The old
    // overbright studio flattened detailed rifles into white silhouettes.
    renderer.toneMappingExposure = 1.08;
    scene = new THREE.Scene();
    // Metal barrels, glass and weapon optics need reflection information. The
    // preview has no world environment, so generate a small studio probe once.
    const studio = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(studio, 0.05).texture;
    studio.dispose();
    pmrem.dispose();
    camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(0.3, 1.0, 8.4);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.HemisphereLight(0xf4f1e8, 0x374236, 1.25));
    const key = new THREE.DirectionalLight(0xffcc93, 1.8);
    key.position.set(-4, 6, 7);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x9cbece, 1.25);
    rim.position.set(4, 4, -4);
    scene.add(rim);
    display = new THREE.Group();
    scene.add(display);
    resize();
    return true;
  }

  function tick(now) {
    frame = 0;
    if (!visible) return;
    if (sniperPreview?.sniperRig && !reduceMotion.matches) {
      // Show the actual detachable magazine and bolt moving while inspecting;
      // a long resting interval keeps the detailed rifle easy to examine.
      const cycle = (now - sniperPreviewStarted) % 7600;
      const progress = cycle >= 1100 && cycle < 4100 ? (cycle - 1100) / 3000 : 0;
      poseChassisSniper(sniperPreview, progress, now);
    }
    display.rotation.y = angle + (reduceMotion.matches || dragging ? 0 : Math.sin(now * .0002) * .12);
    draw();
    if (!reduceMotion.matches) frame = requestAnimationFrame(tick);
  }

  function updateVisibility() {
    const shouldShow = contextReady && intersecting && !document.hidden && !menu.classList.contains('hidden');
    if (shouldShow === visible) return;
    visible = shouldShow;
    cancelAnimationFrame(frame);
    frame = 0;
    if (!visible || !initializeRenderer()) return;
    resize();
    loadSelected();
    if (!reduceMotion.matches) frame = requestAnimationFrame(tick);
  }

  function inspect(id) {
    if (!PRIMARY_IDS.includes(id)) return;
    selected = id;
    for (const button of list.querySelectorAll('[data-weapon-id]')) {
      button.setAttribute('aria-pressed', String(button.dataset.weaponId === id));
    }
    renderEquipped();
    renderStats(getWeapon(id));
    if (visible) loadSelected();
  }

  equip.addEventListener('click', () => {
    onEquip(selected);
    renderEquipped();
  });
  practice.addEventListener('click', () => {
    onEquip(selected);
    onPractice(selected);
  });

  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    lastPointer = event.clientX;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    angle += (event.clientX - lastPointer) * .009;
    lastPointer = event.clientX;
    if (display) display.rotation.y = angle;
    draw();
  });
  function stopDrag() { dragging = false; }
  canvas.addEventListener('pointerup', stopDrag);
  canvas.addEventListener('pointercancel', stopDrag);
  canvas.addEventListener('lostpointercapture', stopDrag);

  new IntersectionObserver(([entry]) => {
    intersecting = entry.isIntersecting;
    updateVisibility();
  }, { threshold: 0.01 }).observe(section);
  new ResizeObserver(resize).observe(stage);
  new MutationObserver(() => {
    renderEquipped();
    updateVisibility();
  }).observe(menu, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', updateVisibility);
  reduceMotion.addEventListener('change', () => {
    visible = false;
    updateVisibility();
  });
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    contextReady = false;
    ++version;
    previewId = null;
    cancelAnimationFrame(frame);
    frame = 0;
    clearModel();
    visible = false;
    modelState.textContent = 'PREVIEW INTERRUPTED';
    stage.dataset.modelState = 'unavailable';
  });
  canvas.addEventListener('webglcontextrestored', () => {
    contextReady = true;
    updateVisibility();
  });

  renderList();
  inspect(selected);
  return { refresh: renderEquipped };
}
