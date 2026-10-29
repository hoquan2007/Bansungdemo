// HIGHLANDS — an authored 540m mountain/forest team battlefield.
// All structural cover is shared between server and client; conifer crowns and
// distant peaks are decorative and are drawn separately by highlandsScenery.js.
import { box, stairs, barrel, crateStack } from './helpers.js';
import { compileBoxes, playerOverlapsAny } from '../collision.js';
import { MAX_PLAYERS, PLAYER_HEIGHT, PLAYER_RADIUS } from '../constants.js';

const HALF = 270;
const C = {
  ground: 0x596f4a, pine: 0x65543b, rock: 0x6e7775, snow: 0xc2c8bf,
  soil: 0x857459, path: 0x786b56, timber: 0x846747, cabin: 0x9d947e,
  roof: 0x474e51, steel: 0x626e72, rust: 0x8f6149, concrete: 0x98998c,
  green: 0x3d5442, warning: 0xc2a15b,
};

const materials = {
  [C.ground]: 'grass', [C.pine]: 'wood', [C.rock]: 'stone',
  [C.snow]: 'stone', [C.soil]: 'dirt', [C.path]: 'dirt',
  [C.timber]: 'wood', [C.cabin]: 'plaster', [C.roof]: 'roof',
  [C.steel]: 'metal', [C.rust]: 'metal', [C.concrete]: 'plaster',
  [C.green]: 'metal', [C.warning]: 'plaster',
};

