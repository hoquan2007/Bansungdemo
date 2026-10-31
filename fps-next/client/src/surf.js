// Fixed-step surf movement. No Three.js or DOM dependencies, so the slope
// contact maths and checkpoint timing can be tested in Node directly.
import { GRAVITY, JUMP_VELOCITY } from '../../shared/constants.js';

const LAND_EPSILON = 0.48;
export function surfSurfaceAt(course, x, z, y = 0) {
  const candidates = [];
  for (const [i, segment] of course.segments.entries()) {
    const [x0, y0, z0] = segment.from;
    const dx = segment.to[0] - x0;
    const dz = segment.to[2] - z0;
    const len = Math.hypot(dx, dz);
    const fx = dx / len;
    const fz = dz / len;
    const sx = -fz;
    const sz = fx;
    const along = (x - x0) * fx + (z - z0) * fz;
    const across = (x - x0) * sx + (z - z0) * sz;
    if (along < -0.12 || along > len + 0.12 || Math.abs(across) > segment.halfWidth) continue;
    const t = Math.max(0, Math.min(1, along / len));
    const height = y0 + (segment.to[1] - y0) * t
      + segment.bankRise * Math.abs(across) / segment.halfWidth;
    const longSlope = (segment.to[1] - y0) / len;
    const sideSlope = Math.sign(across) * segment.bankRise / segment.halfWidth;
    const nx = -longSlope * fx - sideSlope * sx;
    const nz = -longSlope * fz - sideSlope * sz;
    const inv = 1 / Math.hypot(nx, 1, nz);
    candidates.push({ height, normal: [nx * inv, inv, nz * inv], progress: i + t, kind: 'ramp' });
  }
  for (const pad of [course.startPad, course.finishPad].filter(Boolean)) {
    if (x >= pad.minX && x <= pad.maxX && z >= pad.minZ && z <= pad.maxZ) {
      candidates.push({ height: pad.y, normal: [0, 1, 0], progress: null, kind: 'pad' });
    }
  }
  // Where the beginning/end platform meets the ramp, use the nearer top face.
  candidates.sort((a, b) => Math.abs(y - a.height) - Math.abs(y - b.height));
  return candidates[0] ?? null;
}

export function surfProgress(course, pos) {
  let found = null;
  for (let i = 0; i < course.segments.length; i++) {
    const s = course.segments[i];
    const dx = s.to[0] - s.from[0];
    const dz = s.to[2] - s.from[2];
    const len = Math.hypot(dx, dz);
    const along = ((pos[0] - s.from[0]) * dx + (pos[2] - s.from[2]) * dz) / len;
    const across = ((pos[0] - s.from[0]) * -dz + (pos[2] - s.from[2]) * dx) / len;
    if (along < 0 || along > len || Math.abs(across) > s.halfWidth + 0.5) continue;
    const t = along / len;
    const height = s.from[1] + (s.to[1] - s.from[1]) * t
      + s.bankRise * Math.abs(across) / s.halfWidth;
    if (pos[1] < height - 2.5 || pos[1] > height + 6) continue;
    const candidate = { progress: i + t, distance: Math.abs(pos[1] - height) };
    if (!found || candidate.distance < found.distance) found = candidate;
  }
  return found?.progress ?? -1;
}

export function createSurfRun(course, best = null) {
  return { elapsed: 0, best, checkpointIndex: 0, deaths: 0, finished: false, lastEvent: 'START' };
}

export function resetSurfPlayer(player, course, run, full = false) {
  if (full) {
    run.elapsed = 0;
    run.checkpointIndex = 0;
    run.deaths = 0;
    run.finished = false;
    run.lastEvent = 'START';
  } else {
    run.deaths++;
    run.lastEvent = 'CHECKPOINT RESET';
  }
  const cp = run.checkpointIndex ? course.checkpoints[run.checkpointIndex - 1] : null;
  player.pos = [...(cp?.pos ?? course.start)];
  player.pos[1] += cp ? 0.18 : 0;
  player.vel = [0, 0, 0];
  player.yaw = cp?.yaw ?? course.startYaw;
  player.pitch = 0;
  player.onGround = false;
  player.bobAmount = 0;
}

