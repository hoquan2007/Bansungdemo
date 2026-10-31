import test from 'node:test';
import assert from 'node:assert/strict';

import { Room } from '../server/room.js';
import { PHASE, S2C, decode } from '../shared/protocol.js';
import { RETAKE_BOMB_MS, RETAKE_DEFUSE_MS } from '../shared/constants.js';
import { eliminationOutcome } from '../server/modes.js';
import { loadoutForPrimary } from '../shared/weapons.js';

let roomCount = 0;

function socket() {
  return {
    readyState: 1,
    sent: [],
    send(raw) { this.sent.push(decode(raw)); },
    last(type) { return this.sent.filter((msg) => msg?.m === type).at(-1) ?? null; },
  };
}

function retake(t) {
  const room = new Room(`RT${roomCount++}`, 'retake');
  t.after(() => room.dispose());
  const players = Array.from({ length: 6 }, (_, i) =>
    room.addPlayer({ id: `retake-${i}`, name: `Operator ${i}`, ws: socket() }));
  const attack = players.filter((player) => player.team === 'A');
  const defend = players.filter((player) => player.team === 'B');
  return { room, players, attack, defend };
}

function start(room) {
  room.beginRound();
  assert.equal(room.phase, PHASE.LIVE);
  assert.ok(room.bomb);
}

function holdAtSite(room, player) {
  player.pos = [...room.bomb.pos];
  room.handleBombInteract(player, { action: 'hold' });
}

test('retake is a six-human, three-per-side, fixed-map rifle queue with a planted objective', (t) => {
  const { room, players, attack, defend } = retake(t);
  assert.equal(room.capacity(), 6);
  assert.equal(room.minPlayers(), 6);
  assert.equal(room.mapId, 'courtyard');
  assert.equal(attack.length, 3);
  assert.equal(defend.length, 3);
  assert.equal(room.isFull(), true);
  assert.equal(room.addPlayer({ id: 'overflow', name: 'Overflow', ws: socket() }), null);
  assert.equal(room.lobbyState().maxBots, 0);
  assert.deepEqual(players[0].inventory, loadoutForPrimary('rifle'));
  start(room);
  assert.deepEqual(room.teamScores, { A: 0, B: 0 });
  assert.ok(room.bomb.deadline - Date.now() <= RETAKE_BOMB_MS);
  assert.equal(room.bombPayload().active, true);
  assert.ok(players[0].ws.last(S2C.BOMB_STATE));
});

test('bomb expiry wins for defenders once and a fresh planted bomb starts next round', (t) => {
  const { room } = retake(t);
  start(room);
  const firstBomb = room.bomb;
  room.bomb.deadline = Date.now() - 1;
  room.tickBomb(Date.now());
  assert.deepEqual(room.teamScores, { A: 0, B: 1 });
  assert.ok(room.eliminationBreakAt);
  assert.equal(room.bombPayload().active, false);
  room.tickBomb(Date.now() + 5000);
  assert.deepEqual(room.teamScores, { A: 0, B: 1 }, 'cannot award the same round twice');
  room.beginEliminationRound();
  assert.notEqual(room.bomb, firstBomb);
  assert.equal(room.bombPayload().active, true);
  assert.equal(room.teamScores.B, 1);
  assert.equal(room.eliminationRound, 2);
});

test('five seconds of uninterrupted authorized hold defuses the bomb for Team A', (t) => {
  const { room, attack, defend } = retake(t);
  start(room);
  const defuser = attack[0];
  const defender = defend[0];
  defender.pos = [...room.bomb.pos];
  room.handleBombInteract(defender, { action: 'hold' });
  assert.equal(room.bomb.defuserId, null, 'defender cannot defuse');
  holdAtSite(room, defuser);
  assert.equal(room.bomb.defuserId, defuser.id);
  const now = Date.now();
  room.bomb.defuseStartedAt = now - RETAKE_DEFUSE_MS;
  room.bomb.lastHoldAt = now;
  room.tickBomb(now);
  assert.deepEqual(room.teamScores, { A: 1, B: 0 });
  assert.ok(room.eliminationBreakAt);
  room.tickBomb(now + 1000);
  assert.equal(room.teamScores.A, 1);
});

test('defuse stops on cancel, movement, death, or missing hold heartbeat', (t) => {
  const { room, attack } = retake(t);
  start(room);
  const defuser = attack[0];
  holdAtSite(room, defuser);
  room.handleBombInteract(defuser, { action: 'cancel' });
  assert.equal(room.bomb.defuserId, null);

  holdAtSite(room, defuser);
  defuser.pos = [100, 100, 100];
  room.tickBomb(Date.now());
  assert.equal(room.bomb.defuserId, null);

  holdAtSite(room, defuser);
  defuser.alive = false;
  room.tickBomb(Date.now());
  assert.equal(room.bomb.defuserId, null);

  defuser.alive = true;
  holdAtSite(room, defuser);
  room.bomb.lastHoldAt = Date.now() - 1000;
  room.tickBomb(Date.now());
  assert.equal(room.bomb.defuserId, null);
  assert.deepEqual(room.teamScores, { A: 0, B: 0 });
});

test('eliminating defenders alone does not win: A must defuse before detonation', (t) => {
  const { room, attack, defend } = retake(t);
  start(room);
  for (const player of defend) player.alive = false;
  assert.equal(eliminationOutcome(room), null);
  assert.deepEqual(room.teamScores, { A: 0, B: 0 });
  for (const player of attack) player.alive = false;
  assert.equal(eliminationOutcome(room)?.winnerTeam, 'B');
  room.finishEliminationRound(eliminationOutcome(room));
  assert.equal(room.teamScores.B, 1);
});
