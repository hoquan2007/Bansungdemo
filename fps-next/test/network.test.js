// Actual TCP/WebSocket integration: sixteen independent clients join one game
// server, replacing lobby bots, and a seventeenth client is rejected.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

import { C2S, S2C, PHASE, decode, encode, decodeSnapshot } from '../shared/protocol.js';
import { RETAKE_BOMB_MS, RETAKE_DEFUSE_MS, RETAKE_BOMB_POS } from '../shared/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function bootServer() {
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    // Let the OS pick an unused ephemeral port to avoid conflicting with a running game.
    env: { ...process.env, PORT: process.env.INTEGRATION_PORT ?? '0', NODE_ENV: 'test', ARENA_COUNTDOWN_MS: '350' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const ready = new Promise((resolve, reject) => {
    let output = '';
    let errors = '';
    const timer = setTimeout(() => reject(new Error(`Server startup timed out: ${output} ${errors}`)), 15_000);
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      const match = output.match(/arena server on :(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    child.stderr.on('data', (chunk) => { errors += chunk.toString(); });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited before becoming ready (${code}): ${errors}`));
    });
  });

  return { child, ready };
}

async function connect(port) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const messages = [];
  const observers = new Set();
  socket.on('message', (data) => {
    const message = decode(data.toString());
    if (!message || message.m === S2C.SNAPSHOT) return;
    messages.push(message);
    for (const observer of [...observers]) observer(message);
  });
  socket.on('error', () => {});
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket connection timed out')), 5_000);
    socket.once('open', () => { clearTimeout(timer); resolve(); });
    socket.once('error', (error) => { clearTimeout(timer); reject(error); });
  });
  return {
    socket,
    send(type, payload = {}) { socket.send(encode(type, payload)); },
    wait(predicate, timeoutMs = 8_000) {
      const found = messages.find(predicate);
      if (found) return Promise.resolve(found);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          observers.delete(observer);
          reject(new Error(`Timed out waiting for server message; received: ${messages.map((m) => m.m).join(', ')}`));
        }, timeoutMs);
        const observer = (message) => {
          if (!predicate(message)) return;
          clearTimeout(timer);
          observers.delete(observer);
          resolve(message);
        };
        observers.add(observer);
      });
    },
  };
}

test('real WebSocket server admits 16 human players across 4 teams, rejects the 17th, and starts a match', async (t) => {
  const { child, ready } = bootServer();
  const clients = [];
  t.after(() => {
    for (const client of clients) client.socket.terminate();
    if (child.exitCode === null) child.kill();
  });

  const port = await ready;
  const host = await connect(port);
  clients.push(host);
  host.send(C2S.HELLO, { name: 'Host' });
  host.send(C2S.CREATE, { mode: 'tdm' });
  const joined = await host.wait((m) => m.m === S2C.JOINED);
  const code = joined.code;
  assert.equal(joined.mapId, 'island');
  assert.ok(code);

  host.send(C2S.LOBBY_SET, { mapId: 'highlands' });
  await host.wait((m) => m.m === S2C.LOBBY && m.mapId === 'highlands');
  host.send(C2S.LOBBY_SET, { teamCount: 4 });
  await host.wait((m) => m.m === S2C.LOBBY && m.teamCount === 4);
  host.send(C2S.SET_BOTS, { n: 15 });
  await host.wait((m) => m.m === S2C.LOBBY && m.bots === 15);

  const guests = await Promise.all(Array.from({ length: 15 }, async (_, index) => {
    const guest = await connect(port);
    clients.push(guest);
    guest.send(C2S.HELLO, { name: `Guest${index}` });
    guest.send(C2S.JOIN, { code });
    const accepted = await guest.wait((m) => m.m === S2C.JOINED);
    assert.equal(accepted.code, code);
    return guest;
  }));
  const full = await host.wait((m) => m.m === S2C.LOBBY && m.roster?.length === 16 && m.bots === 0);
  const teams = Object.fromEntries(['A', 'B', 'C', 'D'].map((team) =>
    [team, full.roster.filter((player) => player.team === team).length]));
  assert.deepEqual(teams, { A: 4, B: 4, C: 4, D: 4 });
  assert.equal(full.capacity, 16);
  assert.equal(full.mapId, 'highlands');

  const overflow = await connect(port);
  clients.push(overflow);
  overflow.send(C2S.HELLO, { name: 'Overflow' });
  overflow.send(C2S.JOIN, { code });
  const rejected = await overflow.wait((m) => m.m === S2C.ERROR);
  assert.equal(rejected.code, 'full');

  // Rejoining the same code must not dispose the only player's room or detach
  // an existing client. The host should still be able to start this match.
  host.send(C2S.JOIN, { code });
  const alreadyJoined = await host.wait((m) => m.m === S2C.ERROR && m.code === 'already-joined');
  assert.equal(alreadyJoined.code, 'already-joined');

  const health = await fetch(`http://127.0.0.1:${port}/api/health`).then((response) => response.json());
  assert.equal(health.ok, true);
  assert.equal(health.players, 16);

  host.send(C2S.START);
  await Promise.all([host, ...guests].map((client) =>
    client.wait((m) => m.m === S2C.PHASE && m.phase === PHASE.COUNTDOWN)));
});

test('two human players exchange validated movement snapshots and live weapon shots over WebSocket', async (t) => {
  const { child, ready } = bootServer();
  const clients = [];
  t.after(() => {
    for (const client of clients) client.socket.terminate();
    if (child.exitCode === null) child.kill();
  });

  const port = await ready;
  const host = await connect(port);
  const guest = await connect(port);
  clients.push(host, guest);

  host.send(C2S.CREATE, { mode: 'tdm' });
  const joined = await host.wait((m) => m.m === S2C.JOINED);
  guest.send(C2S.JOIN, { code: joined.code });
  await guest.wait((m) => m.m === S2C.JOINED);

  host.send(C2S.START);
  const spawn = await host.wait((m) => m.m === S2C.RESPAWN);
  await Promise.all([host, guest].map((c) => c.wait((m) => m.m === S2C.PHASE && m.phase === PHASE.LIVE)));

  const observedYaw = spawn.yaw + 0.25;
  const remoteState = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { guest.socket.off('message', observe); reject(new Error('No updated opponent snapshot')); }, 4000);
    const observe = (data) => {
      const message = decode(data.toString());
      if (message?.m !== S2C.SNAPSHOT) return;
      const remote = decodeSnapshot(message).players.find((p) => p.id === joined.you.id);
      if (!remote || Math.abs(remote.yaw - observedYaw) > 0.01) return;
      clearTimeout(timer);
      guest.socket.off('message', observe);
      resolve(remote);
    };
    guest.socket.on('message', observe);
  });
  host.send(C2S.STATE, { p: spawn.pos, y: observedYaw, t: 0, f: 0 });
  const remote = await remoteState;
  assert.ok(Math.abs(remote.yaw - observedYaw) < 0.01);

  const shot = guest.wait((m) => m.m === S2C.SHOTS && m.id === joined.you.id);
  host.send(C2S.SHOOT, { w: spawn.weapon, o: [spawn.pos[0], spawn.pos[1] + 1.4, spawn.pos[2]], d: [0, 0, -1], h: [] });
  const observed = await shot;
  assert.equal(observed.w, spawn.weapon);
});

