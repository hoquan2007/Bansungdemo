// Merge JSON reports from separate real-GPU runs. Copy reports from additional
// computers into docs/benchmarks before running this command.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MB = 1024 * 1024;
const round = (value, digits = 2) => Number(value.toFixed(digits));
const number = (value, fallback = null) => Number.isFinite(value) ? value : fallback;

export function summarizeGpuBenchmarks(reports, minSeconds = 60) {
  if (!Number.isFinite(minSeconds) || minSeconds < 2) {
    throw new Error('BENCH_MIN_SECONDS must be >= 2');
  }
  const validRuns = [];
  const excluded = [];
  for (const { file, data } of reports) {
    const clients = data?.clients;
    const validPair = data?.ok === true && data.independentChromeProcesses === true &&
      Array.isArray(clients) && clients.length === 2 &&
      clients[0]?.chromePid !== clients[1]?.chromePid &&
      clients.every((client) => Number(client.actualDurationMs) >= minSeconds * 1000 - 1000 &&
        Number(client.sampleCount) >= minSeconds * 15 &&
        Array.isArray(client.errors) && client.errors.length === 0 &&
        typeof client.gpuRenderer === 'string' &&
        /NVIDIA|AMD|Radeon|Intel|Apple|Adreno|Mali/i.test(client.gpuRenderer) &&
        !/SwiftShader|llvmpipe|WARP|Software/i.test(client.gpuRenderer));
    if (!validPair) {
      excluded.push({ file, reason: 'incomplete, too short, failed, or hardware GPU unverified' });
      continue;
    }
    const gpus = [...new Set(clients.map((client) => client.gpuRenderer))];
    if (gpus.length !== 1) {
      excluded.push({ file, reason: 'Chrome instances reported inconsistent GPU renderers' });
      continue;
    }
    const gpu = gpus[0];
    const viewport = clients[0].browserResolution;
    const renderDpr = clients[0].render?.pixelRatio ?? viewport?.pixelRatio ?? 1;
    const quality = data.quality ?? clients[0].render?.quality ?? 'unspecified';
    const entries = clients.map((client) => {
      const heapSamples = client.heapSamples ?? [];
      const first = heapSamples[0]?.usedJSHeapBytes;
      const last = heapSamples.at(-1)?.usedJSHeapBytes;
      const segments = client.segments ?? [];
      return {
        chromePid: client.chromePid, name: client.name,
        meanFps: client.meanFps, p95Ms: client.p95Ms, p99Ms: client.p99Ms,
        framesOver16ms: client.framesOver16ms ?? null,
        framesOver33ms: client.framesOver33ms ?? null,
        sampleCount: client.sampleCount,
        earlyP95Ms: number(segments[0]?.p95Ms),
        lateP95Ms: number(segments.at(-1)?.p95Ms),
        heapDeltaMb: Number.isFinite(first) && Number.isFinite(last)
          ? round((last - first) / MB) : null,
        render: {
          drawCalls: client.render?.calls ?? null,
          triangles: client.render?.triangles ?? null,
        },
        network: {
          remotePlayers: client.remotePlayers,
          movementMeters: client.actions?.movedMeters ?? null,
          crouchObserved: client.actions?.crouchFlagSeenByOtherChrome ?? null,
          shotsObserved: client.actions?.shotsSeenByOtherChrome ?? null,
          reloadsObserved: client.actions?.reloadEventsSeenByOtherChrome ?? null,
        },
      };
    });
    validRuns.push({
      file, createdAt: data.createdAt ?? null,
      mapId: data.mapId, gpuRenderer: gpu, quality,
      machineLabel: typeof data.machineLabel === 'string' &&
        /^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/.test(data.machineLabel)
        ? data.machineLabel : null,
      viewport: `${viewport?.width ?? '?'}x${viewport?.height ?? '?'}`,
      browserDpr: viewport?.pixelRatio ?? null, renderDpr,
      durationSeconds: round(Math.min(...clients.map((c) => c.actualDurationMs)) / 1000),
      minMeanFps: Math.min(...entries.map((c) => c.meanFps)),
      worstP95Ms: Math.max(...entries.map((c) => c.p95Ms)),
      worstP99Ms: Math.max(...entries.map((c) => c.p99Ms)),
      clients: entries,
    });
  }
  // Renderer identity groups GPU models; it cannot identify unique physical cards.
  const uniqueGpus = [...new Set(validRuns.map((run) => run.gpuRenderer))].sort();
  // Labeled device configurations distinguish separately tested computers,
  // including two different computers that report the same renderer model.
  // Labels are self-reported; they are not a hardware attestation.
  const gpuConfigurations = [...new Map(validRuns.filter((run) => run.machineLabel)
    .map((run) => [JSON.stringify([run.machineLabel, run.gpuRenderer]),
      { machineLabel: run.machineLabel, gpuRenderer: run.gpuRenderer }])).values()]
    .sort((a, b) => a.machineLabel.localeCompare(b.machineLabel) ||
      a.gpuRenderer.localeCompare(b.gpuRenderer));
  const groupMap = new Map();
  for (const run of validRuns) {
    const key = JSON.stringify([run.machineLabel, run.gpuRenderer, run.mapId, run.quality,
      run.viewport, run.renderDpr]);
    if (!groupMap.has(key)) groupMap.set(key, {
      machineLabel: run.machineLabel,
      gpuRenderer: run.gpuRenderer, mapId: run.mapId, quality: run.quality,
      viewport: run.viewport, renderDpr: run.renderDpr,
      runs: [], minMeanFps: Infinity, worstP95Ms: 0, worstP99Ms: 0,
      maxLateMinusEarlyP95Ms: null,
    });
    const group = groupMap.get(key);
    group.runs.push(run.file);
    group.minMeanFps = Math.min(group.minMeanFps, run.minMeanFps);
    group.worstP95Ms = Math.max(group.worstP95Ms, run.worstP95Ms);
    group.worstP99Ms = Math.max(group.worstP99Ms, run.worstP99Ms);
    for (const client of run.clients) {
      if (client.earlyP95Ms === null || client.lateP95Ms === null) continue;
      const drift = round(client.lateP95Ms - client.earlyP95Ms);
      group.maxLateMinusEarlyP95Ms = Math.max(group.maxLateMinusEarlyP95Ms ?? -Infinity, drift);
    }
  }
  return {
    minSeconds, validRunCount: validRuns.length, excluded,
    uniqueGpuRendererCount: uniqueGpus.length, multiGpuModelsVerified: uniqueGpus.length >= 2,
    labeledGpuConfigurationCount: gpuConfigurations.length,
    multiGpuConfigurationsReported: gpuConfigurations.length >= 2,
    gpuConfigurations,
    gpuRenderers: uniqueGpus, groups: [...groupMap.values()], validRuns,
    caveats: [
      'Two independent Chrome processes on one computer generally share the same physical GPU.',
      'DUAL_MACHINE_LABEL is optional and self-reported: separate labels do not prove separate physical GPUs.',
      'rAF measures frame intervals; it is not GPU timestamp query or VRAM telemetry.',
      'JS heap change is affected by garbage collection and is not proof of absence of memory leaks.',
      'Headless Chrome uses emulated pointer-lock state; physical keyboard/mouse feel is untested.',
    ],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = path.resolve(root, process.env.BENCH_REPORT_DIR ?? 'docs/benchmarks');
  const minimum = Number(process.env.BENCH_MIN_SECONDS ?? 60);
  const reports = existsSync(dir) ? readdirSync(dir)
    .filter((name) => /^two-chrome-.*\.json$/i.test(name))
    .map((name) => {
      try { return { file: name, data: JSON.parse(readFileSync(path.join(dir, name), 'utf8')) }; }
      catch (error) { return { file: name, data: null, parseError: error.message }; }
    }) : [];
  const summary = summarizeGpuBenchmarks(reports, minimum);
  summary.generatedAt = new Date().toISOString();
  mkdirSync(dir, { recursive: true });
  const output = path.join(dir, 'gpu-benchmark-summary.json');
  writeFileSync(output, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ reportPath: output,
    validRunCount: summary.validRunCount,
    uniqueGpuRendererCount: summary.uniqueGpuRendererCount,
    multiGpuModelsVerified: summary.multiGpuModelsVerified,
    labeledGpuConfigurationCount: summary.labeledGpuConfigurationCount,
    multiGpuConfigurationsReported: summary.multiGpuConfigurationsReported,
    groups: summary.groups,
    excluded: summary.excluded,
  }, null, 2));
}
