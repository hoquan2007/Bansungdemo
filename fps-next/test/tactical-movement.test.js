import test from 'node:test';
import assert from 'node:assert/strict';
import { updateTacticalSlide, SLIDE_DURATION, SLIDE_COOLDOWN } from '../client/src/tacticalMovement.js';

const inputs = { crouchDown: true, forward: 1, sprinting: true, aiming: false,
  slowWalking: false, active: true, speedCap: 9 };
const moving = () => ({ vel: [0, 0, -8.8], onGround: true, crouchAmount: 0,
  slideRemaining: 0, slideCooldown: 0, slideInputDown: false });

test('a fast grounded sprint into crouch starts one bounded slide', () => {
  const p = moving();
  assert.equal(updateTacticalSlide(p, 1 / 60, inputs), true);
  assert.equal(p.slideRemaining, SLIDE_DURATION);
  assert.equal(p.slideCooldown, SLIDE_COOLDOWN);
  assert.deepEqual(p.vel, [0, 0, -8.8], 'slide never adds speed or teleports');
  for (let i = 0; i < 40; i++) updateTacticalSlide(p, 1 / 60, inputs);
  assert.equal(p.slideRemaining, 0);
  assert.equal(updateTacticalSlide(p, 1 / 60, inputs), false, 'held crouch cannot retrigger');
});

test('slide respects aim, slow-walk, sprint speed, forward motion, and cooldown', () => {
  for (const override of [
    { aiming: true }, { slowWalking: true }, { forward: -1 },
    { sprinting: false }, { speedCap: 14 },
  ]) {
    const p = moving();
    assert.equal(updateTacticalSlide(p, 1 / 60, { ...inputs, ...override }), false);
  }
  const p = moving();
  updateTacticalSlide(p, 1 / 60, inputs);
  for (let i = 0; i < 40; i++) updateTacticalSlide(p, 1 / 60, inputs);
  updateTacticalSlide(p, 1 / 60, { ...inputs, crouchDown: false });
  assert.equal(updateTacticalSlide(p, 1 / 60, inputs), false, 'cooldown blocks spam');
});

test('slide cancels on airborne, death, frozen or vehicle state', () => {
  for (const interrupt of [{ active: false }, { grounded: false }]) {
    const p = moving();
    updateTacticalSlide(p, 1 / 60, inputs);
    if (interrupt.grounded === false) p.onGround = false;
    assert.equal(updateTacticalSlide(p, 1 / 60, { ...inputs, ...interrupt }), false);
    assert.equal(p.slideRemaining, 0);
  }
});
