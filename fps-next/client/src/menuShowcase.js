// Independent Crown / Strike lobby scene. All geometry is original procedural
// Three.js; the tactical operator is a CC BY 4.0 model by DanlyVostok,
// with a CC0 animated Quaternius fallback (see docs/LOBBY_ASSETS.md).
// This scene is decorative, and gameplay remains usable without WebGL or glTF.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const canvas = document.getElementById('strike-showcase');
const host = canvas?.closest('.strike-hero');
const menu = document.getElementById('menu');

if (canvas && host && menu) {
  initShowcase();
}

function initShowcase() {
  let renderer;
  let backgroundRenderer;
  const backgroundCanvas = document.createElement('canvas');
  backgroundCanvas.className = 'strike-showcase-backdrop';
  backgroundCanvas.setAttribute('aria-hidden', 'true');
  canvas.parentNode.insertBefore(backgroundCanvas, canvas);
  try {
    backgroundRenderer = new THREE.WebGLRenderer({ canvas: backgroundCanvas, alpha: false, antialias: false, powerPreference: 'low-power' });
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    backgroundCanvas.remove();
    host.classList.add('strike-scene-fallback');
    return;
  }

  for (const surface of [renderer, backgroundRenderer]) {
    surface.outputColorSpace = THREE.SRGBColorSpace;
    surface.toneMapping = THREE.ACESFilmicToneMapping;
    surface.toneMappingExposure = 1.48;
  }
  // The operator is framed against a sunlit street. Give its textured
  // uniform and armor a separate exposure so the silhouette stays legible.
  renderer.toneMappingExposure = 1.64;
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  backgroundRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1));
  backgroundRenderer.shadowMap.enabled = true;
  backgroundRenderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#d8cec0');
  scene.fog = new THREE.Fog('#c9c1b3', 25, 76);
  // Background and operator use separate canvases, so the street can be
  // optically defocused without softening the central character and rifle.
  const operatorScene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0.2, 2.75, 8.6);
  camera.lookAt(0.2, 1.65, 0);

  const ambient = new THREE.HemisphereLight(0xf2ebe2, 0x736955, 2.7);
  scene.add(ambient);
  operatorScene.add(ambient.clone());
  const sun = new THREE.DirectionalLight(0xffe6cd, 3.8);
  sun.position.set(-5, 10, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -24;
  sun.shadow.camera.right = 24;
  sun.shadow.camera.top = 22;
  sun.shadow.camera.bottom = -22;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 85;
  sun.shadow.bias = -0.00015;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  // Neutral light on the operator keeps its slate gear separate from the
  // amber street. The backdrop still receives the warm afternoon sun.
  const portraitSun = sun.clone();
  portraitSun.color.set('#edf3f6');
  portraitSun.intensity = 3.5;
  operatorScene.add(portraitSun);
  const rim = new THREE.DirectionalLight(0x89afc6, 3.0);
  rim.position.set(7, 5, -4);
  scene.add(rim);
  operatorScene.add(rim.clone());

  const materials = new Map();
  const matte = (hex, roughness = 1) => {
    const key = `${hex}:${roughness}`;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color: hex, roughness }));
    return materials.get(key);
  };
  // Screaming Brain Studios' CC0 masonry/metal/paving sheets are packaged
  // locally under /textures/sbs. Each facade uses a stable material variant;
  // there are no requests for reference-game assets or third-party hosts.
  const surfaceLoader = new THREE.TextureLoader();
  const surfaceMaterials = new Map();
  function surface(name, tint, repeatX = 2, repeatY = 3) {
    const key = `${name}:${tint}:${repeatX}:${repeatY}`;
    if (surfaceMaterials.has(key)) return surfaceMaterials.get(key);
    const map = surfaceLoader.load(`/textures/sbs/${name}.jpg`, () => {
      backgroundDirty = true;
      draw();
    });
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(repeatX, repeatY);
    map.anisotropy = Math.min(4, backgroundRenderer.capabilities.getMaxAnisotropy());
    const material = new THREE.MeshStandardMaterial({
      map,
      color: new THREE.Color(tint).lerp(new THREE.Color('#ffffff'), 0.58),
      roughness: 0.96,
    });
    surfaceMaterials.set(key, material);
    return material;
  }
  function plaster(hex, seed) {
    // Interleave exposed brick and weathered plaster rather than repeating
    // a solid-color slab on every storefront.
    return surface(seed % 5 === 1 ? 'brick' : 'plaster', hex, 2, 3);
  }
  // Subtle alpha decals over the CC0 wall textures make each shopfront look
  // repaired and sun-bleached rather than like a row of identical clean boxes.
  // These stains and chips are drawn locally; no reference imagery is used.
  const wallWear = Array.from({ length: 5 }, (_, variant) => {
    const sheet = document.createElement('canvas');
    sheet.width = 384;
    sheet.height = 640;
    const context = sheet.getContext('2d');
    let state = (variant + 1) * 8467;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    if (context) {
      const patina = context.createLinearGradient(0, 0, 0, 640);
      patina.addColorStop(0, 'rgba(83,68,53,0.02)');
      patina.addColorStop(.72, 'rgba(83,68,53,0.015)');
      patina.addColorStop(1, 'rgba(63,54,47,0.28)');
      context.fillStyle = patina;
      context.fillRect(0, 0, 384, 640);
      for (let n = 0; n < 210; n++) {
        const px = random() * 384;
        const py = random() * 640;
        const radius = 2 + random() * (py > 390 ? 33 : 13);
        context.beginPath();
        context.ellipse(px, py, radius, radius * (.22 + random() * .55), random() * Math.PI, 0, Math.PI * 2);
        context.fillStyle = random() > .32
          ? `rgba(85,73,59,${(.016 + random() * .11).toFixed(3)})`
          : `rgba(239,218,186,${(.018 + random() * .08).toFixed(3)})`;
        context.fill();
      }
      // Plaster fracture lines and irregular patches of exposed masonry.
      for (let n = 0; n < 15; n++) {
        let px = random() * 384;
        let py = (random() * 480) + 90;
        context.beginPath();
        context.moveTo(px, py);
        for (let j = 0; j < 7; j++) {
          px += (random() - .5) * 15;
          py += 3 + random() * 12;
          context.lineTo(px, py);
        }
        context.strokeStyle = `rgba(56,55,49,${(.08 + random() * .14).toFixed(3)})`;
        context.lineWidth = .7 + random();
        context.stroke();
      }
      for (let n = 0; n < 26; n++) {
        const px = random() * 384;
        const py = 170 + random() * 450;
        const width = 6 + random() * 33;
        context.fillStyle = `rgba(104,80,64,${(.045 + random() * .17).toFixed(3)})`;
        context.fillRect(px, py, width, 3 + random() * 12);
        for (let k = 0; k < 3; k++) {
          context.fillRect(px + random() * width, py + 5 + k * 6, 2 + random() * 14, 1.5);
        }
      }
    }
    const texture = new THREE.CanvasTexture(sheet);
    texture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  });
  function weatherFace(parent, width, height, x, y, z, variant, rotation = 0) {
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(width, height), wallWear[variant % wallWear.length]);
    decal.position.set(x, y, z);
    decal.rotation.y = rotation;
    decal.renderOrder = 1;
    parent.add(decal);
  }
  let blockParent = scene;
  function block(x, y, z, width, height, depth, color, rotation = 0) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      typeof color === 'string' ? matte(color) : color,
    );
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotation;
    mesh.castShadow = height > 0.3;
    mesh.receiveShadow = height > 0.3;
    blockParent.add(mesh);
    return mesh;
  }

  // Desert-industrial courtyard. Buildings, curb, lane marks and barricades
  // are light geometry; they never touch gameplay map loading or physics.
  // The street uses a public-domain ambientCG Road012A PBR set. The softer
  // slate-grey grain is closer to worn urban tarmac than the earlier gravelly
  // SBS asphalt; independent overlays below still supply the road repairs.
  const roadLoader = new THREE.TextureLoader();
  const roadTexture = (file, srgb = false) => {
    const texture = roadLoader.load(`/textures/ambientcg/road012a/${file}`, () => {
      backgroundDirty = true;
      draw();
    });
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(18, 20);
    texture.anisotropy = Math.min(8, backgroundRenderer.capabilities.getMaxAnisotropy());
    return texture;
  };
  const roadMap = roadTexture('color.jpg', true);
  const roadNormalMap = roadTexture('normal-gl.jpg');
  const roadRoughnessMap = roadTexture('roughness.jpg');
  const roadSurface = new THREE.MeshStandardMaterial({
    map: roadMap,
    normalMap: roadNormalMap,
    normalScale: new THREE.Vector2(0.28, 0.28),
    roughnessMap: roadRoughnessMap,
    color: '#e7e7e3',
    roughness: 0.98,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), roadSurface);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.018;
  floor.receiveShadow = true;
  scene.add(floor);
  // Locally painted dirt, worn aggregate and fine road fractures. A transparent
  // decal avoids repeating the asphalt photo into an obvious checker pattern.
  // This is original procedural artwork, not a texture from the reference game.
  const roadWearCanvas = document.createElement('canvas');
  roadWearCanvas.width = 768;
  roadWearCanvas.height = 1024;
  const roadWear = roadWearCanvas.getContext('2d');
  if (roadWear) {
    let state = 0x75e15b1a;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    for (let i = 0; i < 650; i++) {
      const x = random() * 768;
      const y = random() * 1024;
      const rx = 3 + random() * 46;
      const ry = 2 + random() * 17;
      roadWear.beginPath();
      roadWear.ellipse(x, y, rx, ry, random() * Math.PI, 0, 2 * Math.PI);
      roadWear.fillStyle = i % 3 === 0
        ? `rgba(215,206,188,${(.018 + random() * .065).toFixed(3)})`
        : `rgba(64,57,49,${(.015 + random() * .065).toFixed(3)})`;
      roadWear.fill();
    }
    // Broad, jagged resurfacing scars break up the otherwise repetitive PBR
    // asphalt at the scale of the street, not just at the scale of its grains.
    for (let i = 0; i < 24; i++) {
      const cx = 28 + random() * 712;
      const cy = 35 + random() * 954;
      const rx = 25 + random() * 85;
      const ry = 10 + random() * 48;
      const angle = (random() - .5) * 1.7;
      roadWear.save();
      roadWear.translate(cx, cy);
      roadWear.rotate(angle);
      roadWear.beginPath();
      for (let edge = 0; edge <= 26; edge++) {
        const theta = (edge / 26) * Math.PI * 2;
        const variation = .66 + random() * .44;
        const px = Math.cos(theta) * rx * variation;
        const py = Math.sin(theta) * ry * variation;
        if (edge === 0) roadWear.moveTo(px, py);
        else roadWear.lineTo(px, py);
      }
      roadWear.closePath();
      roadWear.fillStyle = i % 3 === 0
        ? `rgba(190,176,152,${(.045 + random() * .055).toFixed(3)})`
        : `rgba(43,40,37,${(.048 + random() * .09).toFixed(3)})`;
      roadWear.fill();
      for (let fleck = 0; fleck < 28; fleck++) {
        roadWear.fillStyle = fleck % 2 ? 'rgba(205,193,177,.10)' : 'rgba(25,25,25,.12)';
        roadWear.fillRect((random() - .5) * rx * 1.9, (random() - .5) * ry * 1.8,
          1 + random() * 8, 1 + random() * 3);
      }
      roadWear.restore();
    }
    // Asphalt fissures branch and fade naturally across separate patches.
    for (let i = 0; i < 54; i++) {
      let x = random() * 768;
      let y = random() * 1024;
      roadWear.beginPath();
      roadWear.moveTo(x, y);
      const segments = 3 + Math.floor(random() * 9);
      for (let step = 0; step < segments; step++) {
        x += (random() - .5) * 21;
        y += 3 + random() * 13;
        roadWear.lineTo(x, y);
      }
      roadWear.lineWidth = .6 + random() * 1.6;
      roadWear.strokeStyle = `rgba(54,49,44,${(.16 + random() * .2).toFixed(3)})`;
      roadWear.stroke();
    }
  }
  const roadWearMap = new THREE.CanvasTexture(roadWearCanvas);
  roadWearMap.colorSpace = THREE.SRGBColorSpace;
  const roadDecal = new THREE.Mesh(new THREE.PlaneGeometry(20, 44),
    new THREE.MeshBasicMaterial({ map: roadWearMap, transparent: true, opacity: .84, depthWrite: false }));
  roadDecal.rotation.x = -Math.PI / 2;
  roadDecal.position.set(0, .0015, -10);
  roadDecal.renderOrder = 1;
  scene.add(roadDecal);
  // Chalky exposed aggregate on the near left side of the road. Larger
  // irregular worn regions give the blurred street the mineral texture of
  // aged city pavement; every mark is generated locally from a fixed seed.
  const aggregateCanvas = document.createElement('canvas');
  aggregateCanvas.width = 768;
  aggregateCanvas.height = 1024;
  const aggregatePaint = aggregateCanvas.getContext('2d');
  if (aggregatePaint) {
    let seed = 0x179e82b1;
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let patch = 0; patch < 290; patch++) {
      const x = 70 + rand() * 480;
      const y = 230 + rand() * 760;
      const rx = 5 + rand() * (patch % 4 === 0 ? 86 : 34);
      const ry = 2 + rand() * (patch % 4 === 0 ? 24 : 12);
      aggregatePaint.beginPath();
      for (let corner = 0; corner <= 14; corner++) {
        const angle = corner * Math.PI * 2 / 14;
        const radius = .5 + rand() * .52;
        const px = x + Math.cos(angle) * rx * radius;
        const py = y + Math.sin(angle) * ry * radius;
        if (corner === 0) aggregatePaint.moveTo(px, py);
        else aggregatePaint.lineTo(px, py);
      }
      aggregatePaint.closePath();
      aggregatePaint.fillStyle = patch % 7 === 0
        ? `rgba(95,88,79,${(.11 + rand() * .17).toFixed(3)})`
        : `rgba(228,213,188,${(.13 + rand() * .26).toFixed(3)})`;
      aggregatePaint.fill();
    }
    for (let fleck = 0; fleck < 3900; fleck++) {
      const x = 85 + rand() * 465;
      const y = 230 + rand() * 765;
      const s = .7 + rand() * 5.5;
      aggregatePaint.fillStyle = fleck % 6 === 0
        ? 'rgba(37,43,42,.17)' : 'rgba(235,220,194,.28)';
      aggregatePaint.fillRect(x, y, s * (1 + rand() * 1.5), .8 + rand() * s);
    }
    // Broken pale aggregate is visible on the sunlit foreground road even
    // after the background canvas is optically softened. Use clusters of
    // irregular chips and recessed seams, rather than uniform white noise.
    for (let cluster = 0; cluster < 34; cluster++) {
      const centerX = 115 + rand() * 500;
      const centerY = 490 + rand() * 520;
      const spread = 16 + rand() * 68;
      for (let chip = 0; chip < 14; chip++) {
        const x = centerX + (rand() - .5) * spread * 2;
        const y = centerY + (rand() - .5) * spread;
        const rx = 2 + rand() * 15;
        const ry = 1.5 + rand() * 8;
        const rotation = (rand() - .5) * .9;
        aggregatePaint.save();
        aggregatePaint.translate(x, y);
        aggregatePaint.rotate(rotation);
        aggregatePaint.beginPath();
        for (let edge = 0; edge < 8; edge++) {
          const angle = edge * Math.PI / 4;
          const jagged = .65 + rand() * .55;
          const px = Math.cos(angle) * rx * jagged;
          const py = Math.sin(angle) * ry * jagged;
          if (edge === 0) aggregatePaint.moveTo(px, py);
          else aggregatePaint.lineTo(px, py);
        }
        aggregatePaint.closePath();
        aggregatePaint.fillStyle = chip % 5 === 0
          ? 'rgba(49,54,52,.53)' : 'rgba(226,218,198,.64)';
        aggregatePaint.fill();
        aggregatePaint.restore();
      }
    }
  }
  const aggregateMap = new THREE.CanvasTexture(aggregateCanvas);
  aggregateMap.colorSpace = THREE.SRGBColorSpace;
  const exposedAggregate = new THREE.Mesh(new THREE.PlaneGeometry(11, 17),
    new THREE.MeshBasicMaterial({ map: aggregateMap, transparent: true, opacity: .86, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, side: THREE.DoubleSide }));
  exposedAggregate.rotation.x = -Math.PI / 2;
  exposedAggregate.position.set(-2.3, .011, -1.5);
  exposedAggregate.renderOrder = 2;
  scene.add(exposedAggregate);
  // The diagonally shaded near carriageway gives the foreground more depth.
  const roadShade = new THREE.Shape();
  // Shape Y maps to negative world Z after rotation: the broad end therefore
  // occupies the lower-right foreground rather than the distant alley.
  roadShade.moveTo(3.1, -11);
  roadShade.lineTo(10.8, -11);
  roadShade.lineTo(10.8, 4.8);
  roadShade.lineTo(7.7, 3.6);
  roadShade.closePath();
  const roadShadeMesh = new THREE.Mesh(new THREE.ShapeGeometry(roadShade),
    new THREE.MeshBasicMaterial({ color: '#343b3b', transparent: true, opacity: .16, depthWrite: false, side: THREE.DoubleSide }));
  roadShadeMesh.rotation.x = -Math.PI / 2;
  roadShadeMesh.position.y = .007;
  roadShadeMesh.renderOrder = 2;
  scene.add(roadShadeMesh);
  // The menu reference has a broad slate-blue shadow across the near road.
  // Blend it with a feathered alpha texture to preserve the worn paving
  // beneath it and avoid a hard polygon edge in the sunlit alley.
  const foregroundShadeCanvas = document.createElement('canvas');
  foregroundShadeCanvas.width = 256;
  foregroundShadeCanvas.height = 512;
  const foregroundShadePaint = foregroundShadeCanvas.getContext('2d');
  if (foregroundShadePaint) {
    const falloff = foregroundShadePaint.createLinearGradient(0, 0, 0, 512);
    falloff.addColorStop(0, 'rgba(30,54,68,0)');
    falloff.addColorStop(.22, 'rgba(30,54,68,.19)');
    falloff.addColorStop(.66, 'rgba(24,47,61,.34)');
    falloff.addColorStop(1, 'rgba(19,38,50,.26)');
    foregroundShadePaint.fillStyle = falloff;
    foregroundShadePaint.fillRect(0, 0, 256, 512);
    foregroundShadePaint.globalCompositeOperation = 'destination-in';
    const sideFade = foregroundShadePaint.createLinearGradient(0, 0, 256, 0);
    sideFade.addColorStop(0, 'rgba(255,255,255,0)');
    sideFade.addColorStop(.15, 'rgba(255,255,255,1)');
    sideFade.addColorStop(.85, 'rgba(255,255,255,1)');
    sideFade.addColorStop(1, 'rgba(255,255,255,0)');
    foregroundShadePaint.fillStyle = sideFade;
    foregroundShadePaint.fillRect(0, 0, 256, 512);
  }
  const foregroundShade = new THREE.Mesh(new THREE.PlaneGeometry(22, 30),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(foregroundShadeCanvas), transparent: true,
      depthWrite: false, side: THREE.DoubleSide,
    }));
  foregroundShade.rotation.x = -Math.PI / 2;
  foregroundShade.position.set(0, .013, 2.5);
  foregroundShade.renderOrder = 3;
  scene.add(foregroundShade);
  const sidewalk = surface('pavers', '#bcb5a8', 3, 13);
  const kerbstone = surface('stone', '#c4bdb3', 1, 9);
  for (const side of [-1, 1]) {
    // Sidewalks and irregular kerbs converge naturally in perspective.
    block(side * 7.15, 0.075, -3.2, 4.2, 0.16, 35, sidewalk);
    block(side * 5.08, 0.11, -3.2, .13, .16, 35, kerbstone);
    for (let step = 0; step < 19; step++) {
      block(side * 7.1, .165, -18 + step * 1.92, 4, .012, .025, '#8a847a');
    }
  }
  // The road has one old painted edge stripe. Solid rectangular white dashes
  // here previously showed through it as prominent diagonal slashes.
  for (let step = 0; step < 30; step++) {
    const x = ((step * 113) % 93) / 13 - 3.5;
    const z = ((step * 57) % 71) / 3.2 - 16;
    block(x, .002, z, .035 + (step % 3) * .02, .006, .25 + (step % 4) * .27, '#6a6b68', .24 + (step % 7) * .08);
  }
  // Distressed tarmac seams and asphalt repairs sit close to the sidewalks.
  // They add visible variation in the sunlit empty lane behind the operator.
  const asphaltRepair = new THREE.MeshStandardMaterial({ color: '#656565', roughness: 1, transparent: true, opacity: .3, depthWrite: false });
  for (let section = 0; section < 11; section++) {
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(.24 + section % 3 * .37, .7 + (section % 4) * .27), asphaltRepair);
    patch.rotation.set(-Math.PI / 2, 0, section % 2 ? .09 : -.14);
    patch.position.set(section % 2 ? 3.7 - (section % 3) * .4 : -4.15 + (section % 3) * .32, .005, -19.8 + section * 2.46);
    scene.add(patch);
  }
  // A single battered lane stripe recedes from the viewer into the far alley.
  // The alpha texture lets road grain and missing paint show through.
  const laneCanvas = document.createElement('canvas');
  laneCanvas.width = 128;
  laneCanvas.height = 1024;
  const lanePainter = laneCanvas.getContext('2d');
  if (lanePainter) {
    let laneSeed = 0x71a903;
    const randomLane = () => {
      laneSeed = (Math.imul(laneSeed, 1664525) + 1013904223) >>> 0;
      return laneSeed / 4294967296;
    };
    lanePainter.fillStyle = 'rgba(229,227,211,.91)';
    lanePainter.beginPath();
    lanePainter.moveTo(19, 0);
    for (let y = 0; y <= 1024; y += 16) lanePainter.lineTo(18 + randomLane() * 13, y);
    for (let y = 1024; y >= 0; y -= 16) lanePainter.lineTo(106 + randomLane() * 8, y);
    lanePainter.closePath();
    lanePainter.fill();
    lanePainter.globalCompositeOperation = 'destination-out';
    // Chipped edges, hairline breaks and road-worn patches along the stripe.
    for (let chip = 0; chip < 960; chip++) {
      const x = randomLane() * 128;
      const y = randomLane() * 1024;
      const size = .4 + randomLane() * (chip % 7 === 0 ? 18 : 5);
      lanePainter.fillStyle = `rgba(0,0,0,${(.18 + randomLane() * .63).toFixed(3)})`;
      lanePainter.fillRect(x, y, size, .8 + randomLane() * (size * 2));
    }
    for (const y of [138, 446, 720, 929]) {
      lanePainter.fillStyle = 'rgba(0,0,0,.35)';
      lanePainter.fillRect(8, y, 112, 2 + randomLane() * 5);
    }
  }
  const laneTexture = new THREE.CanvasTexture(laneCanvas);
  laneTexture.colorSpace = THREE.SRGBColorSpace;
  // Follow the bowed edge of the roadway. A straight world-space strip
  // projected as a line slanting the wrong way across the foreground; these
  // independently positioned points follow the old curb through the alley.
  const lanePath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-5.25, 0, -7.85),
    new THREE.Vector3(-4.95, 0, -6.2),
    new THREE.Vector3(-3.65, 0, -3.45),
    new THREE.Vector3(-2.38, 0, -.27),
    new THREE.Vector3(-1.45, 0, 2.1),
    new THREE.Vector3(-.90, 0, 3.35),
  ], false, 'centripetal');
  function roadPaintStrip(width, height) {
    const positions = [];
    const uvs = [];
    const indices = [];
    const segments = 60;
    for (let step = 0; step <= segments; step++) {
      const t = step / segments;
      const point = lanePath.getPoint(t);
      const tangent = lanePath.getTangent(t);
      const length = Math.hypot(tangent.x, tangent.z) || 1;
      const perpendicular = new THREE.Vector2(tangent.z / length, -tangent.x / length);
      const halfWidth = width * (.78 + .22 * t) / 2;
      for (const side of [-1, 1]) {
        positions.push(point.x + perpendicular.x * halfWidth * side, height, point.z + perpendicular.y * halfWidth * side);
        uvs.push(side < 0 ? 0 : 1, t);
      }
      if (step < segments) {
        const index = step * 2;
        indices.push(index, index + 1, index + 2, index + 1, index + 3, index + 2);
      }
    }
    const strip = new THREE.BufferGeometry();
    strip.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    strip.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    strip.setIndex(indices);
    strip.computeVertexNormals();
    return strip;
  }
  const laneMark = new THREE.Mesh(roadPaintStrip(.30, .031), new THREE.MeshBasicMaterial({
    map: laneTexture, transparent: true, opacity: .95, depthWrite: false, polygonOffset: true,
    polygonOffsetFactor: -1, side: THREE.DoubleSide,
  }));
  laneMark.renderOrder = 4;
  // A faded painted base keeps the worn road marking connected where its
  // heavily chipped top coat breaks away into small separate fragments.
  const fadedLane = new THREE.Mesh(roadPaintStrip(.26, .024), new THREE.MeshBasicMaterial({
    color: '#ded9cc', transparent: true, opacity: .38, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, side: THREE.DoubleSide,
  }));
  fadedLane.renderOrder = 3;
  scene.add(fadedLane);
  scene.add(laneMark);

  // Aging masonry, inset storefronts, awnings, balconies and cable runs
  // establish a recognisable tactical-street silhouette around the operator.
  const facade = ['#ae9f8e', '#b6a797', '#a89d8e', '#c8b7a2', '#b2a999'];
  const concrete = facade.map((color, index) => plaster(color, 37 + index * 311));
  // Rolling shop shutters are horizontal slats with scratched paint. The
  // generic sheet-metal texture read as a grid at lobby distance, obscuring
  // the market-street silhouette visible in the public reference screenshot.
  const shutterCanvas = document.createElement('canvas');
  shutterCanvas.width = 256;
  shutterCanvas.height = 512;
  const shutterPainter = shutterCanvas.getContext('2d');
  if (shutterPainter) {
    const steelGradient = shutterPainter.createLinearGradient(0, 0, 256, 0);
    steelGradient.addColorStop(0, '#525a59');
    steelGradient.addColorStop(.32, '#858985');
    steelGradient.addColorStop(.73, '#7a7e79');
    steelGradient.addColorStop(1, '#505b59');
    shutterPainter.fillStyle = steelGradient;
    shutterPainter.fillRect(0, 0, 256, 512);
    for (let y = 0; y < 512; y += 19) {
      shutterPainter.fillStyle = 'rgba(27,34,34,.50)';
      shutterPainter.fillRect(0, y, 256, 3);
      shutterPainter.fillStyle = 'rgba(201,206,198,.27)';
      shutterPainter.fillRect(0, y + 4, 256, 2);
      shutterPainter.fillStyle = 'rgba(30,33,32,.09)';
      shutterPainter.fillRect(0, y + 16, 256, 2);
    }
    let state = 2479;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    for (let mark = 0; mark < 165; mark++) {
      const x = random() * 256;
      const y = random() * 512;
      shutterPainter.fillStyle = mark % 4 === 0
        ? `rgba(205,187,149,${(.08 + random() * .22).toFixed(3)})`
        : `rgba(43,49,47,${(.04 + random() * .18).toFixed(3)})`;
      shutterPainter.fillRect(x, y, 1 + random() * 7, 2 + random() * 28);
    }
  }
  const shutterTexture = new THREE.CanvasTexture(shutterCanvas);
  shutterTexture.colorSpace = THREE.SRGBColorSpace;
  const shutterMetal = new THREE.MeshStandardMaterial({ map: shutterTexture, roughness: .88, metalness: .12 });
  for (let i = 0; i < 9; i++) {
    // Build each old-street frontage in its own local coordinates. The row
    // follows the receding left side of an alley rather than a single flat
    // wall spanning the entire skyline behind the operator.
    const unit = new THREE.Group();
    blockParent = unit;
    const x = 0;
    const height = 6.4 + ((i * 17) % 5) * 0.75;
    const z = 0;
    block(x, height / 2, z, 4.75, height, 2.65, concrete[i % concrete.length]);
    weatherFace(unit, 4.69, height - .05, x, height / 2, z + 1.337, i);
    block(x, height + 0.17, z, 4.9, 0.32, 2.9, '#5a5850');
    block(x - 2.24, height / 2, z + 1.37, 0.16, height, 0.13, '#c3b39a');
    block(x + 2.24, height / 2, z + 1.37, 0.16, height, 0.13, '#5d584f');
    block(x, 1.65, z + 1.37, 2.35, 3.1, 0.035, shutterMetal);
    block(x, 3.34, z + 1.41, 3.05, 0.26, 0.09, '#c4b09a');
    // Small shopfront roller shutters and corrugated sun shades.
    for (let line = 0; line < 9; line++) {
      block(x, 0.42 + line * 0.30, z + 1.413, 2.23, 0.018, 0.018, '#5e5c56');
    }
    block(x, 3.25, z + 1.82, 3.12, 0.08, 0.86, i % 2 ? '#726856' : '#8b6e52');
    for (const side of [-1, 1]) {
      block(x + side * 1.5, 3.08, z + 1.63, 0.09, 0.38, 0.12, '#373a36');
    }
    for (let floorNo = 0; floorNo < 2; floorNo++) {
      for (const side of [-1, 1]) {
        if ((i + floorNo + (side === 1 ? 2 : 0)) % 7 === 0) continue;
        const windowX = x + side * 1.23;
        const windowY = 4.45 + floorNo * 1.44;
        if (windowY + .65 > height) continue;
        block(windowX, windowY, z + 1.40, 0.96, 0.96, 0.055, '#4d4942');
        block(windowX, windowY, z + 1.455, 0.8, 0.81, 0.022, i % 3 === 1 ? '#514b44' : '#263234');
        block(windowX, windowY, z + 1.48, 0.06, 0.87, 0.055, '#a79a86');
        block(windowX, windowY + 0.03, z + 1.49, 0.84, 0.043, 0.043, '#a79a86');
        block(windowX, windowY - 0.5, z + 1.58, 1.12, 0.11, 0.25, '#b2a18c');
        if ((i + floorNo) % 4 === 0) {
          // Aged wooden shutters change the otherwise mechanical window grid.
          const shutterX = windowX + (side < 0 ? -.56 : .56);
          block(shutterX, windowY, z + 1.54, .21, .94, .10, i % 2 ? '#777568' : '#8b826e');
          for (let slat = 0; slat < 5; slat++) {
            block(shutterX, windowY - .35 + slat * .18, z + 1.60, .19, .023, .028, '#4d514d');
          }
        }
      }
    }
    if (i % 3 === 1) {
      // Rusted exterior air conditioning unit beneath an upstairs window.
      block(x + 1.24, 3.7, z + 1.76, 0.77, 0.42, 0.64, '#65685e');
      block(x + 1.24, 3.7, z + 2.10, 0.63, 0.29, 0.015, '#343a37');
      for (let l = 0; l < 5; l++) block(x + 0.98 + l * 0.13, 3.7, z + 2.12, 0.024, 0.26, 0.021, '#889087');
    }
    if (i % 3 !== 2) {
      // Irregular drainage pipe, meter and conduit interrupt the flat masonry.
      const pipeX = i % 2 ? -2.05 : 2.04;
      block(pipeX, 2.1, z + 1.48, .075, 4.15, .08, '#555750');
      block(pipeX, 3.9, z + 1.55, .26, .38, .19, '#777970');
      block(pipeX, 2.1, z + 1.55, .24, .28, .16, '#777970');
    }
    if (i % 4 === 2) {
      block(-.25, 3.47, z + 1.52, 2.65, .37, .2, '#756d5e');
      block(-.25, 3.52, z + 1.65, 2.21, .19, .07, '#c6b8a0');
      for (let hook = -1; hook <= 1; hook++) block(hook * .83, 3.30, z + 1.88, .05, .20, .41, '#555852');
    }
    unit.position.set(-6.8 + (i % 3) * .12, 0, 1.2 - i * 5.45);
    unit.rotation.y = Math.PI / 2;
    scene.add(unit);
    blockParent = scene;
  }
  // An offset row of facades adds a near/right street wall. The original
  // game reference uses a sunlit alley rather than a continuous rear wall.
  for (let shop = 0; shop < 3; shop++) {
    const z = -14 + shop * 6.4;
    const wallColor = shop === 1 ? '#c1b2a1' : '#ded0ba';
    block(8.3, 4.9, z, 5.9, 9.8, 6.1, plaster(wallColor, 855 + shop * 99));
    weatherFace(scene, 5.96, 9.65, 5.335, 4.91, z, shop + 2, -Math.PI / 2);
    block(5.28, 1.88, z + 1.2, .14, 3.5, 2.3, shutterMetal);
    block(5.17, 3.65, z + 1.1, .21, .22, 3.5, '#a6a094');
    for (const height of [5.1, 7.18]) {
      block(5.17, height, z + 1.05, .13, 1.2, 1.3, '#4a4946');
      block(5.09, height, z + 1.05, .06, 1.01, 1.1, '#67716f');
      block(5.05, height, z + 1.05, .024, .12, 1.1, '#c5bcac');
    }
    // Metal balcony rails and shaded awnings interrupt the smooth right wall.
    block(5.02, 4.38, z + 1.1, .55, .14, 3.1, '#b5a58d');
    for (let rail = 0; rail < 6; rail++) {
      block(4.76, 4.8, z - .1 + rail * .5, .05, .79, .055, '#4e4f49');
    }
    block(4.76, 5.2, z + 1.1, .075, .08, 3.16, '#494e49');
    for (let row = 0; row < 11; row++) {
      block(5.15, .63 + row * .22, z + 1.1, .14, .024, 2.25, '#a69a8d');
    }
    // Utility junction box, surface conduit and a sun-faded shop banner.
    block(5.12, 2.75, z - 1.82, .3, .48, .37, '#7d8078');
    block(5.17, 5.0, z - 1.82, .12, 4.0, .11, '#5a5d56');
    if (shop !== 1) {
      block(5.08, 3.88, z + 1.15, .19, .46, 2.72, shop ? '#716451' : '#53616a');
      block(4.94, 3.89, z + 1.15, .025, .16, 2.42, '#b4a68d');
    }
  }
  // A hand-painted shop mark adds a recognizable color accent to the near
  // right shutter. It is original canvas artwork, with no imported signage.
  const muralCanvas = document.createElement('canvas');
  muralCanvas.width = 512;
  muralCanvas.height = 384;
  const mural = muralCanvas.getContext('2d');
  if (mural) {
    mural.strokeStyle = '#4b7190';
    mural.lineWidth = 20;
    mural.lineCap = 'round';
    mural.globalAlpha = .72;
    mural.beginPath();
    mural.moveTo(108, 112);
    mural.bezierCurveTo(155, 60, 187, 160, 228, 100);
    mural.bezierCurveTo(271, 54, 286, 127, 350, 105);
    mural.stroke();
    mural.beginPath();
    mural.moveTo(152, 188);
    mural.bezierCurveTo(195, 232, 284, 152, 335, 206);
    mural.stroke();
    mural.font = 'bold 55px Arial';
    mural.textAlign = 'center';
    mural.fillStyle = '#476c85';
    mural.fillText('SECTOR 07', 255, 310);
  }
  const muralTexture = new THREE.CanvasTexture(muralCanvas);
  muralTexture.colorSpace = THREE.SRGBColorSpace;
  const muralPlane = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 2.18),
    new THREE.MeshBasicMaterial({ map: muralTexture, transparent: true, opacity: .75, depthWrite: false, side: THREE.DoubleSide }));
  muralPlane.rotation.y = -Math.PI / 2;
  muralPlane.position.set(5.006, 2.9, 0.0);
  scene.add(muralPlane);
  // Distant facades fill the alley's vanishing point, leaving a smaller slice
  // of sky behind the operator. Independently constructed low-rise masonry.
  const skylineColors = ['#d5c6b0', '#bfb7a9', '#d3c3ab', '#c3b5a2', '#d7c7b6', '#b9b0a4'];
  for (let i = 0; i < skylineColors.length; i++) {
    const x = -18 + i * 7;
    const z = -32 - (i % 3) * 2.25;
    const height = 9.5 + ((i * 7) % 4) * 1.4;
    // Keep the far wall sun-bleached. A randomly chosen brick sheet put a
    // saturated red rectangle directly behind the operator's head and chest.
    block(x, height / 2, z, 8.2, height, 4.8,
      surface('plaster', skylineColors[i], 2.1, 2.7));
    weatherFace(scene, 8.1, height - .06, x, height / 2, z + 2.413, i + 1);
    block(x, height + .12, z + 1.2, 8.6, .24, 5.2, '#aaa090');
    block(x - 2.8, height + .55, z + 1.1, .26, .8, .34, '#a09585');
    block(x + 2.7, height + .48, z + 1.1, .25, .7, .32, '#a09585');
    for (let level = 0; level < 3; level++) {
      const y = 3.35 + level * 2.26;
      if (y > height - .9) continue;
      for (let column = -1; column <= 1; column++) {
        const wx = x + column * 2.12;
        block(wx, y, z + 2.43, 1.16, 1.36, .1, '#c2ac90');
        block(wx, y, z + 2.49, .94, 1.16, .075, '#526168');
        block(wx, y, z + 2.54, .063, 1.2, .065, '#e0d5bd');
        block(wx, y - .66, z + 2.61, 1.4, .14, .35, '#b9ab95');
      }
    }
  }
  // An alley arch and perpendicular store awnings add a mid-distance layer.
  // Keep this overhead lintel in the far street. At the old position it
  // looked like a bright, clean horizontal billboard directly behind the
  // operator's head, unlike the broken-up masonry in the reference scene.
  for (const side of [-1, 1]) {
    block(side * 4.4, 3.85, -21.4, 1.5, 7.7, 2.9, plaster('#b6a897', 423));
  }
  block(0, 7.72, -21.4, 8.9, .49, 2.7, plaster('#b4a595', 420));
  block(0, 8.01, -21.4, 9.35, .14, 3.0, '#938476');
  block(0, 7.49, -19.98, 8.1, .09, .13, '#746e64');
  for (const [x, z, width] of [[5.2, -.1, 3.5], [5.2, -7.9, 3.2], [-5.2, -9.1, 3.4]]) {
    block(x, 3.15, z, width, .12, 2.5, '#998366');
    for (let stripe = 0; stripe < 8; stripe++) {
      block(x - width / 2 + stripe * width / 8 + width / 16, 3.21, z + .4, width / 10, .015, 1.8,
        stripe % 2 ? '#a98567' : '#d5c0a0');
    }
  }
  // Hanging original venue sign. Flat lit surfaces keep text legible after
  // optical background defocus without importing reference-site artwork.
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 512;
  signCanvas.height = 180;
  const signContext = signCanvas.getContext('2d');
  if (signContext) {
    signContext.fillStyle = '#b85b03';
    signContext.fillRect(0, 0, 512, 180);
    signContext.fillStyle = '#48331f';
    signContext.font = 'bold 54px Arial';
    signContext.textAlign = 'center';
    signContext.fillText('CROWN / STRIKE', 256, 109);
  }
  const signTexture = new THREE.CanvasTexture(signCanvas);
  signTexture.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.82, .64), new THREE.MeshBasicMaterial({ map: signTexture, side: THREE.DoubleSide }));
  sign.position.set(3.24, 3.02, -3.70);
  scene.add(sign);
  block(3.24, 3.02, -3.84, 1.95, .75, .13, '#363a3a');
  block(4.39, 3.05, -3.74, .52, .09, .1, '#333637');
  for (const y of [2.83, 3.27]) block(4.69, y, -3.65, .09, .18, .1, '#333637');
  const barrelMaterial = matte('#4c5550', 0.78);
  const rimMaterial = matte('#888a79', 0.65);
  for (const [x, z] of [[-6, -3.6], [7.2, -5.6], [9.1, -3.4]]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.39, 1.12, 14), barrelMaterial);
    barrel.position.set(x, 0.57, z);
    scene.add(barrel);
    for (const y of [0.16, 0.94]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.393, 0.026, 5, 16), rimMaterial);
      band.rotation.x = Math.PI / 2;
      band.position.set(x, y, z);
      scene.add(band);
    }
  }
  for (const [x, z, turn] of [[-7.7, -4.4, 0.17], [8.7, -6.8, -0.08]]) {
    block(x, 0.57, z, 1.3, 1.14, 0.9, '#92836d', turn);
    block(x, 1.17, z, 1.37, 0.09, 0.96, '#554e42', turn);
    block(x, 0.57, z + 0.46, 0.10, 1.16, 0.06, '#554e42', turn);
  }
  // Suspended wires use simple line geometry, avoiding texture downloads.
  for (const [startY, endY, z] of [[6.9, 6.2, -7.5], [7.3, 6.6, -9]]) {
    const samples = [];
    for (let n = 0; n <= 18; n++) {
      const t = n / 18;
      samples.push(new THREE.Vector3(-23 + t * 46, startY + (endY - startY) * t - 1.1 * Math.sin(Math.PI * t), z));
    }
    const cable = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(samples),
      new THREE.LineBasicMaterial({ color: '#383b38', transparent: true, opacity: 0.8 }),
    );
    scene.add(cable);
  }
  // A sloping, plastered retaining wall opens the alley toward the distant
  // buildings. Its stepped profile replaces a conspicuous square grey crate.
  const retainingWallShape = new THREE.Shape();
  retainingWallShape.moveTo(-5.6, 0);
  retainingWallShape.lineTo(-5.6, 2.38);
  retainingWallShape.lineTo(-4.4, 2.30);
  retainingWallShape.lineTo(-3.45, 2.04);
  retainingWallShape.lineTo(-1.0, 0.88);
  retainingWallShape.lineTo(-1.0, 0);
  retainingWallShape.closePath();
  const retainingWall = new THREE.Mesh(new THREE.ExtrudeGeometry(retainingWallShape,
    { depth: 1.5, bevelEnabled: false, curveSegments: 1 }),
    // At lobby distance the old repeating plaster photo looked like a pile of
    // gravel. Use smooth lime plaster with the finer custom wear layer below.
    matte('#bfb7a8'));
  retainingWall.position.z = -8.1;
  retainingWall.castShadow = true;
  retainingWall.receiveShadow = true;
  scene.add(retainingWall);
  // Overlay only the camera-facing wall polygon with individually generated
  // mineral deposits, splash erosion and cracks. The matte wall surface and
  // its translucent distressed finish are both independently authored.
  const rampWeatherCanvas = document.createElement('canvas');
  rampWeatherCanvas.width = 1024;
  rampWeatherCanvas.height = 512;
  const rampPainter = rampWeatherCanvas.getContext('2d');
  if (rampPainter) {
    let seed = 0x407c11ab;
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const basePatina = rampPainter.createLinearGradient(0, 0, 0, 512);
    basePatina.addColorStop(0, 'rgba(248,229,199,.13)');
    basePatina.addColorStop(.32, 'rgba(101,80,66,.065)');
    basePatina.addColorStop(.69, 'rgba(109,89,74,.22)');
    basePatina.addColorStop(1, 'rgba(51,55,48,.57)');
    rampPainter.fillStyle = basePatina;
    rampPainter.fillRect(0, 0, 1024, 512);
    // Transparent irregular plaster stains concentrate near the wall's foot.
    for (let i = 0; i < 1050; i++) {
      const x = rand() * 1024;
      const y = rand() * 512;
      const radius = 1.2 + rand() * (y > 320 ? 41 : 16);
      rampPainter.beginPath();
      rampPainter.ellipse(x, y, radius, radius * (.17 + rand() * .52), rand() * 3.1, 0, Math.PI * 2);
      rampPainter.fillStyle = i % 5 === 0
        ? `rgba(235,219,192,${(.04 + rand() * .16).toFixed(3)})`
        : `rgba(74,69,58,${(.03 + rand() * .21).toFixed(3)})`;
      rampPainter.fill();
    }
    // Micro-pitting and old salt deposits remain visible where the wall catches
    // sunlight, without the large repeating gravel pattern of a photo map.
    for (let i = 0; i < 7200; i++) {
      const x = rand() * 1024;
      const y = rand() * 512;
      const radius = .25 + rand() * 1.75;
      rampPainter.fillStyle = i % 3 === 0
        ? `rgba(255,250,233,${(.08 + rand() * .24).toFixed(3)})`
        : `rgba(97,91,81,${(.025 + rand() * .11).toFixed(3)})`;
      rampPainter.fillRect(x, y, radius * 2, radius);
    }
    // Thin branching faults that retain the irregularity of weathered lime.
    for (let i = 0; i < 28; i++) {
      let x = rand() * 1024;
      let y = rand() * 300;
      rampPainter.beginPath();
      rampPainter.moveTo(x, y);
      for (let j = 0; j < 8; j++) {
        x += (rand() - .5) * 15;
        y += 5 + rand() * 17;
        rampPainter.lineTo(x, y);
      }
      rampPainter.strokeStyle = `rgba(63,59,54,${(.13 + rand() * .19).toFixed(3)})`;
      rampPainter.lineWidth = .6 + rand() * 1.3;
      rampPainter.stroke();
    }
    // Dust and splashes at ground level, uneven along the long front face.
    for (let i = 0; i < 140; i++) {
      const x = rand() * 1024;
      const y = 430 + rand() * 82;
      const w = 1 + rand() * 23;
      rampPainter.fillStyle = `rgba(88,79,61,${(.07 + rand() * .2).toFixed(3)})`;
      rampPainter.fillRect(x, y, w, .8 + rand() * 7);
    }
    // Broad water streaks and patches of missing plaster survive the
    // shallow optical blur used behind the sharply rendered operator.
    for (let i = 0; i < 57; i++) {
      const x = rand() * 1024;
      const y = 180 + rand() * 335;
      const width = 15 + rand() * 120;
      const height = 7 + rand() * 52;
      rampPainter.fillStyle = i % 4 === 0
        ? `rgba(220,203,180,${(.10 + rand() * .13).toFixed(3)})`
        : `rgba(70,70,61,${(.035 + rand() * .12).toFixed(3)})`;
      rampPainter.beginPath();
      rampPainter.ellipse(x, y, width, height, rand() * .2, 0, 2 * Math.PI);
      rampPainter.fill();
    }
  }
  const rampWeatherTexture = new THREE.CanvasTexture(rampWeatherCanvas);
  rampWeatherTexture.colorSpace = THREE.SRGBColorSpace;
  const rampFaceGeometry = new THREE.ShapeGeometry(retainingWallShape);
  const facePositions = rampFaceGeometry.getAttribute('position');
  const faceUvs = rampFaceGeometry.getAttribute('uv');
  for (let i = 0; i < facePositions.count; i++) {
    faceUvs.setXY(i, (facePositions.getX(i) + 5.6) / 4.6, 1 - facePositions.getY(i) / 2.38);
  }
  faceUvs.needsUpdate = true;
  const rampWeatherFace = new THREE.Mesh(rampFaceGeometry, new THREE.MeshBasicMaterial({
    map: rampWeatherTexture, transparent: true, depthWrite: false, polygonOffset: true,
    polygonOffsetFactor: -2, side: THREE.DoubleSide,
  }));
  rampWeatherFace.position.z = -6.592;
  scene.add(rampWeatherFace);
  // Continuous chipped concrete coping follows the sloping retaining wall.
  block(-4.7, 2.425, -6.53, 1.97, .14, .18, '#c5b9a7', -.045);
  const rampTopStart = new THREE.Vector2(-3.45, 2.04);
  const rampTopEnd = new THREE.Vector2(-1.0, .88);
  const slope = rampTopEnd.clone().sub(rampTopStart);
  const cap = block((rampTopStart.x + rampTopEnd.x) / 2,
    (rampTopStart.y + rampTopEnd.y) / 2 + .07, -6.54,
    slope.length() + .08, .14, .18, '#d0c2ae');
  cap.rotation.z = Math.atan2(slope.y, slope.x);
  // Dusty missing plaster chips create small-scale depth at the base.
  for (let i = 0; i < 42; i++) {
    const x = -5.34 + (i * 17 % 79) * .055;
    const y = .08 + ((i * 13) % 8) * .036;
    block(x, y, -6.565, .045 + (i % 4) * .037, .012, .012,
      i % 4 ? '#a99a89' : '#e3d6c2');
  }
  block(6.3, 0.72, -2.7, 1.75, 1.45, 1.7, '#5e665f', 0.12);
  block(6.3, 1.49, -2.7, 1.9, 0.12, 1.88, '#a59a87');

  // Light cones from fixtures: an amber wash and a cold counterlight.
  const amber = new THREE.PointLight(0xffb86c, 17, 11);
  amber.position.set(-1.5, 4.8, -2.8);
  scene.add(amber);
  const portraitAmber = amber.clone();
  portraitAmber.intensity = 3.5;
  operatorScene.add(portraitAmber);
  const blue = new THREE.PointLight(0xa4b9be, 9, 10);
  blue.position.set(6, 3.5, 1);
  scene.add(blue);
  operatorScene.add(blue.clone());

  const soldierPivot = new THREE.Group();
  // Shift the portrait toward the central lobby axis and keep its armored
  // silhouette narrower than the underlying licensed rig.
  soldierPivot.position.set(0.19, -0.12, 1.4);
  soldierPivot.scale.set(0.97, 1.025, 1.025);
  operatorScene.add(soldierPivot);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.82, 36),
    new THREE.MeshBasicMaterial({ color: 0x191a17, transparent: true, opacity: 0.17, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(1.0, 0.025, 1.1);
  shadow.scale.set(1.45, 0.62, 1);
  operatorScene.add(shadow);

  let mixer;
  let idleElapsed = 0;
  const characterLoader = new GLTFLoader();
  const slateMaps = new Map();
  function slateTexture(source) {
    if (!source?.image) return source;
    if (slateMaps.has(source.uuid)) return slateMaps.get(source.uuid);
    try {
      const { width, height } = source.image;
      if (!width || !height) return source;
      const textureCanvas = document.createElement('canvas');
      textureCanvas.width = width;
      textureCanvas.height = height;
      const context = textureCanvas.getContext('2d', { willReadFrequently: true });
      if (!context) return source;
      context.drawImage(source.image, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height);
      for (let index = 0; index < pixels.data.length; index += 4) {
        const red = pixels.data[index];
        const green = pixels.data[index + 1];
        const blue = pixels.data[index + 2];
        const luminance = red * .23 + green * .67 + blue * .1;
        // Neutral cool fabric, retaining the fabric's original weave,
        // wrinkles and shading from the licensed texture.
        pixels.data[index] = Math.min(255, luminance * 1.08);
        pixels.data[index + 1] = Math.min(255, luminance * 1.10);
        pixels.data[index + 2] = Math.min(255, luminance * 1.13);
      }
      context.putImageData(pixels, 0, 0);
      const recolored = new THREE.CanvasTexture(textureCanvas);
      recolored.colorSpace = source.colorSpace;
      recolored.flipY = source.flipY;
      recolored.wrapS = source.wrapS;
      recolored.wrapT = source.wrapT;
      recolored.repeat.copy(source.repeat);
      recolored.offset.copy(source.offset);
      recolored.rotation = source.rotation;
      recolored.center.copy(source.center);
      recolored.anisotropy = source.anisotropy;
      slateMaps.set(source.uuid, recolored);
      return recolored;
    } catch {
      return source;
    }
  }

  const sandMaps = new Map();
  function sandWebbingTexture(source) {
    if (!source?.image) return source;
    if (sandMaps.has(source.uuid)) return sandMaps.get(source.uuid);
    try {
      const { width, height } = source.image;
      if (!width || !height) return source;
      const sheet = document.createElement('canvas');
      sheet.width = width;
      sheet.height = height;
      const ctx = sheet.getContext('2d', { willReadFrequently: true });
      if (!ctx) return source;
      ctx.drawImage(source.image, 0, 0, width, height);
      const pixels = ctx.getImageData(0, 0, width, height);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const luma = pixels.data[i] * .23 + pixels.data[i + 1] * .67 + pixels.data[i + 2] * .10;
        // Preserve the licensed fabric's folds and scuffs. A darker base
        // helps distinguish the webbing from the slate uniform in daylight.
        const value = Math.min(210, 55 + .60 * luma);
        pixels.data[i] = Math.min(255, value * .97);
        pixels.data[i + 1] = Math.min(255, value * 1.025);
        pixels.data[i + 2] = Math.min(255, value * .985);
      }
      ctx.putImageData(pixels, 0, 0);
      const result = new THREE.CanvasTexture(sheet);
      result.colorSpace = source.colorSpace;
      result.flipY = source.flipY;
      result.wrapS = source.wrapS;
      result.wrapT = source.wrapT;
      result.repeat.copy(source.repeat);
      result.offset.copy(source.offset);
      result.rotation = source.rotation;
      result.center.copy(source.center);
      result.anisotropy = source.anisotropy;
      sandMaps.set(source.uuid, result);
      return result;
    } catch {
      return source;
    }
  }

  function mountProceduralRespirator() {
    // Small original 3D prop layered on the licensed operator. These pieces
    // are authored as primitives rather than copied from a reference asset.
    const mask = new THREE.Group();
    // The rigged model's visible face sits below its overall head bounding
    // box; 4.43 placed the prop floating above the operator's helmet.
    mask.position.set(0, 3.82, 0.43);
    mask.rotation.y = -0.12;
    mask.scale.setScalar(0.83);
    const shell = new THREE.MeshStandardMaterial({ color: '#4a5559', roughness: .89, metalness: .12 });
    const rubber = new THREE.MeshStandardMaterial({ color: '#151a1e', roughness: .93 });
    const glass = new THREE.MeshPhysicalMaterial({ color: '#12191b', metalness: .22, roughness: .31, clearcoat: .31 });
    const steel = new THREE.MeshStandardMaterial({ color: '#535d60', roughness: .74, metalness: .32 });
    const darkSteel = new THREE.MeshStandardMaterial({ color: '#293235', roughness: .76, metalness: .26 });
    const face = new THREE.Mesh(new THREE.SphereGeometry(.26, 12, 10), shell);
    face.scale.set(.98, 1.13, .64);
    face.position.set(0, -.05, 0);
    mask.add(face);
    for (const side of [-1, 1]) {
      // Deep gaskets and smaller lenses avoid the cartoon-like goggle outline.
      const gasket = new THREE.Mesh(new THREE.CylinderGeometry(.087, .099, .047, 12), rubber);
      gasket.rotation.x = Math.PI / 2;
      gasket.position.set(side * .126, .05, .16);
      mask.add(gasket);
      const eyepiece = new THREE.Mesh(new THREE.SphereGeometry(.074, 16, 12), glass);
      eyepiece.scale.set(1.02, .88, .36);
      eyepiece.position.set(side * .126, .05, .191);
      mask.add(eyepiece);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(.083, .008, 6, 16), darkSteel);
      rim.position.set(side * .126, .05, .21);
      mask.add(rim);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(.16, .027, .028), shell);
      brow.rotation.z = side * -.16;
      brow.position.set(side * .127, .146, .16);
      mask.add(brow);
      const cheek = new THREE.Mesh(new THREE.BoxGeometry(.117, .145, .06), shell);
      cheek.rotation.z = side * -.32;
      cheek.rotation.y = side * -.22;
      cheek.position.set(side * .172, -.132, .145);
      mask.add(cheek);
      // Angled rectangular filters have inset faces and vertical intake slots.
      const canister = new THREE.Mesh(new THREE.BoxGeometry(.113, .125, .071), darkSteel);
      canister.rotation.z = side * .29;
      canister.position.set(side * .209, -.202, .204);
      mask.add(canister);
      const filterFace = new THREE.Mesh(new THREE.BoxGeometry(.094, .102, .01), rubber);
      filterFace.rotation.z = side * .29;
      filterFace.position.set(side * .209, -.202, .244);
      mask.add(filterFace);
      for (let slot = -1; slot <= 1; slot++) {
        const intake = new THREE.Mesh(new THREE.BoxGeometry(.012, .068, .012), steel);
        intake.rotation.z = side * .29;
        intake.position.set(side * .209 + slot * .025, -.202, .251);
        mask.add(intake);
      }
      const strap = new THREE.Mesh(new THREE.BoxGeometry(.115, .024, .046), rubber);
      strap.position.set(side * .251, .13, -.031);
      strap.rotation.z = side * .28;
      mask.add(strap);
    }
    // A pointed nose bridge and inset exhalation valve add equipment detail.
    const bridge = new THREE.Mesh(new THREE.ConeGeometry(.07, .17, 4), shell);
    bridge.rotation.z = Math.PI;
    bridge.rotation.y = Math.PI / 4;
    bridge.position.set(0, -.057, .182);
    mask.add(bridge);
    const chin = new THREE.Mesh(new THREE.BoxGeometry(.14, .079, .072), darkSteel);
    chin.position.set(0, -.275, .134);
    mask.add(chin);
    const breathingPort = new THREE.Mesh(new THREE.CylinderGeometry(.089, .08, .108, 14), rubber);
    breathingPort.rotation.x = Math.PI / 2;
    breathingPort.position.set(0, -.179, .217);
    mask.add(breathingPort);
    const vent = new THREE.Mesh(new THREE.TorusGeometry(.067, .012, 6, 16), steel);
    vent.position.set(0, -.179, .281);
    mask.add(vent);
    for (let ring = 0; ring < 8; ring++) {
      const theta = ring * Math.PI / 4;
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(.009, .009, .007, 7), darkSteel);
      hole.rotation.x = Math.PI / 2;
      hole.position.set(Math.cos(theta) * .041, -.179 + Math.sin(theta) * .041, .288);
      mask.add(hole);
    }
    const valveCore = new THREE.Mesh(new THREE.CylinderGeometry(.023, .023, .012, 10), steel);
    valveCore.rotation.x = Math.PI / 2;
    valveCore.position.set(0, -.179, .291);
    mask.add(valveCore);
    soldierPivot.add(mask);
  }

  function mountLicensedRespirator() {
    host.dataset.operatorMask = 'loading';
    characterLoader.load('/models/characters/Operator_GasMask_CC0.glb', (gltf) => {
      const mask = gltf.scene;
      mask.traverse((node) => {
        if (!node.isMesh || !node.material) return;
        // The pickup's freestanding harness rises above the operator's head
        // when fitted as a portrait mask. Hide only that independently
        // materialed strap mesh; keep the mask shell, lenses and metal trim.
        // The free-standing prop's dark harness projects above the operator
        // as a floating loop after it is rotated upright. The sculpted
        // faceplate below supplies the shell silhouette, so omit that
        // accessory along with the original loose straps.
        if (node.material.name === 'olive' || node.material.name === 'black') {
          node.visible = false;
          return;
        }
        // The source pickup has translucent pale-blue lenses and olive straps.
        // For the smoky portrait, keep the geometry and use dark, opaque
        // eyepieces that read against the sunlit street behind the canvas.
        const material = node.material.clone();
        if (material.name === 'glass') {
          material.transmission = 0;
          material.color.set('#26333c');
          material.metalness = 0.38;
          material.roughness = 0.19;
          material.clearcoat = 0.65;
        }
        node.material = material;
      });
      // Bring the separate double-eyepiece mesh closer to the oversized,
      // deep-gasket lenses in the menu reference. Its origin is centred, so
      // enlarging it also increases the separation between the two lenses.
      const eyepieces = mask.getObjectByName('gas-mask_1');
      if (eyepieces) eyepieces.scale.multiplyScalar(1.31);
      // This CC0 pickup is modelled face-up on the ground. Rotate its normal
      // towards the portrait camera, then fit its own bounds around the face.
      mask.rotation.x = Math.PI / 2;
      mask.updateMatrixWorld(true);
      const unscaled = new THREE.Box3().setFromObject(mask);
      const size = unscaled.getSize(new THREE.Vector3());
      if (size.x < 0.01 || size.y < 0.01) {
        mountProceduralRespirator();
        host.dataset.operatorMask = 'fallback';
        draw();
        return;
      }
      // Fill the face with two large circular respirator eyepieces. The
      // reference has full-size glass surrounded by deep black gaskets;
      // the unmodified pickup reads as two small bright dots at lobby scale.
      mask.scale.setScalar(Math.min(0.73 / size.x, 0.74 / size.y));
      mask.updateMatrixWorld(true);
      const fitted = new THREE.Box3().setFromObject(mask);
      const center = fitted.getCenter(new THREE.Vector3());
      mask.position.sub(center);
      const mount = new THREE.Group();
      mount.position.set(0, 3.88, 0.79);
      mount.rotation.y = -0.12;
      mount.add(mask);
      const portrait = new THREE.Group();
      portrait.position.set(.035, -.23, 0);
      mount.add(portrait);
      // The source CC0 gas-mask is a compact prop. Build a portrait-scale
      // facepiece and filter detail from original primitives over its shell,
      // to reproduce the weight of a full-face military respirator on screen.
      // Give the independently modelled facepiece the fine grain of woven,
      // weathered rubber rather than the flat plastic finish of a primitive.
      const maskGrainCanvas = document.createElement('canvas');
      maskGrainCanvas.width = maskGrainCanvas.height = 128;
      const maskGrainContext = maskGrainCanvas.getContext('2d');
      if (maskGrainContext) {
        const grain = maskGrainContext.createImageData(128, 128);
        let seed = 4231;
        for (let pixel = 0; pixel < grain.data.length; pixel += 4) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          const shade = 92 + ((seed >>> 24) % 72);
          grain.data[pixel] = shade;
          grain.data[pixel + 1] = shade;
          grain.data[pixel + 2] = shade;
          grain.data[pixel + 3] = 255;
        }
        maskGrainContext.putImageData(grain, 0, 0);
      }
      const maskGrain = new THREE.CanvasTexture(maskGrainCanvas);
      maskGrain.wrapS = maskGrain.wrapT = THREE.RepeatWrapping;
      maskGrain.repeat.set(5, 5);
      const shell = new THREE.MeshStandardMaterial({
        color: '#43494a', roughness: .96, metalness: .04,
        bumpMap: maskGrain, bumpScale: .013,
      });
      const rubber = new THREE.MeshStandardMaterial({ color: '#181c1d', roughness: .9, metalness: .08 });
      const gasket = new THREE.MeshStandardMaterial({ color: '#0e1113', roughness: .77, metalness: .07 });
      const trim = new THREE.MeshStandardMaterial({ color: '#585d5c', roughness: .76, metalness: .3 });
      const smokedGlass = new THREE.MeshPhysicalMaterial({
        color: '#151b21', roughness: .17, metalness: .24, clearcoat: .94, clearcoatRoughness: .1,
      });
      const facePlate = new THREE.Mesh(new THREE.SphereGeometry(.255, 28, 20), shell);
      facePlate.scale.set(1, 1.12, .46);
      facePlate.position.set(0, -.025, .175);
      portrait.add(facePlate);
      // Continue the fabric hood above the brows. This also covers the
      // tactical character's contrasting skull cap, visible as a flat black
      // semicircle above the source pickup in the desktop capture.
      const hoodGeometry = new THREE.SphereGeometry(.225, 36, 22);
      const hoodVertices = hoodGeometry.getAttribute('position');
      for (let index = 0; index < hoodVertices.count; index++) {
        const x = hoodVertices.getX(index);
        const y = hoodVertices.getY(index);
        const z = hoodVertices.getZ(index);
        // A softly uneven cloth crown removes the manufactured cap profile.
        hoodVertices.setXYZ(index,
          x * (1 + .035 * Math.sin(z * 37 + y * 11)),
          y + .005 * Math.sin(x * 48 + z * 9),
          z + .007 * Math.sin(x * 35 - y * 29));
      }
      hoodGeometry.computeVertexNormals();
      const hood = new THREE.Mesh(hoodGeometry,
        new THREE.MeshStandardMaterial({
          color: '#3c4648', roughness: .99, metalness: 0,
          bumpMap: maskGrain, bumpScale: .019,
        }));
      hood.scale.set(.93, .61, .78);
      hood.position.set(0, .165, .105);
      portrait.add(hood);
      // Stitched cloth folds travel over the brow and into the mask's side
      // straps; each is short so the crown retains a natural fabric shape.
      const stitch = new THREE.MeshStandardMaterial({ color: '#252e30', roughness: 1 });
      for (const side of [-1, 1]) {
        const seam = new THREE.Mesh(new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3([
            new THREE.Vector3(side * .04, .258, .20),
            new THREE.Vector3(side * .115, .251, .19),
            new THREE.Vector3(side * .174, .207, .162),
            new THREE.Vector3(side * .193, .139, .128),
          ]), 14, .0028, 4, false), stitch);
        portrait.add(seam);
      }
      const foreheadSeam = new THREE.Mesh(new THREE.TorusGeometry(.211, .014, 6, 32, Math.PI), rubber);
      foreheadSeam.rotation.z = Math.PI;
      foreheadSeam.scale.set(1.02, 1.28, 1);
      foreheadSeam.position.set(0, .04, .253);
      portrait.add(foreheadSeam);
      // Keep a shallow matte brow integrated with the faceplate. The former
      // protruding brow and chrome crown ring read as a helmet visor in the
      // front-facing lobby shot rather than a continuous respirator hood.
      const browPad = new THREE.Mesh(new THREE.SphereGeometry(.215, 24, 14), shell);
      browPad.scale.set(1.02, .14, .55);
      browPad.position.set(0, .159, .160);
      portrait.add(browPad);
      for (const side of [-1, 1]) {
        const eye = new THREE.Group();
        eye.position.set(side * .125, .065, .292);
        const rubberSocket = new THREE.Mesh(new THREE.CylinderGeometry(.085, .088, .07, 32), gasket);
        rubberSocket.rotation.x = Math.PI / 2;
        eye.add(rubberSocket);
        const steelRim = new THREE.Mesh(new THREE.TorusGeometry(.076, .009, 9, 32), rubber);
        steelRim.position.z = .042;
        eye.add(steelRim);
        const lens = new THREE.Mesh(new THREE.SphereGeometry(.073, 24, 16), smokedGlass);
        lens.scale.set(1, 1, .27);
        lens.position.z = .043;
        eye.add(lens);
        // A deliberately small, offset catchlight gives each dark lens
        // enough roundness without making the face look cartoonish.
        const reflection = new THREE.Mesh(new THREE.SphereGeometry(.012, 10, 8),
          new THREE.MeshBasicMaterial({ color: '#879495', transparent: true, opacity: .24 }));
        reflection.scale.set(.9, 1, .14);
        reflection.position.set(-.021, .029, .065);
        eye.add(reflection);
        portrait.add(eye);
        const cheekPanel = new THREE.Mesh(new THREE.SphereGeometry(.102, 12, 10), shell);
        cheekPanel.scale.set(.86, 1.02, .36);
        cheekPanel.position.set(side * .162, -.169, .284);
        cheekPanel.rotation.z = side * -.27;
        portrait.add(cheekPanel);
        const cheekSeam = new THREE.Mesh(new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3([
            new THREE.Vector3(side * .218, -.038, .283),
            new THREE.Vector3(side * .234, -.113, .289),
            new THREE.Vector3(side * .217, -.205, .289),
            new THREE.Vector3(side * .173, -.273, .285),
          ]), 14, .004, 5, false), rubber);
        portrait.add(cheekSeam);
        // Thin rectangular intake ribs make the cheeks read as fabric-backed
        // filter housings, instead of two additional large round eyes.
        const intakeHousing = new THREE.Mesh(new THREE.BoxGeometry(.105, .087, .043), rubber);
        intakeHousing.position.set(side * .165, -.217, .324);
        intakeHousing.rotation.z = side * .23;
        portrait.add(intakeHousing);
        for (let groove = 0; groove < 4; groove++) {
          const rib = new THREE.Mesh(new THREE.BoxGeometry(.085, .007, .009), trim);
          rib.position.set(side * .165, -.246 + groove * .018, .350);
          rib.rotation.z = side * .23;
          portrait.add(rib);
        }
      }
      const noseBridge = new THREE.Mesh(new THREE.ConeGeometry(.075, .155, 8), trim);
      noseBridge.rotation.z = Math.PI;
      noseBridge.position.set(0, -.12, .314);
      portrait.add(noseBridge);
      const respirator = new THREE.Mesh(new THREE.CylinderGeometry(.087, .079, .095, 24), gasket);
      respirator.rotation.x = Math.PI / 2;
      respirator.position.set(0, -.215, .36);
      portrait.add(respirator);
      const ventRim = new THREE.Mesh(new THREE.TorusGeometry(.072, .012, 8, 24), trim);
      ventRim.position.set(0, -.215, .416);
      portrait.add(ventRim);
      for (let hole = 0; hole < 8; hole++) {
        const angle = hole * Math.PI / 4;
        const opening = new THREE.Mesh(new THREE.SphereGeometry(.008, 6, 5), rubber);
        opening.position.set(Math.cos(angle) * .043, -.215 + Math.sin(angle) * .043, .421);
        portrait.add(opening);
      }
      soldierPivot.add(mount);
      host.dataset.operatorMask = 'licensed';
      draw();
    }, undefined, () => {
      mountProceduralRespirator();
      host.dataset.operatorMask = 'fallback';
      draw();
    });
  }

  function poseRifleGrip(soldier, rifle) {
    // The licensed rig has an idle pose but no authored animation. Adjust only
    // the upper/lower arm bones so the wrists meet the independent rifle's
    // genuine grip sockets, instead of floating above the gun.
    const bones = new Map();
    soldier.traverse((node) => { if (node.isBone) bones.set(node.name, node); });
    const bone = (suffix) => [...bones].find(([name]) => name.endsWith(suffix))?.[1];
    const limbs = [
      { hand: bone('RightHand_011'), elbow: bone('RightForeArm_010'), arm: bone('RightArm_09'), socket: rifle.getObjectByName('PrimaryGrip'), maxDeviation: 1.10 },
      { hand: bone('LeftHand_035'), elbow: bone('LeftForeArm_034'), arm: bone('LeftArm_033'), socket: rifle.getObjectByName('ForegripContact'), maxDeviation: 1.20 },
    ];
    for (const limb of limbs) {
      if (!limb.hand || !limb.elbow || !limb.arm || !limb.socket) continue;
      const rest = new Map([[limb.elbow, limb.elbow.quaternion.clone()], [limb.arm, limb.arm.quaternion.clone()]]);
      for (let iteration = 0; iteration < 36; iteration++) {
        soldierPivot.updateMatrixWorld(true);
        const tip = limb.hand.getWorldPosition(new THREE.Vector3());
        const target = limb.socket.getWorldPosition(new THREE.Vector3());
        if (tip.distanceTo(target) < 0.025) break;
        for (const joint of [limb.elbow, limb.arm]) {
          soldierPivot.updateMatrixWorld(true);
          const pivot = joint.getWorldPosition(new THREE.Vector3());
          const from = limb.hand.getWorldPosition(new THREE.Vector3()).sub(pivot);
          const to = limb.socket.getWorldPosition(new THREE.Vector3()).sub(pivot);
          if (from.lengthSq() < 0.0001 || to.lengthSq() < 0.0001) continue;
          const rotation = new THREE.Quaternion().setFromUnitVectors(from.normalize(), to.normalize());
          const angle = 2 * Math.acos(THREE.MathUtils.clamp(rotation.w, -1, 1));
          if (angle < 0.0001) continue;
          if (angle > 0.14) rotation.slerp(new THREE.Quaternion(), 1 - 0.14 / angle);
          const parentRotation = joint.parent.getWorldQuaternion(new THREE.Quaternion());
          const localRotation = parentRotation.clone().invert().multiply(rotation).multiply(parentRotation);
          joint.quaternion.premultiply(localRotation).normalize();
          const base = rest.get(joint);
          const deviation = joint.quaternion.angleTo(base);
          if (deviation > limb.maxDeviation) joint.quaternion.slerp(base, 1 - limb.maxDeviation / deviation);
        }
      }
    }
    soldierPivot.updateMatrixWorld(true);
    return limbs.map(({ hand, socket }) => hand && socket
      ? +hand.getWorldPosition(new THREE.Vector3()).distanceTo(socket.getWorldPosition(new THREE.Vector3())).toFixed(3)
      : null);
  }

  function mountOperator(gltf, { tactical }) {
    const soldier = gltf.scene;
    const bounds = new THREE.Box3().setFromObject(soldier);
    const height = Math.max(0.01, bounds.max.y - bounds.min.y);
    soldier.scale.setScalar((tactical ? 4.75 : 4.6) / height);
    const fitted = new THREE.Box3().setFromObject(soldier);
    const center = fitted.getCenter(new THREE.Vector3());
    soldier.position.x = -center.x;
    soldier.position.y = -fitted.min.y;
    soldier.position.z = -center.z;
    // Present the chest more directly to the camera, matching the frontal
    // visual weight of the reference lobby without altering the model rig.
    soldier.rotation.y = tactical ? -0.12 : -0.2;
    soldier.traverse((node) => {
      if (node.isMesh) node.frustumCulled = false;
      // The redistributed tactical mesh includes a headset accessory whose
      // transform places it well above the head. Hide that isolated piece.
      if (tactical && node.isMesh && ['HeadphonesT', 'GreenCap'].includes(node.material?.name)) node.visible = false;
      // The stock character face and hard cap extend through the independently
      // fitted respirator. Replace only the head shell with a fabric hood so
      // the top of the portrait does not read as a floating glossy helmet.
      if (tactical && node.isMesh && node.material?.name === 'Mil_Suit_R5_Head') node.visible = false;
      if (tactical && node.isMesh && node.material?.color) {
        // Retain the CC BY model's texture detail. The operator in the menu
        // reference wears desaturated grey-green armor; cool the webbing and
        // pouches while leaving readable separation from the blue-grey suit.
        const name = node.material.name ?? '';
        if (/Mil_Suit|GreenCap/i.test(name)) {
          node.material = node.material.clone();
          const webbing = /Puches|Plate/i.test(name);
          const armoredPads = /Pads/i.test(name);
          node.material.map = webbing
            ? sandWebbingTexture(node.material.map)
            : slateTexture(node.material.map);
          node.material.color.set(name.includes('Head') ? '#414c55'
            : webbing ? '#bdc5bc'
              : armoredPads ? '#d5dcd9' : '#c5d0d9');
        }
      }
    });
    if (tactical) {
      // Give the licensed idle rig a planted, wider stance. The source pose
      // reads broad at the boots; the untouched rig stands almost straight.
      soldier.traverse((node) => {
        if (!node.isBone) return;
        if (node.name.endsWith('RightUpLeg_057')) node.rotation.z -= 0.12;
        if (node.name.endsWith('LeftUpLeg_063')) node.rotation.z += 0.12;
      });
    }
    soldierPivot.add(soldier);
    if (tactical) {
      const hoodMaterial = new THREE.MeshStandardMaterial({
        color: '#414a4c', roughness: .99, metalness: 0,
      });
      // Keep only a tapered fabric neck under the fitted respirator. The old
      // high cylinder protruded above its crown as a flat-topped toy helmet.
      const hoodNeck = new THREE.Mesh(new THREE.CylinderGeometry(.19, .26, .21, 28), hoodMaterial);
      hoodNeck.position.set(0, 3.74, .52);
      soldierPivot.add(hoodNeck);
      mountLicensedRespirator();
      // CC0 M4A1, supplied independently of the character rig. The operator's
      // default fists are raised at chest height; the rifle sits between them.
      host.dataset.operatorWeapon = 'pending';
      characterLoader.load('/models/characters/Operator_Rifle.glb', (weaponGltf) => {
        const rifle = weaponGltf.scene;
        // The source weapon ships with a separate spare magazine suspended
        // below the gun. It reads as a floating prop in the lobby portrait.
        const spareMagazine = rifle.getObjectByName('SpareMagazine');
        if (spareMagazine) spareMagazine.visible = false;
        rifle.traverse((node) => {
          if (!node.isMesh) return;
          const darken = (source) => {
            const material = source.clone();
            if (material.map) {
              material.map = slateTexture(material.map);
              material.color.set('#abb4bb');
            } else {
              material.color?.lerp(new THREE.Color('#35434c'), .6);
            }
            if (material.metalness !== undefined) material.metalness = Math.max(.38, material.metalness);
            return material;
          };
          node.material = Array.isArray(node.material)
            ? node.material.map(darken)
            : darken(node.material);
        });
        const weaponBounds = new THREE.Box3().setFromObject(rifle);
        const length = Math.max(...weaponBounds.getSize(new THREE.Vector3()).toArray(), 0.001);
        rifle.scale.setScalar(2.07 / length);
        const center = new THREE.Box3().setFromObject(rifle).getCenter(new THREE.Vector3());
        rifle.position.copy(center.multiplyScalar(-1));
        const gunMount = new THREE.Group();
        // Align the separate rifle with the operator's raised hands. The
        // larger lobby-scale operator's wrists sit just below shoulder height.
        // The stock must point screen-left and the barrel screen-right, with
        // the receiver crossing the raised wrists rather than the lower vest.
        // The reference operator carries the stock near shoulder level;
        // raise the entire rigid weapon and let poseRifleGrip re-solve the
        // licensed character's arm bones against its existing grip sockets.
        gunMount.position.set(-0.20, 2.78, 0.73);
        gunMount.rotation.set(-0.12, -2.01, 0.32);
        // Tilt in the operator's world XY plane: the M4A1's long axis is
        // not aligned to its local X axis, so Euler Z alone leaves the barrel
        // nearly horizontal in the lobby portrait.
        gunMount.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 0, 1), 0.15,
        ));
        gunMount.add(rifle);
        soldierPivot.add(gunMount);
        const gripErrors = poseRifleGrip(soldier, rifle);
        if (new URLSearchParams(location.search).has('debugAssets')) {
          soldierPivot.updateMatrixWorld(true);
          const point = (node) => node
            ? soldierPivot.worldToLocal(node.getWorldPosition(new THREE.Vector3())).toArray().map((v) => +v.toFixed(3))
            : null;
          const findBone = (suffix) => {
            let result;
            soldier.traverse((node) => { if (node.isBone && node.name.includes(suffix)) result = node; });
            return result;
          };
          host.dataset.poseProbe = JSON.stringify({
            gripErrors,
            spareMagazineHidden: !!spareMagazine && !spareMagazine.visible,
            rightHand: point(findBone('RightHand_011')),
            leftHand: point(findBone('LeftHand_035')),
            rightElbow: point(findBone('RightForeArm_010')),
            leftElbow: point(findBone('LeftForeArm_034')),
            primaryGrip: point(rifle.getObjectByName('PrimaryGrip')),
            foregrip: point(rifle.getObjectByName('ForegripContact')),
            stock: point(rifle.getObjectByName('StockContact')),
            muzzle: point(rifle.getObjectByName('MuzzleContact')),
          });
        }
        host.dataset.operatorWeapon = 'ready';
        draw();
      }, undefined, () => {
        host.dataset.operatorWeapon = 'unavailable';
      });
    }
    const idle = gltf.animations.find((clip) => clip.name.toLowerCase() === 'idle');
    if (idle) {
      mixer = new THREE.AnimationMixer(soldier);
      mixer.clipAction(idle).play();
    }
    host.dataset.operator = tactical ? 'tactical' : 'fallback';
    if (!tactical) host.dataset.operatorWeapon = 'fallback';
    host.classList.add('strike-scene-ready');
    draw();
  }
  characterLoader.load('/models/characters/Operator_Tactical.glb', (gltf) => {
    mountOperator(gltf, { tactical: true });
  }, undefined, () => {
    characterLoader.load('/models/characters/Character_Soldier.gltf', (gltf) => {
      mountOperator(gltf, { tactical: false });
    }, undefined, () => {
      host.classList.add('strike-scene-model-missing');
    });
  });

  const clock = new THREE.Clock();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let intersecting = true;
  let frame = 0;
  let backgroundDirty = true;

  function resize() {
    const { width, height } = canvas.getBoundingClientRect();
    if (width < 2 || height < 2) return;
    camera.aspect = width / height;
    camera.position.x = width < 700 ? 1.7 : 0.2;
    camera.lookAt(camera.position.x, 1.65, 0);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    backgroundRenderer.setSize(width, height, false);
    backgroundDirty = true;
    draw();
  }

  function draw() {
    if (menu.classList.contains('hidden') || document.hidden) return;
    if (backgroundDirty) {
      backgroundRenderer.render(scene, camera);
      backgroundDirty = false;
    }
    renderer.render(operatorScene, camera);
  }

  function tick() {
    frame = 0;
    if (!intersecting || document.hidden || menu.classList.contains('hidden')) return;
    const delta = Math.min(clock.getDelta(), 0.05);
    idleElapsed += delta;
    mixer?.update(delta);
    soldierPivot.rotation.y = reducedMotion.matches ? 0 : Math.sin(idleElapsed * 0.25) * 0.042;
    // Subtle breathing for the photo-real operator, which is delivered with a
    // rig but without animation clips. Reduced-motion keeps it static.
    soldierPivot.scale.y = !reducedMotion.matches && host.dataset.operator === 'tactical'
      ? 1.025 + Math.sin(idleElapsed * 1.5) * 0.0025 : 1.025;
    draw();
    if (!reducedMotion.matches) frame = requestAnimationFrame(tick);
  }

  function updateLoop() {
    cancelAnimationFrame(frame);
    frame = 0;
    if (!intersecting || document.hidden || menu.classList.contains('hidden')) return;
    clock.getDelta();
    resize();
    if (!reducedMotion.matches) frame = requestAnimationFrame(tick);
  }

  new ResizeObserver(resize).observe(host);
  new IntersectionObserver(([entry]) => {
    intersecting = entry.isIntersecting;
    updateLoop();
  }, { threshold: 0.01 }).observe(host);
  new MutationObserver(updateLoop).observe(menu, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', updateLoop);
  reducedMotion.addEventListener('change', updateLoop);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    cancelAnimationFrame(frame);
    host.classList.add('strike-scene-fallback');
  });
  backgroundCanvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    host.classList.add('strike-scene-fallback');
  });
  resize();
}
