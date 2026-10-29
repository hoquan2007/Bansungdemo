import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { getMap } from '../shared/maps/index.js';
import { createHighlandsScenery, disposeHighlandsScenery } from '../client/src/highlandsScenery.js';

const NAMES = [
  'highlands-lower-branches', 'highlands-upper-branches',
  'highlands-distant-mountains', 'highlands-ground-brush',
];

test('highlands scenery is batched, stays out of combat geometry and frees GPU resources', () => {
  const map = getMap('highlands');
  const solidsBefore = map.solids.map((s) => [s.min, s.max, s.color, s.tag]);
  const scenery = createHighlandsScenery(map);
  assert.equal(scenery.children.length, 4, 'forest, mountains and brush use four instanced draw calls');
  for (const name of NAMES) {
    const mesh = scenery.getObjectByName(name);
    assert.ok(mesh?.isInstancedMesh, `${name} must use instancing`);
    assert.ok(mesh.count > 0, `${name} must have visible instances`);
  }
  assert.equal(scenery.getObjectByName('highlands-lower-branches').count, map.pines.length);
  assert.equal(scenery.getObjectByName('highlands-upper-branches').count, map.pines.length);
  assert.equal(scenery.getObjectByName('highlands-distant-mountains').count, 58);

  const brush = scenery.getObjectByName('highlands-ground-brush');
  assert.ok(brush.count > 600, 'forest needs meaningful ground cover');
  const spawns = Object.values(map.spawns).flat();
  const occupied = map.solids.filter((s) => {
    if (s.tag?.startsWith('surface:')) return true;
    return s.max[0] - s.min[0] < 530 && s.max[2] - s.min[2] < 530 &&
      s.min[1] < 1.2 && s.max[1] > -0.48;
  });
  const matrix = new THREE.Matrix4();
  const point = new THREE.Vector3();
  for (let i = 0; i < brush.count; i++) {
    brush.getMatrixAt(i, matrix);
    point.setFromMatrixPosition(matrix);
    assert.ok(point.y >= 0 && point.y < 0.4, 'brush must stay close to ground level');
    assert.ok(spawns.every((p) => Math.hypot(point.x - p[0], point.z - p[2]) >= 6),
      'brush must leave spawn lanes clear');
    assert.ok(occupied.every((s) => point.x < s.min[0] - 0.5 || point.x > s.max[0] + 0.5 ||
      point.z < s.min[2] - 0.5 || point.z > s.max[2] + 0.5),
    'brush must not grow through roads, rocks, trunks or buildings');
  }
  assert.deepEqual(map.solids.map((s) => [s.min, s.max, s.color, s.tag]), solidsBefore,
    'visual scenery cannot change server collision');

  const disposed = [];
  for (const child of scenery.children) {
    child.geometry.addEventListener('dispose', () => disposed.push(`${child.name}:geometry`));
    child.material.addEventListener('dispose', () => disposed.push(`${child.name}:material`));
  }
  disposeHighlandsScenery(scenery);
  assert.equal(disposed.length, scenery.children.length * 2, 'all scenery GPU resources must dispose');
});

test('highlands scenery has deterministic instance positions and tint', () => {
  const map = getMap('highlands');
  const first = createHighlandsScenery(map);
  const second = createHighlandsScenery(map);
  const left = new THREE.Matrix4();
  const right = new THREE.Matrix4();
  const leftColor = new THREE.Color();
  const rightColor = new THREE.Color();
  try {
    for (const name of NAMES) {
      const a = first.getObjectByName(name);
      const b = second.getObjectByName(name);
      assert.equal(a.count, b.count, `${name} changed instance count`);
      for (let i = 0; i < Math.min(a.count, 24); i++) {
        a.getMatrixAt(i, left);
        b.getMatrixAt(i, right);
        assert.deepEqual(left.elements, right.elements, `${name} moved instance ${i}`);
        a.getColorAt(i, leftColor);
        b.getColorAt(i, rightColor);
        assert.deepEqual(leftColor.toArray(), rightColor.toArray(), `${name} recolored instance ${i}`);
      }
    }
  } finally {
    disposeHighlandsScenery(first);
    disposeHighlandsScenery(second);
  }
});
