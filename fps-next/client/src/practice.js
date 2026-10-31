// The practice range: single player, no server. Optional 60-second score run.
//
// Targets are simulated entirely here. It's the fastest way to get a feel for
// the guns, and during development it's the harness for checking movement and
// gunplay without needing anyone else connected.

import * as THREE from 'three';
import { raycastBoxes } from '../../shared/collision.js';
import { damageAtDistance } from '../../shared/weapons.js';

const RESET_DELAY_MS = 2200;
const KNOCKDOWN_MS = 260;
export const CHALLENGE_DURATION_MS = 60_000;
export const RANGE_DEFAULTS = Object.freeze({
  botCount: 8, distance: 25, movement: 'stand', armor: 'none', infiniteAmmo: false,
});

export function normalizeRangeOptions(input = {}) {
  const opts = input && typeof input === 'object' ? input : {};
  const count = Number(opts.botCount);
  const distance = Number(opts.distance);
  return {
    botCount: Number.isFinite(count) ? Math.max(1, Math.min(12, Math.round(count))) : RANGE_DEFAULTS.botCount,
    distance: [10, 25, 50, 75, 100].includes(distance) ? distance : RANGE_DEFAULTS.distance,
    movement: ['stand', 'strafe', 'run', 'crouch'].includes(opts.movement) ? opts.movement : RANGE_DEFAULTS.movement,
    armor: ['none', 'light', 'heavy'].includes(opts.armor) ? opts.armor : RANGE_DEFAULTS.armor,
    infiniteAmmo: opts.infiniteAmmo === true,
  };
}

function drillTargets(options) {
  const o = normalizeRangeOptions(options);
  return Array.from({ length: o.botCount }, (_, i) => {
    const row = Math.floor(i / 5);
    const rowCount = Math.min(5, o.botCount - row * 5);
    const x = (i % 5 - (rowCount - 1) / 2) * 3.75;
    const z = o.distance + row * 3.5;
    const base = { size: 0.55, armor: o.armor, crouch: o.movement === 'crouch' };
    if (o.movement === 'strafe' || o.movement === 'run') {
      const reach = o.movement === 'run' ? 1.5 : 0.8;
      return { ...base, kind: 'slide', from: [x - reach, 1.2, z], to: [x + reach, 1.2, z], period: o.movement === 'run' ? 1.7 : 3.3 };
    }
    return { ...base, kind: 'static', pos: [x, 1.2, z] };
  });
}

const COLORS = {
  uniform: 0x545c5a,
  vest: 0x343b39,
  helmet: 0x444d4c,
  visor: 0x191e22,
  boots: 0x25292a,
  marking: 0xdbab40,
};

export function createRange(scene, map, options = null) {
  // Preserve explicitly authored map targets for standalone tests and legacy
  // callers; the configurable drill is opt-in from the game UI.
  const config = options === null ? null : normalizeRangeOptions(options);
  const targets = (config ? drillTargets(config) : map.targets).map((def, i) => createTarget(scene, def, i));
  return {
    targets,
    scene,
    options: config,
    stats: { hits: 0, shots: 0, streak: 0, best: 0 },
    challenge: {
      startedAt: null,
      remainingMs: CHALLENGE_DURATION_MS,
      finished: false,
      score: 0,
      bestScore: 0,
    },
    startedAt: performance.now(),
  };
}

/** G starts a scored challenge; T resets to the un-timed range. */
export function startRangeChallenge(range, now) {
  resetRange(range);
  range.challenge.startedAt = now;
}

/** Freeze the score when the 60-second window ends. */
export function updateRangeChallenge(range, now) {
  const challenge = range.challenge;
  if (challenge.startedAt === null || challenge.finished) return;
  challenge.remainingMs = Math.max(0, CHALLENGE_DURATION_MS - (now - challenge.startedAt));
  if (challenge.remainingMs === 0) {
    challenge.finished = true;
    challenge.bestScore = Math.max(challenge.bestScore, challenge.score);
  }
}

