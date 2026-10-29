// Lightweight scenery for Crown Island. These meshes are purely decorative:
// collision, projectiles, spawns and line of sight still use shared/maps/island.js.
// Small low-profile ground details cannot be mistaken for tactical cover. Wall
// panels sit flush on existing solid walls, and cliffs dress the sea boundary.
// All placements are deterministic so teammates see the same landscape.
import * as THREE from 'three';

function random01(a, b, salt = 0) {
  const n = Math.sin(a * 127.1 + b * 311.7 + salt * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function pavedAreas(map) {
  // Stay off authored roads, concrete, runways, ploughed dirt and cobbled yards.
  // These are top-face paint overlays, not all the map's collision boxes.
  return map.solids.filter((s) => s.tag?.startsWith('surface:') &&
    !s.tag.startsWith('surface:grass')).map((s) => ({
    minX: s.min[0] - 0.35, maxX: s.max[0] + 0.35,
    minZ: s.min[2] - 0.35, maxZ: s.max[2] + 0.35,
  }));
}

/** Keep ground dressing away from roads, structures, spawns and building floors. */
function groundClearance(map) {
  const excluded = pavedAreas(map).map((area) => ({ ...area }));
  for (const solid of map.solids) {
    if (solid.tag?.startsWith('surface:')) continue;
    const width = solid.max[0] - solid.min[0];
    const depth = solid.max[2] - solid.min[2];
    // The island base is one enormous slab. Large elevated slabs are roofs;
    // their footprint also excludes the interior of an enclosed building.
    if (width > 300 && depth > 300) continue;
    const touchesGround = solid.min[1] < 1 && solid.max[1] > -0.25;
    const buildingRoof = solid.min[1] >= 2.5 && width >= 8 && depth >= 8;
    if (!touchesGround && !buildingRoof) continue;
    const margin = 1.15;
    excluded.push({
      minX: solid.min[0] - margin, maxX: solid.max[0] + margin,
      minZ: solid.min[2] - margin, maxZ: solid.max[2] + margin,
    });
  }
  const spawns = Object.values(map.spawns ?? {}).flat();
  return (x, z) =>
    !excluded.some((a) => x >= a.minX && x <= a.maxX && z >= a.minZ && z <= a.maxZ) &&
    spawns.every((p) => Math.hypot(p[0] - x, p[2] - z) > 8);
}

/** Sparse scrub and small stones enrich open land without introducing fake cover. */
function addUndergrowth(group, map) {
  const isClear = groundClearance(map);
  const specs = [
    { name: 'scrub', count: 3300, geometry: new THREE.IcosahedronGeometry(1, 0),
      material: new THREE.MeshLambertMaterial({ color: 0xe0e5d0, flatShading: true }) },
    { name: 'pebbles', count: 1050, geometry: new THREE.DodecahedronGeometry(1, 0),
      material: new THREE.MeshLambertMaterial({ color: 0xe0e0d4, flatShading: true }) },
  ];

  const obj = new THREE.Object3D();
  const color = new THREE.Color();
  for (const [kind, spec] of specs.entries()) {
    const mesh = new THREE.InstancedMesh(spec.geometry, spec.material, spec.count);
    mesh.name = `island-${spec.name}`;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    let count = 0;

    // An open scatter grid gives a regular coverage budget while jitter removes
    // the grid pattern. Subtract paved and collidable regions before committing.
    const grid = kind === 0 ? 75 : 60;
    for (let ix = 0; ix < grid && count < spec.count; ix++) {
      for (let iz = 0; iz < grid && count < spec.count; iz++) {
        const a = kind * 117 + ix;
        const b = iz;
        if (random01(a, b, 13) < (kind === 0 ? 0.12 : 0.68)) continue;
        const x = -261 + (ix + random01(a, b, 14)) * 522 / grid;
        const z = -261 + (iz + random01(a, b, 15)) * 522 / grid;
        if (!isClear(x, z)) continue;
        if (kind === 0) {
          const radius = 0.17 + random01(a, b, 16) * 0.28;
          const height = 0.13 + random01(a, b, 17) * 0.17;
          obj.scale.set(radius, height, radius * 0.92);
          obj.position.set(x, -0.5 + height * 0.78, z);
          color.setHSL(0.20 + random01(a, b, 18) * 0.12, 0.16 + random01(a, b, 19) * 0.23, 0.32 + random01(a, b, 20) * 0.18);
        } else {
          const size = 0.055 + random01(a, b, 16) * 0.12;
          obj.scale.set(size * 1.3, size * 0.58, size);
          obj.position.set(x, -0.5 + size * 0.45, z);
          color.setHSL(0.09 + random01(a, b, 18) * 0.07, 0.06 + random01(a, b, 19) * 0.1, 0.32 + random01(a, b, 20) * 0.22);
        }
        obj.rotation.y = random01(a, b, 21) * Math.PI * 2;
        obj.updateMatrix();
        mesh.setMatrixAt(count, obj.matrix);
        mesh.setColorAt(count, color);
        count++;
      }
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
}

/** Rock silhouette outside the existing 540m playable boundary wall. */
function addCoastalCliffs(group) {
  const geometry = new THREE.DodecahedronGeometry(1, 0);
  const material = new THREE.MeshLambertMaterial({ color: 0xd1d7cf, flatShading: true });
  const mesh = new THREE.InstancedMesh(geometry, material, 240);
  mesh.name = 'island-coastal-cliffs';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const obj = new THREE.Object3D();
  const color = new THREE.Color();
  for (let i = 0; i < 240; i++) {
    const side = Math.floor(i / 60);
    const segment = i % 60;
    const along = -275 + (segment + random01(i, side, 22) * 0.7) * 550 / 60;
    const edge = 276 + random01(i, side, 23) * 2.6;
    const x = side < 2 ? (side === 0 ? -edge : edge) : along;
    const z = side >= 2 ? (side === 2 ? -edge : edge) : along;
    const height = 6.5 + random01(i, side, 24) * 6.5;
    const girth = 2.6 + random01(i, side, 25) * 3.4;
    obj.position.set(x, -4.2 + height * 0.5, z);
    obj.rotation.set(random01(i, side, 26) * 0.22, random01(i, side, 27) * Math.PI, random01(i, side, 28) * 0.22);
    obj.scale.set(girth, height * 0.68, girth * 0.95);
    obj.updateMatrix();
    mesh.setMatrixAt(i, obj.matrix);
    color.setHSL(0.12 + random01(i, side, 29) * 0.04, 0.08 + random01(i, side, 30) * 0.12, 0.34 + random01(i, side, 31) * 0.2);
    mesh.setColorAt(i, color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  group.add(mesh);
}

/** Flush upper-floor window insets give blank buildings a readable scale. */
function addFacadeDetails(group, map) {
  const panes = [];
  const sills = [];
  for (const [wallIndex, wall] of map.solids.entries()) {
    const w = wall.max[0] - wall.min[0];
    const d = wall.max[2] - wall.min[2];
    const h = wall.max[1] - wall.min[1];
    if (wall.tag || h < 4.2 || h > 13 || Math.min(w, d) > 0.72 || Math.max(w, d) < 7) continue;
    const alongX = w > d;
    const length = alongX ? w : d;
    const cols = Math.min(8, Math.floor(length / 4.4));
    const rows = h >= 7.7 ? 2 : 1;
    for (let column = 0; column < cols; column++) {
      const p = (column + 1) / (cols + 1);
      const parallel = (alongX ? wall.min[0] : wall.min[2]) + p * length;
      for (let row = 0; row < rows; row++) {
        const y = wall.min[1] + 2.95 + row * 2.5;
        if (y + 0.62 > wall.max[1] - 0.3) continue;
        for (const direction of [-1, 1]) {
          const face = direction < 0 ? wall.min[alongX ? 2 : 0] : wall.max[alongX ? 2 : 0];
          const outward = face + direction * 0.045;
          const x = alongX ? parallel : outward;
          const z = alongX ? outward : parallel;
          const sx = alongX ? 1.3 : 0.07;
          const sz = alongX ? 0.07 : 1.3;
          panes.push({ x, y, z, sx, sy: 1.1, sz, seed: wallIndex + column * 13 + row * 73 });
          sills.push({ x: x + (alongX ? 0 : direction * 0.045), y: y - 0.61,
            z: z + (alongX ? direction * 0.045 : 0),
            sx: alongX ? 1.54 : 0.13, sy: 0.09, sz: alongX ? 0.13 : 1.54 });
        }
      }
    }
  }

  const cube = new THREE.BoxGeometry(1, 1, 1);
  const make = (name, entries, material, colored) => {
    const mesh = new THREE.InstancedMesh(cube.clone(), material, entries.length);
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    const transform = new THREE.Object3D();
    const color = new THREE.Color();
    entries.forEach((entry, i) => {
      transform.position.set(entry.x, entry.y, entry.z);
      transform.scale.set(entry.sx, entry.sy, entry.sz);
      transform.updateMatrix();
      mesh.setMatrixAt(i, transform.matrix);
      if (colored) {
        color.setHSL(0.54 + random01(entry.seed, i, 41) * 0.06, 0.1, 0.21 + random01(entry.seed, i, 42) * 0.13);
        mesh.setColorAt(i, color);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  };
  if (panes.length) {
    make('island-window-insets', panes, new THREE.MeshLambertMaterial({ color: 0xb9ccd3 }), true);
    make('island-window-sills', sills, new THREE.MeshLambertMaterial({ color: 0x757e7a }), false);
  }
  cube.dispose();
}

function addWildGrass(group, map) {
  // Crossed, pointed blades are readable from ground level and stay below the
  // player's knee. One instanced draw call covers the entire 540m island.
  const blade = new THREE.BufferGeometry();
  blade.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.12, 0, 0, 0, 0.62, 0, 0.12, 0, 0,
    0, 0, -0.12, 0, 0.52, 0, 0, 0, 0.12,
  ], 3));
  blade.computeVertexNormals();
  const material = new THREE.MeshLambertMaterial({
    color: 0xc5d3a6, side: THREE.DoubleSide, depthWrite: true,
  });

  const grid = 119;
  const grass = new THREE.InstancedMesh(blade, material, grid * grid);
  grass.castShadow = false;
  grass.receiveShadow = false;
  // Grass uses the same clearance as scrub and stones. Otherwise the blades
  // visibly grow through buildings, stairs, roads and protected spawn pads.
  const isClear = groundClearance(map);
  const obj = new THREE.Object3D();
  const color = new THREE.Color();
  let count = 0;

  for (let x = 0; x < grid; x++) {
    for (let z = 0; z < grid; z++) {
      if (random01(x, z, 1) < 0.13) continue;
      const px = -261 + (x + random01(x, z, 2) * 0.8) * (522 / grid);
      const pz = -261 + (z + random01(x, z, 3) * 0.8) * (522 / grid);
      if (!isClear(px, pz)) continue;

      const size = 0.68 + random01(x, z, 4) * 0.65;
      obj.position.set(px, -0.48, pz); // The base island floor tops out at -0.5m.
      obj.rotation.y = random01(x, z, 5) * Math.PI;
      obj.scale.set(size * 1.2, size, size * 1.2);
      obj.updateMatrix();
      grass.setMatrixAt(count, obj.matrix);

      // Natural olive, dry straw and green variation without more materials.
      color.setHSL(0.23 + random01(x, z, 6) * 0.07,
        0.27 + random01(x, z, 7) * 0.25,
        0.52 + random01(x, z, 8) * 0.19);
      grass.setColorAt(count, color);
      count++;
    }
  }
  grass.count = count;
  grass.instanceMatrix.needsUpdate = true;
  if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
  grass.computeBoundingSphere();
  group.add(grass);
}

/** A broad, irregular mountain with rolling shoulders instead of a cone silhouette. */
function mountainGeometry() {
  const sides = 19;
  const radii = [1, 0.83, 0.63, 0.37, 0.13];
  const elevations = [0, 0.08, 0.26, 0.55, 0.89];
  const rings = radii.map((radius, level) => Array.from({ length: sides }, (_, segment) => {
    const angle = segment / sides * Math.PI * 2;
    const jagged = Math.sin(angle * 3 + 0.6) * 0.09 + Math.sin(angle * 7 + 1.4) * 0.045;
    const irregular = 0.83 + random01(segment, level, 64) * 0.3 + jagged;
    const y = elevations[level] + (level ? (random01(segment, level, 65) - 0.5) * 0.075 : 0);
    return [Math.cos(angle) * radius * irregular, y - 0.5,
      Math.sin(angle) * radius * irregular * 0.82];
  }));
  const positions = [];
  const triangle = (a, b, c) => positions.push(...a, ...b, ...c);
  for (let level = 0; level < rings.length - 1; level++) {
    for (let segment = 0; segment < sides; segment++) {
      const next = (segment + 1) % sides;
      triangle(rings[level][segment], rings[level + 1][segment], rings[level][next]);
      triangle(rings[level][next], rings[level + 1][segment], rings[level + 1][next]);
    }
  }
  const peak = [0.05, 0.5, -0.04];
  for (let segment = 0; segment < sides; segment++) {
    triangle(rings.at(-1)[segment], peak, rings.at(-1)[(segment + 1) % sides]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function addCoastline(group) {
  // A low ocean surface and distant landforms give the island a geographical
  // silhouette. All of this stays beyond the four collision sea walls.
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 1200),
    new THREE.MeshLambertMaterial({ color: 0x568595, side: THREE.DoubleSide }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -4.7;
  ocean.receiveShadow = false;
  group.add(ocean);

  const ridgeGeometry = mountainGeometry();
  const ridgeMaterial = new THREE.MeshLambertMaterial({ flatShading: true });
  const ridges = new THREE.InstancedMesh(ridgeGeometry, ridgeMaterial, 33);
  ridges.name = 'island-distant-ridges';
  ridges.castShadow = false;
  const transform = new THREE.Object3D();
  const color = new THREE.Color();
  for (let i = 0; i < 33; i++) {
    const angle = (i / 33) * Math.PI * 2 + random01(i, 4) * 0.19;
    const distance = 355 + random01(i, 5) * 125;
    const height = 34 + random01(i, 6) * 55;
    const width = 43 + random01(i, 7) * 59;
    transform.position.set(Math.cos(angle) * distance, -5 + height / 2,
      Math.sin(angle) * distance);
    transform.rotation.y = random01(i, 8) * Math.PI;
    transform.scale.set(width, height, width);
    transform.updateMatrix();
    ridges.setMatrixAt(i, transform.matrix);
    color.setHSL(0.28, 0.08 + random01(i, 9) * 0.11, 0.39 + random01(i, 10) * 0.08);
    ridges.setColorAt(i, color);
  }
  ridges.instanceMatrix.needsUpdate = true;
  if (ridges.instanceColor) ridges.instanceColor.needsUpdate = true;
  ridges.computeBoundingSphere();
  group.add(ridges);
}

export function createIslandScenery(map) {
  const scenery = new THREE.Group();
  scenery.name = 'island-scenery';
  addCoastline(scenery);
  addWildGrass(scenery, map);
  addUndergrowth(scenery, map);
  addCoastalCliffs(scenery);
  addFacadeDetails(scenery, map);
  return scenery;
}

export function disposeIslandScenery(scenery) {
  if (!scenery) return;
  for (const mesh of scenery.children) {
    mesh.dispose?.();
    mesh.geometry?.dispose();
    mesh.material?.dispose();
  }
}
