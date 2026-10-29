import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { getMap } from '../shared/maps/index.js';
import { createIslandScenery, disposeIslandScenery } from '../client/src/islandScenery.js';

test('island dressing stays render-only, clear of team spawns and under a small draw-call budget', () => {
  const map = getMap('island');
  const before = map.solids.map((solid) => [solid.min, solid.max, solid.color, solid.tag]);
  const scenery = createIslandScenery(map);
  const scrub = scenery.getObjectByName('island-scrub');
  const pebbles = scenery.getObjectByName('island-pebbles');
  const grass = scenery.children.find((child) => child.isInstancedMesh && child.geometry?.getAttribute('position')?.count === 6);
  const cliffs = scenery.getObjectByName('island-coastal-cliffs');
  const ridges = scenery.getObjectByName('island-distant-ridges');
  const windows = scenery.getObjectByName('island-window-insets');
  assert.ok(scrub?.count > 500, 'a noticeable amount of scrub should survive clearance');
  assert.ok(pebbles?.count > 150, 'stones should fill some of the open terrain');
  assert.ok(grass?.count > 1000, 'grass should cover open ground');
  assert.equal(cliffs?.count, 240, 'rock boundary should cover all four sides');
  assert.equal(ridges?.count, 33, 'distant ridgelines should ring the coast');
  assert.ok(ridges.geometry.getAttribute('position').count > 500,
    'mountain profiles should have irregular shoulders, not primitive cones');
  assert.ok(windows?.count > 20, 'mainland structures should have windows');
  assert.ok(scenery.children.length <= 8, 'scenery should use a bounded number of draw calls');

  const position = new THREE.Vector3();
  const transform = new THREE.Matrix4();
  const spawns = Object.values(map.spawns).flat();
  const occupied = map.solids.filter((s) => {
    if (s.tag?.startsWith('surface:')) return false;
    const width = s.max[0] - s.min[0];
    const depth = s.max[2] - s.min[2];
    if (width > 300 && depth > 300) return false;
    return (s.min[1] < 1 && s.max[1] > -0.25) ||
      (s.min[1] >= 2.5 && width >= 8 && depth >= 8);
  });
  for (const mesh of [scrub, pebbles, grass]) {
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, transform);
      position.setFromMatrixPosition(transform);
      assert.ok(position.y < 0, 'small decoration must stay at ground height');
      assert.ok(spawns.every((p) => Math.hypot(p[0] - position.x, p[2] - position.z) > 7),
        'decoration must leave a clear margin around team spawns');
      const overRoad = map.solids.some((s) => s.tag?.startsWith('surface:') &&
        !s.tag.startsWith('surface:grass') &&
        position.x >= s.min[0] && position.x <= s.max[0] &&
        position.z >= s.min[2] && position.z <= s.max[2]);
      assert.equal(overRoad, false, 'scrub and loose stones should not fill roads or runways');
      if (i % 7 === 0) {
        const overlapsStructure = occupied.some((s) =>
          position.x >= s.min[0] && position.x <= s.max[0] &&
          position.z >= s.min[2] && position.z <= s.max[2]);
        assert.equal(overlapsStructure, false, 'ground dressing must avoid structural footprints');
      }
    }
  }
  assert.deepEqual(map.solids.map((solid) => [solid.min, solid.max, solid.color, solid.tag]), before,
    'scenery must not change shared server collision');

  let geometryDisposed = false;
  let materialDisposed = false;
  scrub.geometry.addEventListener('dispose', () => { geometryDisposed = true; });
  scrub.material.addEventListener('dispose', () => { materialDisposed = true; });
  disposeIslandScenery(scenery);
  assert.equal(geometryDisposed, true);
  assert.equal(materialDisposed, true);
});

test('island scenery has stable placements between separate map loads', () => {
  const map = getMap('island');
  const a = createIslandScenery(map);
  const b = createIslandScenery(map);
  const matrixA = new THREE.Matrix4();
  const matrixB = new THREE.Matrix4();
  for (const name of ['island-scrub', 'island-pebbles', 'island-coastal-cliffs', 'island-distant-ridges', 'island-window-insets']) {
    const first = a.getObjectByName(name);
    const second = b.getObjectByName(name);
    assert.equal(first.count, second.count, `${name} count changes between loads`);
    for (let i = 0; i < Math.min(16, first.count); i++) {
      first.getMatrixAt(i, matrixA);
      second.getMatrixAt(i, matrixB);
      assert.deepEqual(matrixA.elements, matrixB.elements, `${name} placement ${i} moved`);
    }
  }
  disposeIslandScenery(a);
  disposeIslandScenery(b);
});