function createTarget(scene, def, index) {
  const size = def.size ?? 0.55;
  const group = new THREE.Group();
  // Original low-poly training mannequin: human proportions are closer to the
  // reference shooting range than the former square bullseye boards. Nothing
  // is copied from an external game or an unlicensed character asset.
  // Pivot at the feet so successful hits produce a visible fall.
  const plate = new THREE.Group();
  plate.position.y = -1.15;
  const mk = (w, h, d, color, x, y, z) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color, flatShading: true }),
    );
    m.position.set(x, y, z);
    m.castShadow = true;
    plate.add(m);
    return m;
  };
  mk(0.57, 0.78, 0.3, COLORS.uniform, 0, 1.16, 0);
  mk(0.52, 0.54, 0.37, def.armor === 'heavy' ? 0x282e32 : def.armor === 'light' ? 0x5e5340 : COLORS.vest, 0, 1.31, -0.08);
  mk(0.29, 0.28, 0.23, COLORS.helmet, 0, 1.91, 0);
  mk(0.32, 0.19, 0.29, COLORS.helmet, 0, 2.07, 0);
  mk(0.24, 0.11, 0.03, COLORS.visor, 0, 1.94, -0.15);
  mk(0.14, 0.12, 0.04, COLORS.marking, 0, 1.34, -0.29);
  for (const side of [-1, 1]) {
    mk(0.19, 0.69, 0.21, COLORS.uniform, side * 0.41, 1.16, 0);
    mk(0.24, 0.69, 0.25, COLORS.uniform, side * 0.17, 0.46, 0);
    mk(0.26, 0.18, 0.37, COLORS.boots, side * 0.17, 0.10, -0.06);
  }
  plate.scale.set(size / 0.55, (size / 0.55) * (def.crouch ? 0.68 : 1), size / 0.55);
  group.add(plate);

  scene.add(group);

  const target = {
    def,
    index,
    group,
    plate,
    size,
    health: 100,
    pos: [0, 0, 0],
    up: true,
    knockedAt: 0,
    resetAt: 0,
    // Pop-ups start staggered so they don't all appear in unison.
    cycleOffset: (index * 0.37) % 1,
    box: { min: [0, 0, 0], max: [0, 0, 0], color: 0, tag: 'target' },
  };

  positionTarget(target, 0);
  return target;
}

/** Where a target should be at time `t` seconds, per its kind. */
function positionTarget(target, t) {
  const d = target.def;
  const p = target.pos;

  switch (d.kind) {
    case 'slide': {
      // Ease in/out at the turns rather than snapping direction — much better
      // tracking practice than linear ping-pong.
      const phase = ((t / d.period) + target.cycleOffset) % 1;
      const tri = phase < 0.5 ? phase * 2 : 2 - phase * 2;
      const eased = tri * tri * (3 - 2 * tri);
      for (let i = 0; i < 3; i++) p[i] = d.from[i] + (d.to[i] - d.from[i]) * eased;
      break;
    }
    case 'bob': {
      const phase = (t / d.period + target.cycleOffset) * Math.PI * 2;
      p[0] = d.pos[0];
      p[1] = d.pos[1] + Math.sin(phase) * d.amplitude;
      p[2] = d.pos[2];
      break;
    }
    default: {
      const src = d.pos ?? d.from;
      p[0] = src[0];
      p[1] = src[1];
      p[2] = src[2];
    }
  }

  target.group.position.set(p[0], p[1], p[2]);

  // Hitbox follows the complete silhouette, including the legs and helmet.
  const s = target.size;
  target.box.min[0] = p[0] - s;
  target.box.min[1] = p[1] - 1.15;
  target.box.min[2] = p[2] - 0.22;
  target.box.max[0] = p[0] + s;
  target.box.max[1] = p[1] + (d.crouch ? 0.25 : 1.15);
  target.box.max[2] = p[2] + 0.22;
}

