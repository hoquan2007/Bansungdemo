// Repeat the real Chrome/WebSocket match smoke across all supported online modes.
// Requires a production build and locally installed Chrome.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cases = [
  { label: 'TDM two players', mode: 'tdm', teams: 4, humans: 2 },
  { label: 'AWP Duel', mode: 'duel', teams: 2, humans: 2 },
  { label: 'Squads', mode: 'squads', teams: 2, humans: 4 },
  { label: 'Retake', mode: 'retake', teams: 2, humans: 6 },
  { label: 'TDM full 16 players', mode: 'tdm', teams: 4, humans: 16 },
];

for (const scenario of cases) {
  const env = { ...process.env };
  // A previous one-off smoke configuration must not accidentally carry into
  // this matrix; browser-smoke owns the game's map selection for each mode.
  for (const key of ['SMOKE_MODE', 'SMOKE_MAP', 'SMOKE_TEAMS', 'SMOKE_HUMANS',
    'SMOKE_LEGACY_RIFLE', 'SMOKE_SCREENSHOT']) delete env[key];
  Object.assign(env, {
    SMOKE_MODE: scenario.mode,
    SMOKE_TEAMS: String(scenario.teams),
    SMOKE_HUMANS: String(scenario.humans),
  });
  console.log(`Running ${scenario.label}...`);
  const result = spawnSync(process.execPath, ['scripts/browser-smoke.mjs'], {
    cwd: root, env, encoding: 'utf8', timeout: 90_000, maxBuffer: 5_000_000,
  });
  if (result.error || result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw result.error ?? new Error(`${scenario.label} exited ${result.status} (signal ${result.signal})`);
  }
  const output = result.stdout.trim().split(/\r?\n/);
  const match = JSON.parse(output.at(-1));
  assert.equal(match.ok, true, `${scenario.label}: match smoke failed`);
  assert.equal(match.mode, scenario.mode, `${scenario.label}: incorrect mode`);
  assert.equal(match.players, scenario.humans, `${scenario.label}: wrong player count`);
  assert.equal(match.webgl, true, `${scenario.label}: 3D canvas missing`);
  assert.equal(match.shotConfirmed, true, `${scenario.label}: shooting not confirmed`);
  assert.ok(match.movementMeters > 1, `${scenario.label}: movement not observed`);
  if (scenario.mode === 'retake') {
    assert.equal(match.bombActive, true, 'Retake bomb was not planted');
    assert.equal(match.retakeUi?.objectiveModel, 'licensed', 'Retake objective was not rendered');
  }
  if (scenario.mode === 'duel') {
    assert.equal(match.gunModel?.authoredSniperRig, true, 'Duel sniper rig not loaded');
    assert.ok(match.animationCheck?.boltShotDelta > .01, 'Duel sniper bolt did not move');
  }
  console.log(`PASS ${scenario.label}: ${match.players} players, ${match.teams} teams, ${match.map}`);
}

console.log(`PASS all ${cases.length} Chrome/WebSocket mode scenarios`);