for (const [mode, capacity, firstWeapon] of [
  ['duel', 2, 'sniper'],
  ['squads', 4, 'rifle'],
  ['retake', 6, 'rifle'],
]) {
  test(`${mode} creates an actual ${capacity}-player WebSocket lobby with fixed guns and starts`, async (t) => {
    const { child, ready } = bootServer();
    const clients = [];
    t.after(() => {
      for (const client of clients) client.socket.terminate();
      if (child.exitCode === null) child.kill();
    });

    const port = await ready;
    const host = await connect(port);
    clients.push(host);
    host.send(C2S.HELLO, { name: 'DuelHost' });
    host.send(C2S.CREATE, { mode });
    const created = await host.wait((m) => m.m === S2C.JOINED);
    assert.equal(created.mode, mode);
    assert.equal(created.teamCount, 2);
    assert.notEqual(created.mapId, 'island');
    if (mode === 'retake') assert.equal(created.mapId, 'courtyard');
    assert.equal(created.inventory[0], firstWeapon);

    for (let i = 1; i < capacity; i++) {
      const guest = await connect(port);
      clients.push(guest);
      guest.send(C2S.HELLO, { name: `DuelGuest${i}` });
      guest.send(C2S.JOIN, { code: created.code });
      const accepted = await guest.wait((m) => m.m === S2C.JOINED);
      assert.equal(accepted.code, created.code);
      assert.equal(accepted.inventory[0], firstWeapon);
    }

    const full = await host.wait((m) => m.m === S2C.LOBBY && m.roster?.length === capacity);
    assert.equal(full.capacity, capacity);
    assert.deepEqual(['A', 'B'].map((team) => full.roster.filter((p) => p.team === team).length),
      [capacity / 2, capacity / 2]);

    host.send(C2S.START);
    await Promise.all(clients.map((c) => c.wait((m) => m.m === S2C.PHASE && m.phase === PHASE.COUNTDOWN)));
    if (mode === 'retake') {
      await Promise.all(clients.map((c) => c.wait((m) => m.m === S2C.PHASE && m.phase === PHASE.LIVE)));
      const bombs = await Promise.all(clients.map((c) => c.wait((m) => m.m === S2C.BOMB_STATE && m.active)));
      for (const bomb of bombs) {
        assert.deepEqual(bomb.pos, RETAKE_BOMB_POS);
        assert.equal(bomb.defuserId, null);
        assert.equal(bomb.defuseMs, RETAKE_DEFUSE_MS);
        assert.ok(bomb.remainingMs > 0 && bomb.remainingMs <= RETAKE_BOMB_MS);
      }
    }
  });
}
