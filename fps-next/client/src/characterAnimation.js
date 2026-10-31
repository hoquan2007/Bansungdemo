// Third-person visual animation states. This only interprets interpolated
// snapshots; hitboxes, movement and damage stay authoritative elsewhere.
const JUMP_START_MS = 280;
const JUMP_LAND_MS = 400;
const HIT_REACT_MS = 280;
const HIT_COOLDOWN_MS = 550;
// One confirmed shot may fall between the 20 Hz world snapshots.
const SHOT_POSE_MS = 190;

/** Store a short visual-only firing pose from a server-confirmed shot event. */
export function playRemoteShot(rp, id, now = performance.now()) {
  if (!id || !rp?.shotPulses) return false;
  rp.shotPulses.set(id, now + SHOT_POSE_MS);
  return true;
}

/** A server-relayed reload is strictly visual; it cannot affect ammo or damage. */
export function playRemoteReload(rp, id, weaponId, durationMs, now = performance.now()) {
  if (!id || !weaponId || !rp?.reloads || !Number.isFinite(durationMs) ||
      durationMs < 200 || durationMs > 6000) return false;
  rp.reloads.set(id, { weaponId, startedAt: now, durationMs, until: now + durationMs });
  return true;
}

/** Timings for the physical magazine and muzzle dip on a hand-held M4. */
export function remoteReloadPose(progress) {
  const p = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const magazine = p < 0.16 ? 0
    : p < 0.40 ? (p - 0.16) / 0.24
      : p < 0.65 ? 1
        : p < 0.85 ? 1 - (p - 0.65) / 0.20 : 0;
  const handle = p < 0.83 ? 0
    : p < 0.9 ? (p - 0.83) / 0.07
      : p < 0.97 ? 1 - (p - 0.9) / 0.07 : 0;
  return { magazine, dip: p === 0 || p === 1 ? 0 : Math.sin(Math.PI * p), handle };
}

/**
 * Select a clip from the existing Quaternius Soldier rig.
 * `memory` belongs to one remote entity, so transitions never leak between peers.
 * `now` is a monotonic timestamp in milliseconds.
 */
export function chooseRemoteClip(memory, {
  dead = false, airborne = false, crouched = false, moving = false,
  sprinting = false, firing = false, armed = false, health = null,
}, now) {
  if (dead) {
    memory.wasAirborne = null;
    memory.lastHealth = health;
    memory.phase = null;
    memory.phaseEndsAt = 0;
    return 'Death';
  }

  const jumped = memory.wasAirborne === false && airborne;
  const landed = memory.wasAirborne === true && !airborne;
  memory.wasAirborne = airborne;

  const tookDamage = Number.isFinite(health)
    && Number.isFinite(memory.lastHealth) && health < memory.lastHealth;
  if (Number.isFinite(health)) memory.lastHealth = health;

  if (jumped) {
    memory.phase = 'Jump';
    memory.phaseEndsAt = now + JUMP_START_MS;
  } else if (landed) {
    memory.phase = 'Jump_Land';
    memory.phaseEndsAt = now + JUMP_LAND_MS;
  } else if (tookDamage && !airborne && now >= (memory.nextHitAt ?? 0)) {
    memory.phase = 'HitReact';
    memory.phaseEndsAt = now + HIT_REACT_MS;
    memory.nextHitAt = now + HIT_COOLDOWN_MS;
  }

  if (airborne) {
    return memory.phase === 'Jump' && now < memory.phaseEndsAt ? 'Jump' : 'Jump_Idle';
  }
  if (memory.phase && now < memory.phaseEndsAt) return memory.phase;
  memory.phase = null;

  if (crouched) return 'Duck';
  if (moving) {
    if (sprinting) return firing ? 'Run_Shoot' : armed ? 'Run_Gun' : 'Run';
    return firing ? 'Walk_Shoot' : 'Walk';
  }
  return firing ? 'Idle_Shoot' : 'Idle';
}
