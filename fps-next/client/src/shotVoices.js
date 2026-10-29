// Keep distant firefights from saturating WebAudio without sacrificing the
// immediate feedback of a player's own weapon.
export function createShotVoiceLimiter({ remoteBudget = 8, windowSeconds = 0.05 } = {}) {
  let startedAt = Number.NEGATIVE_INFINITY;
  let remoteVoices = 0;

  return (time, local = false) => {
    if (local) return true;
    if (time < startedAt || time - startedAt >= windowSeconds - 1e-9) {
      startedAt = time;
      remoteVoices = 0;
    }
    if (remoteVoices >= remoteBudget) return false;
    remoteVoices += 1;
    return true;
  };
}
