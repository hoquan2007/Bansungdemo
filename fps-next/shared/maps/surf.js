// An original, continuous four-run surf course. All coordinates are authored here;
// the renderer and the physics engine consume exactly the same sloped surfaces.
import { box } from './helpers.js';

const points = [
  [0, 28, 28],
  [-9, 22, -12],
  [10, 16, -52],
  [-10, 10, -92],
  [0, 4, -132],
];

const segments = points.slice(0, -1).map((from, i) => ({
  from, to: points[i + 1], halfWidth: 7.5, bankRise: 4.6,
}));

// Checkpoint positions lie inside the *next* ramp, avoiding a risky respawn on
// a hard seam. Course progress is expressed as segment index + fraction.
const checkpoints = [1, 2, 3].map((index) => {
  const segment = segments[index];
  const t = 0.16;
  return {
    progress: index + t,
    pos: segment.from.map((n, axis) => n + (segment.to[axis] - n) * t),
    yaw: Math.atan2(-(segment.to[0] - segment.from[0]), -(segment.to[2] - segment.from[2])),
  };
});

export default {
  id: 'surf',
  name: 'Momentum Surf',
  blurb: 'Solo slope surfing, momentum chaining and timed checkpoints.',
  singlePlayer: true,
  skyColor: 0x93b9cf,
  fogColor: 0xc6e4e8,
  fogDensity: 0.003,
  ambientLight: 1.3,
  sunDirection: [0.6, 1, -0.25],
  sunIntensity: 1.7,
  bounds: { min: [-35, -45, -158], max: [35, 52, 44] },
  boxes: [
    box(0, 26, 33, 14, 2, 14, 0x8abecb, 'surf-pad'),
    box(0, 2, -140, 15, 2, 24, 0x789fb1, 'surf-pad'),
  ],
  spawns: { ffa: [[0, 28, 34]], A: [[0, 28, 34]], B: [[0, 28, 34]] },
  spawnYaw: 0,
  surf: {
    segments,
    checkpoints,
    start: [0, 28, 34],
    startYaw: 0,
    startPad: { minX: -7, maxX: 7, minZ: 26, maxZ: 40, y: 28 },
    finishPad: { minX: -7.5, maxX: 7.5, minZ: -152, maxZ: -128, y: 4 },
    finishProgress: segments.length - 0.035,
    voidY: -20,
    voidX: 40,
    voidZ: -160,
    maxSpeed: 78,
  },
};