function random(a, b, salt = 0) {
  let n = Math.imul(a + 341, 374761393) ^ Math.imul(b - 977, 668265263) ^ Math.imul(salt + 23, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

const areas = [
  { id: 'summit', name: 'Frostline Summit', pos: [4, 155], radius: 45 },
  { id: 'logging', name: 'Blackpine Logging Camp', pos: [-145, 42], radius: 48 },
  { id: 'radar', name: 'Northstar Radar Station', pos: [148, 95], radius: 45 },
  { id: 'quarry', name: 'Broken Slate Quarry', pos: [-23, -151], radius: 47 },
  { id: 'viaduct', name: 'Timberline Viaduct', pos: [0, 1], radius: 44 },
  { id: 'lake', name: 'Mirror Lake Outpost', pos: [158, -115], radius: 44 },
  { id: 'ranger', name: 'Old Ranger Cabins', pos: [-166, -139], radius: 41 },
  { id: 'watch', name: 'Eaglewatch Ridge', pos: [-151, 166], radius: 40 },
];

const pines = [];
const rocks = [];
const boxes = [box(0, -1, 0, 562, 1, 562, C.ground)];

// Four tall perimeter cliffs: the skyline continues past them in the renderer.
for (const [x, z, w, d] of [[0, -272, 548, 4], [0, 272, 548, 4], [-272, 0, 4, 548], [272, 0, 4, 548]]) {
  boxes.push(box(x, -1.5, z, w, 14, d, C.rock));
}

function groundPatch(x, z, w, d, color, texture = 'dirt') {
  // Surfaces are flush to the top of the foundation and do not impede movement.
  boxes.push(box(x, -0.08, z, w, 0.08, d, color, `surface:${texture}:1`));
}

function cabin(x, z, w = 16, d = 11, h = 4.5, side = 's') {
  const t = 0.55;
  const door = 3.3;
  for (const face of ['n', 's', 'e', 'w']) {
    const front = face === 'n' || face === 's';
    const length = front ? w : d;
    const wallX = front ? x : x + (face === 'e' ? w / 2 - t / 2 : -w / 2 + t / 2);
    const wallZ = front ? z + (face === 'n' ? d / 2 - t / 2 : -d / 2 + t / 2) : z;
    const segments = face === side ? [[-length / 2, -door / 2], [door / 2, length / 2]] : [[-length / 2, length / 2]];
    for (const [a, b] of segments) {
      const s = b - a;
      if (front) boxes.push(box(wallX + (a + b) / 2, 0, wallZ, s, h, t, C.cabin));
      else boxes.push(box(wallX, 0, wallZ + (a + b) / 2, t, h, s, C.cabin));
    }
  }
  boxes.push(box(x, h, z, w + 1.2, 0.55, d + 1.2, C.roof));
}

function terrace(x, z, w, d, height, color = C.rock) {
  boxes.push(box(x, -0.5, z, w, height + 0.5, d, color));
  // Every elevated fighting position has two separate climb routes.
  const run = Math.max(12, height * 3.6);
  boxes.push(...stairs({ x, y: 0, z: z - d / 2 - run, width: 4.5, rise: height,
    run, axis: 'z', dir: 1, color: C.soil }));
  boxes.push(...stairs({ x: x + w / 2 + run, y: 0, z,
    width: 4.5, rise: height, run, axis: 'x', dir: -1, color: C.soil }));
}

function checkpoint(x, z, direction = 1) {
  boxes.push(box(x - 8, 0, z, 2.2, 2.1, 6.5, C.concrete));
  boxes.push(box(x + 8, 0, z, 2.2, 2.1, 6.5, C.concrete));
  boxes.push(box(x, 4.8, z, 20, 0.8, 4, C.steel));
  boxes.push(box(x, 0, z + direction * 11, 5, 1.3, 1.8, C.concrete));
}

// Winding mountain tracks and open glades connect the named strongholds.
for (const [x, z, w, d] of [
  [0, 0, 340, 9], [0, 0, 9, 335], [-112, 104, 9, 140],
  [110, -99, 9, 145], [-88, -84, 124, 8], [89, 102, 125, 8],
  [-175, 4, 8, 78], [177, -49, 8, 125],
]) groundPatch(x, z, w, d, C.path);

// Summit: long-range overwatch with accessible layered ledges.
terrace(4, 155, 58, 43, 5.2);
boxes.push(box(4, 5.2, 155, 16, 2.2, 2.5, C.concrete));
boxes.push(box(-13, 5.2, 168, 4, 1.6, 11, C.concrete));
boxes.push(box(22, 5.2, 142, 7, 1.2, 3, C.concrete));
checkpoint(2, 109);

// Radar station: a second high position on the opposite side of the valley.
terrace(148, 95, 53, 48, 3.9, C.concrete);
boxes.push(box(148, 3.9, 95, 4.5, 10, 4.5, C.steel));
boxes.push(box(148, 14, 95, 16, 1.1, 5, C.roof));
boxes.push(box(136, 3.9, 77, 12, 2.6, 2.2, C.concrete));
boxes.push(box(166, 3.9, 106, 2.8, 2.1, 13, C.concrete));

// Logging camp: walk-through sheds and log rows break rifle sightlines.
groundPatch(-145, 42, 74, 69, C.soil);
cabin(-157, 52, 18, 14, 5, 'e');
cabin(-124, 18, 17, 13, 4.4, 's');
for (let i = 0; i < 8; i++) boxes.push(box(-174 + i * 6.5, 0, 78, 4.5, 1.4, 2.6, C.timber));
boxes.push(...crateStack({ x: -136, z: 64, size: 2.1, height: 2, color: C.timber, seed: 8 }));

// Quarry: staggered extraction terraces, two exposed stair approaches and cover.
terrace(-23, -151, 61, 52, 3.5);
for (const [x, z, w, h, d] of [[-42, -157, 9, 2.4, 4], [-9, -134, 8, 2, 4],
  [1, -175, 4, 2.6, 16], [-61, -126, 7, 2, 12]]) boxes.push(box(x, 0, z, w, h, d, C.rock));
boxes.push(box(-41, 3.5, -136, 12, 1.4, 3.5, C.steel));
boxes.push(barrel(-68, 0, -155));

// Central viaduct: visible meeting point, with parallel passages underneath.
for (const x of [-18, 18]) boxes.push(box(x, 0, 0, 3.4, 8.5, 4, C.rock));
boxes.push(box(0, 8.5, 0, 43, 1, 6.2, C.timber));
boxes.push(...stairs({ x: -36, y: 0, z: 0, width: 5.5, rise: 9.5, run: 16,
  axis: 'x', dir: 1, color: C.rock }));
boxes.push(...stairs({ x: 36, y: 0, z: 0, width: 5.5, rise: 9.5, run: 16,
  axis: 'x', dir: -1, color: C.rock }));
for (const z of [-24, 24]) boxes.push(box(0, 0, z, 10, 1.35, 2.8, C.rock));

// Lake outpost is a dry, playable lakeside basin and maintenance depot.
groundPatch(158, -115, 70, 58, C.soil);
groundPatch(191, -157, 54, 19, 0x7895a0, 'water');
cabin(149, -121, 17, 11, 4.2, 'w');
checkpoint(173, -91, -1);
boxes.push(...crateStack({ x: 179, z: -122, height: 3, color: C.timber, seed: 19 }));

// Ranger settlement and eaglewatch are opposing traversal and flank landmarks.
cabin(-166, -139, 16, 11, 4.8, 'e');
cabin(-141, -158, 13, 13, 4.5, 'n');
boxes.push(box(-173, 0, -118, 8, 1.6, 2, C.rock));
terrace(-151, 166, 31, 31, 4.1);
boxes.push(box(-151, 4.1, 166, 5, 8, 5, C.timber));
boxes.push(box(-151, 12, 166, 11, 0.6, 11, C.roof));

// Dense but traversable conifer belts. Keep tracks, landmarks and coastal
// spawn sectors clear; adjacent trunks are separated by at least 7m.
const treeClearings = areas.map((a) => ({ x: a.pos[0], z: a.pos[1], r: a.radius + 9 }));
for (let x = -248; x <= 248; x += 11) {
  for (let z = -248; z <= 248; z += 11) {
    if (random(x, z, 7) < 0.46) continue;
    const px = x + (random(x, z, 8) - 0.5) * 3.6;
    const pz = z + (random(x, z, 9) - 0.5) * 3.6;
    if (treeClearings.some((a) => Math.hypot(px - a.x, pz - a.z) < a.r)) continue;
    if (Math.abs(px) < 12 || Math.abs(pz) < 12) continue;
    if (Math.abs(px + 112) < 13 && pz > 25 && pz < 180) continue;
    if (Math.abs(px - 110) < 13 && pz > -175 && pz < 10) continue;
    const size = 0.85 + random(x, z, 10) * 0.5;
    const trunk = 0.8 * size;
    const height = 9 + 5 * size;
    boxes.push(box(px, 0, pz, trunk, height * 0.64, trunk, C.pine, 'pine-trunk'));
    pines.push({ x: px, z: pz, height, size });
  }
}

// Rocky outcrops add cover to the central lanes and bridge open patches.
for (let i = 0; i < 120; i++) {
  const x = -243 + random(i, 13) * 486;
  const z = -243 + random(i, 14) * 486;
  if (treeClearings.some((a) => Math.hypot(x - a.x, z - a.z) < a.r - 6)) continue;
  if (Math.abs(x) < 9 || Math.abs(z) < 9) continue;
  const size = 1.8 + random(i, 15) * 3.2;
  boxes.push(box(x, 0, z, size, size * 0.65, size * 0.8, C.rock));
  rocks.push({ x, z, size });
}

const solids = compileBoxes(boxes);
function clearPoint(x, z, radius = PLAYER_RADIUS) {
  return !playerOverlapsAny([x, 0, z], PLAYER_HEIGHT, radius, solids);
}

// Separate, non-overlapping coastal sectors allow four independent squads to
// spawn out of sight of one another; the same positions work for two teams.
function spawnArc(from, to, count) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const angle = from + (to - from) * (i + 0.5) / count;
    let found = null;
    for (let radius = 250; radius >= 170; radius -= 3) {
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (clearPoint(x, z)) { found = [x, 0, z]; break; }
    }
    if (!found) throw new Error(`Highlands spawn obstructed at angle ${angle}`);
    points.push(found);
  }
  return points;
}

