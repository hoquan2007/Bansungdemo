import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeGpuBenchmarks } from '../scripts/summarize-gpu-benchmarks.mjs';

function sample(gpu, mapId = 'courtyard', duration = 180000) {
  const client = (chromePid, fps, heapChange) => ({
    chromePid, name: `chrome-${chromePid}`, gpuRenderer: gpu,
    actualDurationMs: duration, sampleCount: 12000,
    errors: [], meanFps: fps, p95Ms: 7.2, p99Ms: 12,
    browserResolution: { width: 1920, height: 1080, pixelRatio: 2 },
    render: { quality: 'high', pixelRatio: 1.5, calls: 700, triangles: 280000 },
    segments: [{ p95Ms: 7.0 }, { p95Ms: 7.5 }],
    heapSamples: [{ usedJSHeapBytes: 20 * 1024 * 1024 },
      { usedJSHeapBytes: (20 + heapChange) * 1024 * 1024 }],
    actions: { movedMeters: 5.6, crouchFlagSeenByOtherChrome: true,
      shotsSeenByOtherChrome: 4, reloadEventsSeenByOtherChrome: 1 },
  });
  return { ok: true, independentChromeProcesses: true, mapId,
    clients: [client(101, 100, 3), client(102, 90, -2)] };
}

test('two browsers sharing a hardware GPU count as one GPU, with actual render DPR', () => {
  const firstGpu = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 5060 Laptop GPU, D3D11)';
  const summary = summarizeGpuBenchmarks([
    { file: 'run1.json', data: sample(firstGpu) },
    { file: 'run2.json', data: sample(firstGpu, 'island') },
  ]);
  assert.equal(summary.validRunCount, 2);
  assert.equal(summary.uniqueGpuRendererCount, 1);
  assert.equal(summary.multiGpuModelsVerified, false);
  assert.equal(summary.groups.length, 2);
  assert.equal(summary.groups[0].renderDpr, 1.5);
  assert.equal(summary.groups[0].minMeanFps, 90);
  assert.equal(summary.groups[0].maxLateMinusEarlyP95Ms, 0.5);
  assert.equal(summary.validRuns[0].clients[0].heapDeltaMb, 3);
});

test('multi-GPU requires distinct verified hardware, rejects brief and software runs', () => {
  const nvidia = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 5060 Laptop GPU, D3D11)';
  const amd = 'ANGLE (AMD, AMD Radeon RX 6700 XT, D3D11)';
  const summary = summarizeGpuBenchmarks([
    { file: 'short.json', data: sample(nvidia, 'courtyard', 3000) },
    { file: 'software.json', data: sample('Google SwiftShader (Software)') },
    { file: 'nvidia.json', data: sample(nvidia) },
    { file: 'amd.json', data: sample(amd) },
  ]);
  assert.equal(summary.excluded.length, 2);
  assert.equal(summary.validRunCount, 2);
  assert.equal(summary.uniqueGpuRendererCount, 2);
  assert.equal(summary.multiGpuModelsVerified, true);
});

test('separate labeled machines with the same GPU model remain distinct configurations', () => {
  const gpu = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 5060 Laptop GPU, D3D11)';
  const first = sample(gpu);
  first.machineLabel = 'test-rig-a';
  const second = sample(gpu);
  second.machineLabel = 'test-rig-b';
  const summary = summarizeGpuBenchmarks([
    { file: 'first.json', data: first },
    { file: 'second.json', data: second },
    { file: 'legacy.json', data: sample(gpu, 'island') },
  ]);
  assert.equal(summary.uniqueGpuRendererCount, 1);
  assert.equal(summary.multiGpuModelsVerified, false);
  assert.equal(summary.labeledGpuConfigurationCount, 2);
  assert.equal(summary.multiGpuConfigurationsReported, true);
  assert.deepEqual(summary.gpuConfigurations.map((item) => item.machineLabel),
    ['test-rig-a', 'test-rig-b']);
  // Identical GPU models on separate machines must not have their results merged
  // into one benchmark group, even for an identical scene and render profile.
  assert.equal(summary.groups.length, 3);
  assert.deepEqual(summary.groups.map((item) => item.machineLabel).sort(),
    [null, 'test-rig-a', 'test-rig-b'].sort());
  assert.equal(summary.validRuns.find((item) => item.file === 'legacy.json').machineLabel, null);
});