export function updateRange(range, now) {
  updateRangeChallenge(range, now);
  const t = (now - range.startedAt) / 1000;

  for (const target of range.targets) {
    positionTarget(target, t);

    // ---- pop-up cycle ----
    if (target.def.kind === 'popup' && target.resetAt === 0) {
      const cycle = target.def.upTime + target.def.downTime;
      const phase = (t + target.cycleOffset * cycle) % cycle;
      const shouldBeUp = phase < target.def.upTime;
      if (shouldBeUp !== target.up) setUp(target, shouldBeUp);
    }

    // ---- knockdown animation and reset ----
    if (!target.up) {
      const sinceKnock = now - target.knockedAt;
      const fall = Math.min(1, sinceKnock / KNOCKDOWN_MS);
      target.plate.rotation.x = -fall * (Math.PI / 2) * 0.92;

      if (target.resetAt > 0 && now >= target.resetAt) {
        target.resetAt = 0;
        target.health = 100;
        setUp(target, true);
      }
    } else if (target.plate.rotation.x !== 0) {
      // Spring back up quickly.
      target.plate.rotation.x = Math.min(0, target.plate.rotation.x + 0.35);
      if (target.plate.rotation.x > -0.01) target.plate.rotation.x = 0;
    }
  }
}

function setUp(target, up) {
  target.up = up;
  target.group.visible = up || target.def.kind !== 'popup';
  if (!up) {
    target.knockedAt = performance.now();
  } else {
    target.plate.rotation.x = 0;
  }
}

/**
 * Nearest target along a ray. Only standing targets count — a knocked-down
 * plate shouldn't eat your bullets.
 */
export function raycastTargets(range, origin, dir, maxDist) {
  let best = null;
  for (const target of range.targets) {
    if (!target.up) continue;
    const hit = raycastBoxes(origin, dir, [target.box], maxDist);
    if (!hit) continue;
    if (best && hit.t >= best.t) continue;
    best = { t: hit.t, target, point: [
      origin[0] + dir[0] * hit.t,
      origin[1] + dir[1] * hit.t,
      origin[2] + dir[2] * hit.t,
    ] };
  }
  return best;
}

export function registerHit(range, target, now, distance, weapon) {
  // Report damage so the falloff numbers are legible while tuning weapons.
  const mitigation = target.def.armor === 'heavy' ? 0.6 : target.def.armor === 'light' ? 0.8 : 1;
  const damage = Math.max(1, Math.round(damageAtDistance(weapon, distance) * mitigation));

  if (!range.challenge.finished) {
    range.stats.hits += 1;
    range.stats.streak += 1;
    range.stats.best = Math.max(range.stats.best, range.stats.streak);
    if (range.challenge.startedAt !== null) {
      range.challenge.score += 100 + 25 * Math.min(range.stats.streak - 1, 10);
      range.challenge.bestScore = Math.max(range.challenge.bestScore, range.challenge.score);
    }
  }

  target.health = (target.health ?? 100) - damage;
  if (target.health <= 0) {
    setUp(target, false);
    target.resetAt = now + RESET_DELAY_MS;
  }

  return { damage };
}

export function registerShot(range, hitAnything) {
  if (range.challenge.finished) return;
  range.stats.shots += 1;
  if (!hitAnything) range.stats.streak = 0;
}

export function resetRange(range) {
  range.stats.hits = 0;
  range.stats.shots = 0;
  range.stats.streak = 0;
  range.stats.best = 0;
  range.challenge.startedAt = null;
  range.challenge.remainingMs = CHALLENGE_DURATION_MS;
  range.challenge.finished = false;
  range.challenge.score = 0;
  for (const target of range.targets) {
    target.resetAt = 0;
    target.health = 100;
    setUp(target, true);
  }
}

export function configureRange(range, options) {
  const config = normalizeRangeOptions(options);
  disposeRange(range);
  range.options = config;
  range.targets = drillTargets(config).map((def, i) => createTarget(range.scene, def, i));
  resetRange(range);
  return config;
}

export function disposeRange(range) {
  for (const target of range.targets) {
    range.scene.remove(target.group);
    target.group.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
  }
  range.targets.length = 0;
}