const spawns = {
  A: spawnArc(Math.PI * 0.13, Math.PI * 0.37, 10),
  B: spawnArc(Math.PI * 1.13, Math.PI * 1.37, 10),
  C: spawnArc(Math.PI * 0.63, Math.PI * 0.87, 10),
  D: spawnArc(Math.PI * 1.63, Math.PI * 1.87, 10),
  ffa: spawnArc(0, Math.PI * 2, MAX_PLAYERS),
};

const healthPacks = [];
for (const { pos } of areas) {
  for (const [dx, dz] of [[-23, -21], [23, 21], [-20, 20], [20, -20]]) {
    const x = pos[0] + dx;
    const z = pos[1] + dz;
    if (clearPoint(x, z)) healthPacks.push([x, 0, z]);
  }
}

export default {
  id: 'highlands', name: 'Frostline Highlands',
  blurb: 'A 540m mountain forest with summit routes, radar base, quarry, cabins and four team sectors.',
  largeTeamMap: true, areas, pines, rocks,
  skyColor: 0x8ba9bb, fogColor: 0xb2c0bf, fogDensity: 0.0027,
  ambientLight: 0.82, sunDirection: [-0.45, 0.83, 0.4], sunIntensity: 1.05,
  detailTexture: 'stone', materialTextures: materials, groundTexture: 'grass', wallTexture: 'stone',
  bounds: { min: [-282, -12, -282], max: [282, 45, 282] },
  boxes, healthPacks, spawns,
};
