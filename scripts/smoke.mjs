import assert from 'node:assert/strict';
import { Client } from '@colyseus/sdk';

const client = new Client(process.env.SERVER_URL || 'http://localhost:2567');
const warn = console.warn;
console.warn = (...args) => { if (!String(args[0]).includes('@colyseus/sdk: onMessage()')) warn(...args); };
for (const teamCount of [2, 3, 4]) {
  const rooms = [];
  try {
    const host = await client.create('arena', { name: 'Host', teamCount });
    rooms.push(host);
    let snapshot;
    host.onMessage('snapshot', value => { snapshot = value; });
    for (let i = 1; i < 16; i++) {
      const room = await client.joinById(host.roomId, { name: `Bot ${i}` });
      room.onMessage('snapshot', () => {});
      rooms.push(room);
    }
    await new Promise(resolve => setTimeout(resolve, 350));
    assert.equal(snapshot?.players.length, 16, 'room holds 16 players');
    assert.equal(snapshot?.teamCount, teamCount);
    const sizes = Array.from({ length: teamCount }, (_, team) => snapshot.players.filter(p => p.team === team).length);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, 'teams are balanced');
    rooms.forEach(room => room.send('ready'));
    await new Promise(resolve => setTimeout(resolve, 180));
    host.send('start');
    await new Promise(resolve => setTimeout(resolve, 350));
    assert.equal(snapshot?.phase, 'playing', 'host can start the match');
    assert.equal(snapshot?.scores.length, 4, 'four score slots');
    assert.equal(new Set(snapshot.players.map(p => `${p.x.toFixed(2)},${p.z.toFixed(2)}`)).size, 16, 'spawns are distinct');
    const before = snapshot.players.find(p => p.id === host.sessionId);
    host.send('input', { seq: 1, forward: 1, strafe: 0, yaw: 0, pitch: 0, sprint: false, crouch: false, jump: false, fire: true, reload: false });
    await new Promise(resolve => setTimeout(resolve, 350));
    const after = snapshot.players.find(p => p.id === host.sessionId);
    assert.ok(after.z > before.z, 'server simulates movement');
    assert.ok(after.ammo < before.ammo, 'server simulates fire and ammunition');
    host.send('input', { seq: 2, forward: 0, strafe: 0, yaw: 0, pitch: 0, sprint: false, crouch: false, jump: false, fire: false, reload: false });
    console.log(`PASS: 16 players, ${teamCount} balanced teams, distinct spawns, movement, fire`);
  } finally {
    await Promise.allSettled(rooms.map(room => room.leave()));
  }
}
