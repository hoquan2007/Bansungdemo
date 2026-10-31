// Original second course inspired by two-map surf playlists. These slopes and
// all their coordinates are authored for Crown / Strike, not extracted assets.
import { box } from './helpers.js';

const points = [
  [0, 35, 28],
  [12, 28, -15],
  [-10, 20, -55],
  [14, 14, -100],
  [-10, 8, -140],
  [0, 3, -175],
];
const segments = points.slice(0, -1).map((from, index) => ({
  from, to: points[index + 1], halfWidth: 9, bankRise: index % 2 ? 5.8 : 6.4,
}));
const checkpoints = segments.slice(1).map((segment, index) => {
  const t = 0.16;
  return {
    progress: index + 1 + t,
    pos: segment.from.map((n, axis) => n + (segment.to[axis] - n) * t),
    yaw: Math.atan2(-(segment.to[0] - segment.from[0]), -(segment.to[2] - segment.from[2])),
  };
});

export default {
  id: 'surf-utopia',
  name: 'Utopia Run',
  blurb: 'Five alternating banks, four checkpoints and a long downhill finish.',
  singlePlayer: true,
  skyColor: 0xad96d6,
  fogColor: 0xf3c9e1,
  fogDensity: 0.0027,
  ambientLight: 1.4,
  sunDirection: [-0.4, 1, -0.6],
  sunIntensity: 1.75,
  bounds: { min: [-38, -48, -200], max: [38, 56, 46] },
  boxes: [
    box(0, 33, 33, 14, 2, 14, 0xe9b9de, 'surf-pad'),
    box(0, 1, -182, 18, 2, 26, 0xdfadd3, 'surf-pad'),
  ],
  spawns: { ffa: [[0, 35, 34]], A: [[0, 35, 34]], B: [[0, 35, 34]] },
  spawnYaw: 0,
  surf: {
    segments,
    checkpoints,
    start: [0, 35, 34],
    startYaw: 0,
    startPad: { minX: -7, maxX: 7, minZ: 26, maxZ: 40, y: 35 },
    finishPad: { minX: -9, maxX: 9, minZ: -195, maxZ: -169, y: 3 },
    finishProgress: segments.length - 0.035,
    voidY: -25,
    voidX: 42,
    voidZ: -201,
    maxSpeed: 84,
    colors: [0xddb5ea, 0xf7b8d6, 0xd2c6f5, 0xf8cee1, 0xc2b9ef],
  },
};
