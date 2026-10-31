import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as THREE from 'three';
import { SOURCE_WEAPON_RIGS, createSourceWeaponRig, poseSourceWeaponRig } from '../client/src/sourceWeaponRig.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'client/public/models/guns-obj');

function faceSignature(file) {
  const result = [];
  let material = '', smooth = '';
  for (const line of readFileSync(path.join(assets, file), 'utf-8').split(/\r?\n/)) {
    if (line.startsWith('usemtl ')) material = line;
    if (line.startsWith('s ')) smooth = line;
    if (line.startsWith('f ')) result.push(`${material}|${smooth}|${line}`);
  }
  return result.sort();
}

test('all nine extracted OBJs exactly partition source faces, materials, normals and UVs', () => {
  const unique = new Set(Object.values(SOURCE_WEAPON_RIGS)
    .filter(({ format }) => format !== 'gltf').map(({ stem }) => stem));
  assert.equal(unique.size, 9);
  const manifest = JSON.parse(readFileSync(path.join(assets, 'rigged-manifest.json'), 'utf8'));
  for (const stem of unique) {
    assert.deepEqual(faceSignature(`${stem}_Rigged.obj`), faceSignature(`${stem}.obj`), stem);
    const original = readFileSync(path.join(assets, `${stem}.obj`), 'utf8');
    const split = readFileSync(path.join(assets, `${stem}_Rigged.obj`), 'utf8');
    for (const prefix of ['v ', 'vt ', 'vn ']) {
      const lines = (content) => content.split(/\r?\n/).filter((line) => line.startsWith(prefix));
      assert.deepEqual(lines(split), lines(original), `${stem}: ${prefix} data changed`);
    }
    assert.deepEqual(readFileSync(path.join(assets, `${stem}_Rigged.mtl`)),
      readFileSync(path.join(assets, `${stem}.mtl`)), `${stem}: MTL changed`);
    assert.equal(faceSignature(`${stem}.obj`).length, manifest[stem].originalFaces);
    for (const part of Object.keys(manifest[stem].parts)) {
      assert.ok(split.includes(`o Rig${part}\n`), `${stem}: Rig${part} missing`);
    }
  }
});

test('five glTF extractions preserve every indexed source triangle and source attribute', () => {
  const gltfDir = path.join(root, 'client/public/models/guns');
  const manifest = JSON.parse(readFileSync(path.join(gltfDir, 'rigged-gltf-manifest.json'), 'utf8'));
  const defs = Object.values(SOURCE_WEAPON_RIGS).filter(({ format }) => format === 'gltf');
  assert.equal(defs.length, 5);
  function decode(gltf) {
    return Buffer.from(gltf.buffers[0].uri.split(',', 2)[1], 'base64');
  }
  function indices(gltf, data, primitive) {
    const accessor = gltf.accessors[primitive.indices];
    const view = gltf.bufferViews[accessor.bufferView];
    const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const stride = accessor.componentType === 5125 ? 4 : accessor.componentType === 5123 ? 2 : 1;
    return Array.from({ length: accessor.count }, (_, i) => {
      const pos = offset + i * stride;
      return stride === 4 ? data.readUInt32LE(pos)
        : stride === 2 ? data.readUInt16LE(pos) : data.readUInt8(pos);
    });
  }
  function triangles(gltf, data, meshes) {
    const faces = [];
    for (const mesh of meshes) {
      for (const primitive of mesh.primitives) {
        const faceIndices = indices(gltf, data, primitive);
        assert.equal(faceIndices.length % 3, 0);
        for (let i = 0; i < faceIndices.length; i += 3) {
          faces.push(`${primitive.material ?? -1}:${JSON.stringify(primitive.attributes)}:${faceIndices.slice(i, i + 3).join(',')}`);
        }
      }
    }
    return faces.sort();
  }
  for (const { stem, parts } of defs) {
    const source = JSON.parse(readFileSync(path.join(gltfDir, `${stem}.gltf`), 'utf8'));
    const rigged = JSON.parse(readFileSync(path.join(gltfDir, `${stem}_Rigged.gltf`), 'utf8'));
    const originalBuffer = decode(source);
    const rigBuffer = decode(rigged);
    assert.ok(rigBuffer.subarray(0, originalBuffer.length).equals(originalBuffer), `${stem}: source buffer changed`);
    assert.deepEqual(rigged.accessors.slice(0, source.accessors.length), source.accessors, `${stem}: accessors changed`);
    assert.deepEqual(rigged.bufferViews.slice(0, source.bufferViews.length), source.bufferViews, `${stem}: buffer views changed`);
    assert.deepEqual(rigged.materials, source.materials, `${stem}: materials changed`);
    assert.deepEqual(rigged.textures, source.textures, `${stem}: textures changed`);
    assert.deepEqual(triangles(rigged, rigBuffer, rigged.meshes), triangles(source, originalBuffer, source.meshes),
      `${stem}: triangle mapping changed`);
    assert.equal(rigged.nodes[0].mesh, undefined, `${stem}: duplicated original source mesh`);
    assert.deepEqual(rigged.nodes.slice(source.nodes.length).map(({ name }) => name),
      ['RigBody', ...parts.map((p) => `Rig${p}`)], `${stem}: named source components`);
    const count = Object.values(manifest[stem].parts).reduce((sum, part) => sum + part.triangles, 0);
    assert.equal(count, manifest[stem].sourceTriangles, `${stem}: triangle count mismatch`);
  }
});

