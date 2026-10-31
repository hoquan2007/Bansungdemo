import test from 'node:test';
import assert from 'node:assert/strict';
import { countOnlineByMode } from '../client/src/menuPresence.js';

test('public live counts include humans only and aggregate rooms by mode', () => {
  const result = countOnlineByMode({ rooms: [
    { mode: 'duel', humans: 1, players: 2 },
    { mode: 'duel', humans: 2, players: 2 },
    { mode: 'squads', humans: 3, players: 4 },
    { mode: 'br', humans: 1, players: 16 },
  ] });
  assert.equal(result.total, 7);
  assert.equal(result.byMode.duel, 3);
  assert.equal(result.byMode.squads, 3);
  assert.equal(result.byMode.br, 1);
});

test('invalid room data never turns into a misleading online count', () => {
  assert.throws(() => countOnlineByMode({}), /Invalid room/);
  const result = countOnlineByMode({ rooms: [
    { mode: 'duel', humans: -1 },
    { mode: 'duel', humans: 1.5 },
    { mode: 'duel', humans: 17 },
    { mode: 'duel', humans: 0 },
  ] });
  assert.equal(result.total, 0);
});
