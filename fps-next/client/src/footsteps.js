// Footstep cadence is measured from actual ground displacement, so idle
// animation, low FPS and friction sliding cannot create fake running sounds.
export function createFootstepTracker() {
  return { x: null, z: null, metres: 0, grounded: false };
}

export function resetFootstepTracker(tracker) {
  tracker.x = null;
  tracker.z = null;
  tracker.metres = 0;
  tracker.grounded = false;
}

/** Returns 'step', 'land', or null. Pos is the player's foot position. */
export function advanceFootstep(tracker, {
  x, z, grounded = false, active = true, sprinting = false, crouched = false,
}) {
  if (!active || !Number.isFinite(x) || !Number.isFinite(z)) {
    resetFootstepTracker(tracker);
    return null;
  }

  if (tracker.x === null) {
    tracker.x = x;
    tracker.z = z;
    tracker.grounded = grounded;
    return null;
  }

  const moved = Math.hypot(x - tracker.x, z - tracker.z);
  const landed = !tracker.grounded && grounded;
  tracker.x = x;
  tracker.z = z;
  tracker.grounded = grounded;

  // Teleports, respawns and tab stalls do not count as strides.
  if (moved > 3.5) {
    tracker.metres = 0;
    return null;
  }
  if (!grounded) {
    tracker.metres = 0;
    return null;
  }
  if (landed) {
    tracker.metres = 0;
    return 'land';
  }

  const stride = crouched ? 1.2 : sprinting ? 2.15 : 1.55;
  tracker.metres += moved;
  if (tracker.metres < stride) return null;
  tracker.metres %= stride;
  return 'step';
}

/** Map an actual ground collider to an inexpensive acoustic category. */
export function footstepSurface(map, box) {
  const tag = box?.tag ?? '';
  const explicit = tag.startsWith('surface:') ? tag.split(':')[1] : tag;
  const authored = box?.color && map?.materialTextures?.[box.color];
  const value = String(explicit || authored || map?.groundTexture || '').toLowerCase();

  if (/metal|barrel|steel|iron|grate/.test(value)) return 'metal';
  if (/wood|crate|timber|plank/.test(value)) return 'wood';
  if (/dirt|grass|sand|soil|mud|earth|field/.test(value)) return 'dirt';
  return 'stone';
}
