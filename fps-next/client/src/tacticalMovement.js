// Timed, momentum-preserving combat slide. It reuses the regular player
// collision capsule and never increases the server-validated sprint speed.
export const SLIDE_DURATION = 0.55;
export const SLIDE_COOLDOWN = 1.35;

export function updateTacticalSlide(player, dt, {
  crouchDown = false,
  forward = 0,
  sprinting = false,
  aiming = false,
  slowWalking = false,
  active = true,
  speedCap = 0,
} = {}) {
  const pressed = crouchDown && !player.slideInputDown;
  player.slideInputDown = crouchDown;
  player.slideCooldown = Math.max(0, (player.slideCooldown ?? 0) - dt);

  if (!active || !player.onGround) {
    player.slideRemaining = 0;
    return false;
  }

  if (player.slideRemaining > 0) {
    player.slideRemaining = Math.max(0, player.slideRemaining - dt);
    return player.slideRemaining > 0;
  }

  const speed = Math.hypot(player.vel[0], player.vel[2]);
  if (pressed && player.slideCooldown === 0 && sprinting && forward > 0.55 &&
      !aiming && !slowWalking && player.crouchAmount < 0.2 &&
      speedCap > 0 && speed >= speedCap * 0.7) {
    player.slideRemaining = SLIDE_DURATION;
    player.slideCooldown = SLIDE_COOLDOWN;
    return true;
  }

  return false;
}
