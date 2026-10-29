import test from 'node:test';
import assert from 'node:assert/strict';
import { createShotVoiceLimiter } from '../client/src/shotVoices.js';

test('local gunfire is always allowed even during heavy remote fire', () => {
  const allow = createShotVoiceLimiter({ remoteBudget: 2 });
  assert.equal(allow(1, false), true);
  assert.equal(allow(1.01, false), true);
  assert.equal(allow(1.02, false), false);
  assert.equal(allow(1.021, true), true);
  assert.equal(allow(1.025, true), true);
  assert.equal(allow(1.06, false), true);
});

test('remote limit resets on new audio window and context time rewind', () => {
  const allow = createShotVoiceLimiter({ remoteBudget: 1 });
  assert.equal(allow(4), true);
  assert.equal(allow(4.02), false);
  assert.equal(allow(4.05), true);
  assert.equal(allow(0), true);
});
