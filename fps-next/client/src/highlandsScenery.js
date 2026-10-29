// Frostline Highlands: instanced conifers, low ground brush, alpine ranges.
// Geometry here is visual only. The shared map owns trunks, stones and cover.
import * as THREE from 'three';

function rand(seed, salt = 0) {
  const x = Math.sin(seed * 78.233 + salt * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function forest(group, map) {
  const cone = new THREE.ConeGeometry(1, 1, 7);
  const material = new THREE.MeshLambertMaterial({ vertexColors: false, flatShading: true });
  const count = map.pines.length;
  const lower = new THREE.InstancedMesh(cone, material, count);
  const upper = new THREE.InstancedMesh(cone.clone(), material.clone(), count);
  lower.name = 'highlands-lower-branches';
  upper.name = 'highlands-upper-branches';
  const transform = new THREE.Object3D();
  const tint = new THREE.Color();
  for (const [index, pine] of map.pines.entries()) {
    // Leaves start high enough that players can move between trees unhindered.
    const crown = pine.height * 0.64;
    const width = 3.6 * pine.size;
    const shade = rand(index, 2);
    transform.position.set(pine.x, pine.height * 0.48, pine.z);
    transform.rotation.y = rand(index, 3) * Math.PI;
    transform.scale.set(width, crown, width);
    transform.updateMatrix();
    lower.setMatrixAt(index, transform.matrix);
    tint.setHSL(0.36 + shade * 0.04, 0.24 + shade * 0.12, 0.20 + shade * 0.11);
    lower.setColorAt(index, tint);

    transform.position.y = pine.height * 0.72;
    transform.scale.set(width * 0.73, crown * 0.76, width * 0.73);
    transform.updateMatrix();
    upper.setMatrixAt(index, transform.matrix);
    tint.setHSL(0.37 + shade * 0.03, 0.18 + shade * 0.12, 0.28 + shade * 0.10);
    upper.setColorAt(index, tint);
  }
  for (const mesh of [lower, upper]) {
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
}

function mountainRange(group) {
  // All peaks lie beyond the playable cliff boundary. A rough ring profile
  // avoids a repeated pyramid skyline while keeping the GPU cost tiny.
  const vertices = [];
  const segments = 11;
  for (let i = 0; i < segments; i++) {
    const a = i * 2 * Math.PI / segments;
    const b = (i + 1) * 2 * Math.PI / segments;
    const r1 = 0.88 + rand(i, 12) * 0.28;
    const r2 = 0.88 + rand((i + 1) % segments, 12) * 0.28;
    vertices.push(Math.cos(a) * r1, 0, Math.sin(a) * r1,
      Math.cos(b) * r2, 0, Math.sin(b) * r2, 0, 1, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshLambertMaterial({ flatShading: true, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geometry, material, 58);
  mesh.name = 'highlands-distant-mountains';
  const transform = new THREE.Object3D();
  const tint = new THREE.Color();
  for (let i = 0; i < 58; i++) {
    const a = i / 58 * Math.PI * 2 + rand(i, 21) * 0.22;
    const distance = 340 + rand(i, 22) * 170;
    const height = 72 + rand(i, 23) * 115;
    const width = 55 + rand(i, 24) * 78;
    transform.position.set(Math.cos(a) * distance, -8, Math.sin(a) * distance);
    transform.rotation.y = rand(i, 25) * Math.PI;
    transform.scale.set(width, height, width);
    transform.updateMatrix();
    mesh.setMatrixAt(i, transform.matrix);
    tint.setHSL(0.48 + rand(i, 26) * 0.05, 0.075, 0.29 + rand(i, 27) * 0.20);
    mesh.setColorAt(i, tint);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  group.add(mesh);
}

function brush(group, map) {
  const geometry = new THREE.IcosahedronGeometry(1, 0);
  const material = new THREE.MeshLambertMaterial({ flatShading: true });
  const mesh = new THREE.InstancedMesh(geometry, material, 1800);
  mesh.name = 'highlands-ground-brush';
  const transform = new THREE.Object3D();
  const tint = new THREE.Color();
  const spawns = Object.values(map.spawns).flat();
  // Cover, trails and buildings are authored by the shared collision map.
  // Keeping vegetation off those footprints avoids foliage inside walls and
  // along the main traversal routes without adding any gameplay collision.
  const occupied = map.solids.filter((solid) => {
    if (solid.tag?.startsWith('surface:')) return true;
    const width = solid.max[0] - solid.min[0];
    const depth = solid.max[2] - solid.min[2];
    return width < 530 && depth < 530 && solid.min[1] < 1.2 && solid.max[1] > -0.48;
  });
  let count = 0;
  for (let i = 0; i < 3900 && count < 1800; i++) {
    const x = -251 + rand(i, 32) * 502;
    const z = -251 + rand(i, 33) * 502;
    if (Math.abs(x) < 11 || Math.abs(z) < 11) continue;
    if (map.areas.some((area) => Math.hypot(x - area.pos[0], z - area.pos[1]) < area.radius + 1)) continue;
    if (spawns.some((p) => Math.hypot(x - p[0], z - p[2]) < 6)) continue;
    if (occupied.some((solid) => x >= solid.min[0] - 0.5 && x <= solid.max[0] + 0.5 &&
      z >= solid.min[2] - 0.5 && z <= solid.max[2] + 0.5)) continue;
    const size = 0.15 + rand(i, 34) * 0.36;
    transform.position.set(x, size * 0.68, z);
    transform.rotation.y = rand(i, 35) * Math.PI;
    transform.scale.set(size * 1.4, size * 0.75, size);
    transform.updateMatrix();
    mesh.setMatrixAt(count, transform.matrix);
    tint.setHSL(0.19 + rand(i, 36) * 0.16, 0.19, 0.24 + rand(i, 37) * 0.16);
    mesh.setColorAt(count, tint);
    count++;
  }
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  group.add(mesh);
}

export function createHighlandsScenery(map) {
  const group = new THREE.Group();
  group.name = 'highlands-scenery';
  forest(group, map);
  mountainRange(group);
  brush(group, map);
  return group;
}

export function disposeHighlandsScenery(group) {
  if (!group) return;
  for (const child of group.children) {
    child.geometry?.dispose();
    child.material?.dispose();
  }
}
