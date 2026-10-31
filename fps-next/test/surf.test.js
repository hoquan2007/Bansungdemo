import test from 'node:test';
import assert from 'node:assert/strict';
import { getMap, mapList } from '../shared/maps/index.js';
import {
  surfSurfaceAt, surfProgress, createSurfRun, resetSurfPlayer, updateSurfPlayer, tickSurfRun,
} from '../client/src/surf.js';

const course = getMap('surf').surf;
const utopia = getMap('surf-utopia').surf;

function playerAt(pos, vel = [0, 0, 0]) {
  return { pos: [...pos], vel: [...vel], yaw: 0, pitch: 0, onGround: true, bobAmount: 0 };
}

test('surf map is an isolated solo mode with continuous sloped banks', () => {
  assert.equal(getMap('surf').singlePlayer, true);
  assert.equal(mapList().some((map) => map.id === 'surf'), false);
  assert.equal(course.segments.length, 4);
  for (let i = 1; i < course.segments.length; i++) {
    assert.deepEqual(course.segments[i - 1].to, course.segments[i].from);
  }
  const first = course.segments[0];
  const x = (first.from[0] + first.to[0]) * 0.5;
  const z = (first.from[2] + first.to[2]) * 0.5;
  const center = surfSurfaceAt(course, x, z, 25);
  assert.ok(Math.abs(center.height - 25) < 0.01);
  assert.ok(center.normal[1] > 0.8 && center.normal[1] < 1);
  const dx = first.to[0] - first.from[0];
  const dz = first.to[2] - first.from[2];
  const len = Math.hypot(dx, dz);
  const sideX = -dz / len;
  const sideZ = dx / len;
  const bank = surfSurfaceAt(course, x + sideX * 4, z + sideZ * 4, 27.5);
  assert.ok(bank.height > center.height + 2, 'lateral bank must rise off the ramp center');
  assert.ok(Math.abs(bank.normal[0] - center.normal[0]) > 0.2);
  assert.equal(surfSurfaceAt(course, 30, 0, 0), null);
});

test('second Utopia course has independent pads, four gates and a finish', () => {
  assert.equal(getMap('surf-utopia').singlePlayer, true);
  assert.equal(mapList().some((map) => map.id === 'surf-utopia'), false);
  assert.equal(utopia.segments.length, 5);
  assert.equal(utopia.checkpoints.length, 4);
  assert.notDeepEqual(utopia.segments[0], course.segments[0]);
  assert.equal(surfSurfaceAt(utopia, 0, 34, 35).height, 35);
  assert.equal(surfSurfaceAt(utopia, 0, -185, 3).height, 3);
  const p = playerAt(utopia.start);
  const run = createSurfRun(utopia);
  for (const gate of utopia.checkpoints) {
    p.pos = [...gate.pos];
    assert.equal(tickSurfRun(run, p, utopia, 3), 'checkpoint');
  }
  p.pos = [...utopia.segments.at(-1).to];
  assert.equal(tickSurfRun(run, p, utopia, 1), 'finish');
  assert.equal(run.best, 13);
  resetSurfPlayer(p, utopia, run, true);
  assert.deepEqual(p.pos, utopia.start);
  assert.equal(run.checkpointIndex, 0);
});

test('downhill gravity accelerates along the tangent without sprint clamp', () => {
  const p = playerAt([-3.6, 25.6, 12]);
  for (let i = 0; i < 120; i++) updateSurfPlayer(p, 1 / 60, course);
  assert.ok(Math.hypot(p.vel[0], p.vel[2]) > 5, 'surf should gain speed on its own');
  assert.ok(p.pos[2] < 12, 'player should move downhill');
  const contact = surfSurfaceAt(course, p.pos[0], p.pos[2], p.pos[1]);
  assert.ok(contact && Math.abs(p.pos[1] - contact.height) < 0.4, 'feet follow the actual slope');
});

test('air strafing bends trajectory while conserving forward momentum', () => {
  const p = playerAt([0, 42, 0], [0, 2, -25]);
  p.onGround = false;
  for (let i = 0; i < 24; i++) updateSurfPlayer(p, 1 / 60, course, { x: 1, z: 0 });
  assert.ok(p.vel[0] > 3, 'strafing accelerates sideways in air');
  assert.ok(p.vel[2] <= -24, 'forward speed stays available in air');
});

test('checkpoint gates are sequential; falls reset at latest checkpoint and retain elapsed time', () => {
  const p = playerAt(course.start);
  const run = createSurfRun(course, 22.5);
  p.pos = [...course.checkpoints[1].pos];
  assert.equal(tickSurfRun(run, p, course, 0.5), null, 'cannot skip first checkpoint');
  p.pos = [...course.checkpoints[0].pos];
  assert.equal(tickSurfRun(run, p, course, 0.5), 'checkpoint');
  assert.equal(run.checkpointIndex, 1);
  assert.ok(surfProgress(course, p.pos) >= course.checkpoints[0].progress - 0.01);
  p.pos = [0, -26, -80];
  assert.equal(tickSurfRun(run, p, course, 0.25), 'reset');
  assert.deepEqual(p.pos.slice(0, 1), course.checkpoints[0].pos.slice(0, 1));
  assert.equal(run.deaths, 1);
  assert.equal(run.elapsed, 1.25);
  resetSurfPlayer(p, course, run, true);
  assert.equal(run.elapsed, 0);
  assert.equal(run.checkpointIndex, 0);
  assert.equal(run.best, 22.5, 'personal best persists across restarts');
});

test('finish locks the timer and records a new best only after all checkpoints', () => {
  const p = playerAt(course.start);
  const run = createSurfRun(course, 30);
  for (const cp of course.checkpoints) {
    p.pos = [...cp.pos];
    assert.equal(tickSurfRun(run, p, course, 4), 'checkpoint');
  }
  const last = course.segments.at(-1);
  const t = 0.98;
  p.pos = last.from.map((v, axis) => v * (1 - t) + last.to[axis] * t);
  assert.equal(tickSurfRun(run, p, course, 2), 'finish');
  assert.equal(run.best, 14);
  assert.equal(tickSurfRun(run, p, course, 5), 'finished');
  assert.equal(run.elapsed, 14);
});