export function updateSurfPlayer(player, dt, course, axes = { x: 0, z: 0 }, jump = false) {
  const forwardX = -Math.sin(player.yaw);
  const forwardZ = -Math.cos(player.yaw);
  const wishX = axes.x * Math.cos(player.yaw) + axes.z * forwardX;
  const wishZ = -axes.x * Math.sin(player.yaw) + axes.z * forwardZ;
  const length = Math.hypot(wishX, wishZ);
  const prev = [...player.pos];
  const underneath = surfSurfaceAt(course, prev[0], prev[2], prev[1]);
  const grounded = player.onGround && underneath && Math.abs(prev[1] - underneath.height) < 0.65;

  if (grounded && jump) {
    player.vel[1] = JUMP_VELOCITY;
    player.onGround = false;
  }

  if (grounded && !jump) {
    // Projection-based Quake acceleration: sideways corrections don't cancel
    // downhill momentum or clamp to ordinary running speed.
    if (length > 0) {
      const dx = wishX / length;
      const dz = wishZ / length;
      const along = player.vel[0] * dx + player.vel[2] * dz;
      const added = Math.min(Math.max(0, 17 - along), 18 * dt);
      player.vel[0] += dx * added;
      player.vel[2] += dz * added;
    }
    player.vel[0] *= 1 - 0.025 * dt;
    player.vel[2] *= 1 - 0.025 * dt;
  } else if (length > 0) {
    // Air strafing accelerates along the chosen wish direction while retaining
    // speed in the perpendicular axis. It can turn a fast jump without killing it.
    const dx = wishX / length;
    const dz = wishZ / length;
    const along = player.vel[0] * dx + player.vel[2] * dz;
    const added = Math.min(Math.max(0, 16 - along), 10 * dt);
    player.vel[0] += dx * added;
    player.vel[2] += dz * added;
  }

  player.vel[1] += GRAVITY * dt;
  if (grounded && !jump) {
    const n = underneath.normal;
    const inward = player.vel[0] * n[0] + player.vel[1] * n[1] + player.vel[2] * n[2];
    if (inward < 0) for (let i = 0; i < 3; i++) player.vel[i] -= inward * n[i];
  }

  const horizontal = Math.hypot(player.vel[0], player.vel[2]);
  if (horizontal > course.maxSpeed) {
    const scale = course.maxSpeed / horizontal;
    player.vel[0] *= scale;
    player.vel[2] *= scale;
  }

  for (let i = 0; i < 3; i++) player.pos[i] += player.vel[i] * dt;
  const surface = surfSurfaceAt(course, player.pos[0], player.pos[2], player.pos[1]);
  const canLand = surface && prev[1] >= surface.height - LAND_EPSILON
    && player.pos[1] <= surface.height + (grounded ? 0.65 : 0.12)
    && player.vel[1] <= 1.5;
  if (canLand) {
    player.pos[1] = surface.height;
    const n = surface.normal;
    const inward = player.vel[0] * n[0] + player.vel[1] * n[1] + player.vel[2] * n[2];
    if (inward < 0) for (let i = 0; i < 3; i++) player.vel[i] -= inward * n[i];
    player.onGround = true;
  } else {
    player.onGround = false;
  }
  player.bobAmount = 0;
}

export function tickSurfRun(run, player, course, dt) {
  if (run.finished) return 'finished';
  run.elapsed += dt;
  if (player.pos[1] < course.voidY || Math.abs(player.pos[0]) > (course.voidX ?? 40) || player.pos[2] < (course.voidZ ?? -160)) {
    resetSurfPlayer(player, course, run);
    return 'reset';
  }
  const progress = surfProgress(course, player.pos);
  const next = course.checkpoints[run.checkpointIndex];
  // A later checkpoint must never satisfy an earlier one. The gate occupies a
  // short strip of the corresponding ramp, with enough depth for a full-speed
  // fixed-step update to cross without skipping the trigger.
  if (next && progress >= next.progress - 0.025 && progress <= next.progress + 0.16) {
    run.checkpointIndex++;
    run.lastEvent = `CHECKPOINT ${run.checkpointIndex}/${course.checkpoints.length}`;
    return 'checkpoint';
  }
  if (!next && progress >= course.finishProgress) {
    run.finished = true;
    run.lastEvent = 'FINISH · R TO RESTART';
    if (run.best === null || run.elapsed < run.best) run.best = run.elapsed;
    return 'finish';
  }
  return null;
}
