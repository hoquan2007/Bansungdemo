// Pixel density is the cheapest safe knob for adapting GPU fragment load.
// Never change gameplay distance, visibility, collision or hit registration.
const PRESETS = { low: 0.8, medium: 1.25, high: 2 };

export function createGpuQuality(renderer, { search = window.location.search, deviceRatio = window.devicePixelRatio || 1 } = {}) {
  const requested = new URLSearchParams(search).get('gpuQuality') ?? 'auto';
  const preset = Object.hasOwn(PRESETS, requested) ? requested : 'auto';
  const deviceCap = Math.max(0.5, Math.min(2, deviceRatio));
  const lower = Math.min(0.75, deviceCap);
  const upper = Math.min(1.6, deviceCap);
  let pixelRatio = preset === 'auto' ? Math.min(upper, 1.4) : Math.min(deviceCap, PRESETS[preset]);
  let avgFrameMs = 16.7;
  let elapsed = 0;
  let stableFastMs = 0;
  let samples = 0;
  renderer.setPixelRatio(pixelRatio);

  const gl = renderer.getContext();
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const gpuRenderer = debugInfo
    ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
    : gl.getParameter(gl.RENDERER);

  function update(dt, active = true) {
    if (preset !== 'auto' || !active || dt <= 0 || dt > 0.1) return;
    avgFrameMs += (dt * 1000 - avgFrameMs) * 0.045;
    elapsed += dt;
    samples++;
    if (samples < 100 || elapsed < 2.5) return;
    elapsed = 0;
    const slow = avgFrameMs > 24;
    stableFastMs = avgFrameMs < 15 ? stableFastMs + 2.5 : 0;
    const next = slow ? pixelRatio - 0.15 : stableFastMs >= 10 ? pixelRatio + 0.1 : pixelRatio;
    const adjusted = Math.max(lower, Math.min(upper, Math.round(next * 20) / 20));
    if (Math.abs(adjusted - pixelRatio) >= 0.049) {
      pixelRatio = adjusted;
      renderer.setPixelRatio(pixelRatio);
      stableFastMs = 0;
    }
  }

  return {
    preset,
    gpuRenderer,
    update,
    get pixelRatio() { return pixelRatio; },
    get averageFrameMs() { return avgFrameMs; },
  };
}
