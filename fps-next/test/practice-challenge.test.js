import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { getWeapon } from '../shared/weapons.js';
import {
  createRange, startRangeChallenge, updateRangeChallenge,
  registerHit, registerShot, resetRange, configureRange, updateRange,
  normalizeRangeOptions, CHALLENGE_DURATION_MS,
} from '../client/src/practice.js';

const fakeTarget = () => ({
  resetAt: 0,
  up: true,
  group: { visible: true },
  plate: { rotation: { x: 0 } },
  def: { kind: 'static' },
});

test('timed precision run counts hits, gives combo points, and freezes at zero', () => {
  const range = createRange(new THREE.Scene(), { targets: [] });
  const rifle = getWeapon('rifle');
  startRangeChallenge(range, 1_000);
  assert.equal(range.challenge.remainingMs, CHALLENGE_DURATION_MS);
  const target1 = fakeTarget();
  registerHit(range, target1, 1_010, 10, rifle);
  registerShot(range, true);
  const target2 = fakeTarget();
  registerHit(range, target2, 1_100, 10, rifle);
  registerShot(range, true);
  assert.equal(range.challenge.score, 225);
  assert.equal(range.stats.best, 2);
  updateRangeChallenge(range, 31_000);
  assert.equal(range.challenge.remainingMs, 30_000);
  updateRangeChallenge(range, 61_000);
  assert.equal(range.challenge.finished, true);
  assert.equal(range.challenge.remainingMs, 0);
  registerHit(range, fakeTarget(), 61_020, 10, rifle);
  registerShot(range, true);
  assert.equal(range.challenge.score, 225);
  assert.equal(range.stats.hits, 2);
  assert.equal(range.stats.shots, 2);
  assert.equal(range.challenge.bestScore, 225);
});

test('G retries with fresh statistics and retains the best score, T resets to free practice', () => {
  const range = createRange(new THREE.Scene(), { targets: [] });
  startRangeChallenge(range, 10);
  registerHit(range, fakeTarget(), 50, 10, getWeapon('rifle'));
  startRangeChallenge(range, 100);
  assert.equal(range.challenge.bestScore, 100);
  assert.equal(range.challenge.score, 0);
  assert.equal(range.stats.hits, 0);
  assert.equal(range.challenge.startedAt, 100);
  resetRange(range);
  assert.equal(range.challenge.startedAt, null);
  assert.equal(range.challenge.bestScore, 100);
  registerShot(range, false);
  assert.equal(range.stats.shots, 1);
});

test('configurable bot drills update geometry, movement, distance and crouch hitboxes', () => {
  const scene = new THREE.Scene();
  const range = createRange(scene, { targets: [] }, { botCount: 3, distance: 10, movement: 'crouch', armor: 'heavy', infiniteAmmo: true });
  assert.equal(range.targets.length, 3);
  assert.equal(scene.children.length, 3);
  assert.equal(range.targets[1].pos[2], 10);
  assert.ok(range.targets[1].box.max[1] - range.targets[1].box.min[1] < 1.5);
  assert.equal(range.targets[0].def.armor, 'heavy');
  assert.equal(range.options.infiniteAmmo, true);

  configureRange(range, { botCount: 12, distance: 50, movement: 'run', armor: 'light' });
  assert.equal(scene.children.length, 12, 'Old bot meshes must be removed');
  assert.equal(range.targets.length, 12);
  assert.equal(range.targets[0].def.kind, 'slide');
  assert.equal(range.targets[0].pos[2], 50);
  const originalX = range.targets[0].pos[0];
  updateRange(range, range.startedAt + 450);
  assert.notEqual(range.targets[0].pos[0], originalX, 'Running bots should move over time');
  assert.deepEqual(normalizeRangeOptions({ botCount: 900, distance: 13, movement: 'fly', armor: 'steel' }), {
    botCount: 12, distance: 25, movement: 'stand', armor: 'none', infiniteAmmo: false,
  });
});

test('armor mitigates shots and bots only fall after their health is depleted', () => {
  const range = createRange(new THREE.Scene(), { targets: [] }, { botCount: 1, distance: 10, movement: 'stand', armor: 'heavy' });
  const target = range.targets[0];
  const weapon = getWeapon('rifle');
  const damage = registerHit(range, target, 100, 10, weapon).damage;
  assert.ok(damage > 0 && damage < 100);
  assert.ok(target.up, 'First armored hit should not knock bot down');
  assert.equal(target.health, 100 - damage);
  let shots = 1;
  while (target.up && shots++ < 30) registerHit(range, target, 100 + shots * 10, 10, weapon);
  assert.equal(target.up, false);
  assert.ok(target.resetAt > 0);
  resetRange(range);
  assert.equal(target.health, 100);
  assert.equal(target.up, true);
});
