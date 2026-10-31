import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceFootstep, createFootstepTracker, footstepSurface } from '../client/src/footsteps.js';

test('footstep cadence follows distance and changes with gait', () => {
  const t = createFootstepTracker();
  const at = (x, overrides = {}) => advanceFootstep(t, { x, z: 0, grounded: true, ...overrides });
  assert.equal(at(0), null);
  assert.equal(at(1), null);
  assert.equal(at(1.6), 'step');
  assert.equal(at(2.4, { crouched: true }), null);
  assert.equal(at(2.8, { crouched: true }), 'step');
  assert.equal(at(4.2, { sprinting: true }), null);
  assert.equal(at(5.1, { sprinting: true }), 'step');
});

test('landing, pause, and teleport avoid repeated footstep sounds', () => {
  const t = createFootstepTracker();
  const at = (x, grounded, active = true) => advanceFootstep(t, { x, z: 0, grounded, active });
  assert.equal(at(0, true), null);
  assert.equal(at(0.5, false), null);
  assert.equal(at(1, true), 'land');
  assert.equal(at(1, true), null);
  assert.equal(at(11, true), null);
  assert.equal(at(12, true, false), null);
  assert.equal(at(12, true), null);
});

test('footsteps identify the collider surface with a safe default', () => {
  const map = { groundTexture: 'road012a', materialTextures: { '#777': 'wood' } };
  assert.equal(footstepSurface(map, { tag: 'surface:metal:1' }), 'metal');
  assert.equal(footstepSurface(map, { tag: 'crate' }), 'wood');
  assert.equal(footstepSurface(map, { color: '#777' }), 'wood');
  assert.equal(footstepSurface({ groundTexture: 'grass' }, {}), 'dirt');
  assert.equal(footstepSurface(map, {}), 'stone');
});
