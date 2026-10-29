import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSocketUrl } from '../client/src/wsUrl.js';

test('same-origin WebSocket works with local dev and single-server deployment', () => {
  assert.equal(resolveSocketUrl('http://localhost:5173/#ABCD'), 'ws://localhost:5173/ws');
  assert.equal(resolveSocketUrl('https://arena.example/#ABCD'), 'wss://arena.example/ws');
});

test('static Vercel site can use an independent persistent game server', () => {
  assert.equal(resolveSocketUrl('https://arena.vercel.app/', 'wss://game.example.com'), 'wss://game.example.com/ws');
  assert.equal(resolveSocketUrl('https://arena.vercel.app/', ' wss://game.example.com/ws '), 'wss://game.example.com/ws');
});

test('reject mixed content and accidental credentials in the server URL', () => {
  assert.throws(() => resolveSocketUrl('https://arena.vercel.app', 'ws://game.example.com/ws'), /require wss/);
  assert.throws(() => resolveSocketUrl('https://arena.vercel.app', 'https://game.example.com/ws'), /must start/);
  assert.throws(() => resolveSocketUrl('https://arena.vercel.app', 'wss://user:secret@game.example.com/ws'), /credentials/);
});