test('source rig keeps every original vertex at its rest-world position', () => {
  const fitted = new THREE.Group();
  const source = new THREE.Group();
  source.rotation.y = Math.PI / 2;
  fitted.add(source);
  const data = new Float32Array([0, 0, 0, 0.5, 0.2, 0.1, 0.8, 0.3, 0]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data, 3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.name = 'RigMagazine';
  source.add(mesh);
  source.updateMatrixWorld(true);
  const previous = new THREE.Vector3(0.5, 0.2, 0.1).applyMatrix4(mesh.matrixWorld);
  const rig = createSourceWeaponRig(fitted, 'carbine');
  assert.deepEqual(rig.separatedParts, ['Magazine']);
  fitted.updateMatrixWorld(true);
  const after = new THREE.Vector3(0.5, 0.2, 0.1).applyMatrix4(mesh.matrixWorld);
  assert.ok(previous.distanceTo(after) < 1e-6, `Rest pose jumped ${previous.distanceTo(after)}`);

  poseSourceWeaponRig(rig, 0.45, 2000, 0);
  assert.ok(rig.parts.Magazine.pivot.position.y < rig.parts.Magazine.restPosition.y - 0.2);
  poseSourceWeaponRig(rig, 0, 3000, 0);
  assert.ok(rig.parts.Magazine.pivot.position.equals(rig.parts.Magazine.restPosition));
  assert.ok(rig.parts.Magazine.pivot.rotation.equals(rig.parts.Magazine.restRotation));
  poseSourceWeaponRig(rig, 0.45, 4000, 0);
  poseSourceWeaponRig(rig, 1, 4200, 0);
  assert.ok(rig.parts.Magazine.pivot.position.equals(rig.parts.Magazine.restPosition));
});

test('grouped glTF part keeps its transformed source geometry in place at rest', () => {
  const fitted = new THREE.Group();
  const parent = new THREE.Group();
  parent.position.set(1, 0.4, -0.8);
  parent.rotation.set(0.3, 0.6, -0.1);
  fitted.add(parent);
  const part = new THREE.Group();
  part.name = 'RigSlide';
  part.position.set(-0.3, 0.2, 0.1);
  part.rotation.y = 0.25;
  parent.add(part);
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.13));
  leaf.position.set(0.3, 0.01, -0.06);
  part.add(leaf);
  fitted.updateMatrixWorld(true);
  const before = new THREE.Vector3(0.2, 0.01, -0.03).applyMatrix4(leaf.matrixWorld);
  const rig = createSourceWeaponRig(fitted, 'pistol');
  assert.ok(rig);
  assert.equal(rig.axis, 1);
  fitted.updateMatrixWorld(true);
  const after = new THREE.Vector3(0.2, 0.01, -0.03).applyMatrix4(leaf.matrixWorld);
  assert.ok(before.distanceTo(after) < 1e-6, `glTF rest geometry shifted ${before.distanceTo(after)}`);
  poseSourceWeaponRig(rig, 0, 2000, 1950);
  assert.ok(rig.parts.Slide.pivot.position.x > rig.parts.Slide.restPosition.x,
    'Toon source slide should retract toward +X');
});

test('firing, reloading, interrupted animations reset moving source parts', () => {
  const now = 5000;
  for (const [id, def] of Object.entries(SOURCE_WEAPON_RIGS)) {
    const fitted = new THREE.Group();
    for (const name of def.parts) {
      const geometry = new THREE.BoxGeometry(1.5, 0.35, 0.35);
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
      mesh.name = `Rig${name}`;
      if (def.format === 'gltf') {
        const sourceNode = new THREE.Group();
        sourceNode.name = mesh.name;
        mesh.name = `${name}Primitive`;
        sourceNode.add(mesh);
        fitted.add(sourceNode);
      } else {
        fitted.add(mesh);
      }
    }
    const rig = createSourceWeaponRig(fitted, id);
    assert.ok(rig, id);
    const actionProgress = def.parts.some((name) => ['Slide', 'Bolt', 'Pump', 'Barrel'].includes(name))
      ? 0.86 : 0.46;
    poseSourceWeaponRig(rig, actionProgress, now, now - 10);
    const duringReload = def.parts.some((name) => {
      const p = rig.parts[name];
      return !p.pivot.position.equals(p.restPosition) || !p.pivot.rotation.equals(p.restRotation);
    });
    assert.equal(duringReload, true, `${id}: no actual reload pose`);
    poseSourceWeaponRig(rig, 0, now + 1000, now - 10);
    for (const name of def.parts) {
      const p = rig.parts[name];
      assert.ok(p.pivot.position.equals(p.restPosition), `${id}: position failed to reset`);
      assert.ok(p.pivot.rotation.equals(p.restRotation), `${id}: rotation failed to reset`);
    }
    poseSourceWeaponRig(rig, 0, now, now - 80);
    poseSourceWeaponRig(rig, 1, now + 1000, now - 80);
    for (const name of def.parts) {
      const p = rig.parts[name];
      assert.ok(p.pivot.position.equals(p.restPosition), `${id}: interrupted reload position`);
    }
  }
});
