import test from 'node:test';
import assert from 'node:assert/strict';
import { AnimationClip, Quaternion, QuaternionKeyframeTrack } from 'three';
import {
  chooseRemoteClip, playRemoteShot, playRemoteReload, remoteReloadPose,
} from '../client/src/characterAnimation.js';
import { selectHeldWeapon } from '../client/src/heldWeapon.js';
import {
  alignTacticalBindTracks, alignTacticalHipTracks, soldierBoneForTactical,
  stabilizeTacticalCrouch, updateTacticalCrouchVisual,
} from '../client/src/tacticalAnimation.js';

test('tactical Mixamo bones map to soldier clips after GLTFLoader name sanitization', () => {
  assert.equal(soldierBoneForTactical('mixamorig:Hips_01'), 'Hips');
  assert.equal(soldierBoneForTactical('mixamorigHips_01'), 'Hips');
  assert.equal(soldierBoneForTactical('mixamorigRightArm_09'), 'UpperArmR');
  assert.equal(soldierBoneForTactical('mixamorigLeftFoot_065'), 'FootL');
  assert.equal(soldierBoneForTactical('mixamorigRightUpLeg_057'), 'UpperLegR');
  assert.equal(soldierBoneForTactical('mixamorigLeftLeg_064'), 'LowerLegL');
  assert.equal(soldierBoneForTactical('Right_Elbow_Pads_031'), null);
});

test('tactical bind calibration restores authored stance without flattening locomotion changes', () => {
  const hipName = 'mixamorigHips_01';
  const axis = [1, 0, 0];
  const xRotation = degrees => new Quaternion().setFromAxisAngle(
    { x: axis[0], y: axis[1], z: axis[2] }, degrees * Math.PI / 180);
  const makeClip = (name, degrees) => new AnimationClip(name, 1, [
    new QuaternionKeyframeTrack(`.bones[${hipName}].quaternion`, [0, 1], [
      ...xRotation(degrees).toArray(), ...xRotation(degrees + 5).toArray(),
    ]),
  ]);
  const binds = new Map(Array.from({length:15}, (_, i) =>
    [`mixamorigBone_${i}`, xRotation(i)]));
  const clips = [makeClip('Idle', -10), makeClip('Run', 20)];
  for (const [name] of binds) {
    clips.forEach((clip) => clip.tracks.push(new QuaternionKeyframeTrack(`.bones[${name}].quaternion`, [0, 1], [
      ...xRotation(0).toArray(), ...xRotation(7).toArray(),
    ])));
  }
  const bind = xRotation(80);
  binds.set(hipName, bind);
  assert.equal(alignTacticalBindTracks(clips, binds), true);
  const get = clip => new Quaternion().fromArray(clip.tracks[0].values, 0);
  assert.ok(get(clips[0]).angleTo(bind) < 1e-5);
  assert.ok(get(clips[1]).angleTo(xRotation(110)) < 1e-5);
  assert.ok(new Quaternion().fromArray(clips[1].tracks[0].values, 4)
    .angleTo(xRotation(115)) < 1e-5);
  assert.ok(new Quaternion().fromArray(clips[0].tracks[1].values, 0)
    .angleTo(xRotation(0)) < 1e-5);
  assert.ok(new Quaternion().fromArray(clips[1].tracks[2].values, 4)
    .angleTo(xRotation(8)) < 1e-5);
});

test('single-hip calibration succeeds without weakening the full rig bone requirement', () => {
  const bone = 'mixamorigHips_01';
  const makeClip = (name) => new AnimationClip(name, 0.5, [
    new QuaternionKeyframeTrack(`.bones[${bone}].quaternion`, [0, 0.5], [0, 0, 0, 1, 0, 0, 0, 1]),
  ]);
  const clips = [makeClip('Idle'), makeClip('Walk')];
  const bind = new Quaternion().setFromAxisAngle({ x: 1, y: 0, z: 0 }, Math.PI / 2);
  assert.equal(alignTacticalHipTracks(clips, bone, bind), true);
  // QuaternionKeyframeTrack stores Float32 values, giving ~0.00037 radian
  // angleTo error for an exact 90-degree bind rotation.
  assert.ok(new Quaternion().fromArray(clips[1].tracks[0].values, 0).angleTo(bind) < 5e-4);
  assert.equal(alignTacticalBindTracks([makeClip('Idle')], new Map([[bone, bind]])), false);
});

test('Duck retains bent legs while borrowing stable weapon-ready upper body from Idle', () => {
  const makeTrack = (bone, radians) => new QuaternionKeyframeTrack(
    `.bones[mixamorig${bone}_01].quaternion`, [0, 0.4], [
      0, Math.sin(radians / 2), 0, Math.cos(radians / 2),
      0, Math.sin(radians / 2), 0, Math.cos(radians / 2),
    ],
  );
  const arms = ['Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm'];
  const legs = ['Hips', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg'];
  const idle = new AnimationClip('Idle', 0.4, [...arms, ...legs].map(bone => makeTrack(bone, 0.1)));
  const duck = new AnimationClip('Duck', 0.4, [...arms, ...legs].map(bone => makeTrack(bone, 0.7)));
  assert.equal(stabilizeTacticalCrouch([idle, duck]), true);
  for (const bone of arms) {
    const track = duck.tracks.find(t => t.name.includes(`mixamorig${bone}_01]`));
    assert.ok(Math.abs(track.values[1] - Math.sin(0.1 / 2)) < 1e-5, `${bone} arms drifted`);
  }
  for (const bone of legs) {
    const track = duck.tracks.find(t => t.name.includes(`mixamorig${bone}_01]`));
    assert.ok(Math.abs(track.values[1] - Math.sin(0.7 / 2)) < 1e-5, `${bone} knee was lost`);
  }
});

test('visual crouch stays at physical head height and restores standing scale', () => {
  const character = {
    tactical: true, crouchVisual: 0, baseScaleY: 1.2, baseRootY: 0.1,
    root: { scale: { y: 1.2 }, position: { y: 0.1 } },
  };
  updateTacticalCrouchVisual(character, true, 1);
  assert.equal(character.crouchVisual, 1);
  assert.ok(Math.abs(character.root.scale.y - 1.056) < 1e-5);
  assert.ok(Math.abs(character.root.position.y - (-0.15)) < 1e-5);
  updateTacticalCrouchVisual(character, false, 1);
  assert.equal(character.crouchVisual, 0);
  assert.equal(character.root.scale.y, 1.2);
  assert.ok(Math.abs(character.root.position.y - 0.02) < 1e-5);
});

test('tactical remote keeps a visible firearm silhouette across weapon switches', () => {
  const held = new Map([['AK', { visible: false }]]);
  assert.equal(selectHeldWeapon(held, 'AK', true, 'rifle'), 'AK');
  assert.equal(selectHeldWeapon(held, 'Pistol', true, 'pistol'), 'AK');
  assert.equal(selectHeldWeapon(held, 'Sniper', true, 'sniper'), 'AK');
  assert.equal(selectHeldWeapon(held, 'Knife_1', true, 'melee'), null);
  assert.equal(selectHeldWeapon(held, null, true, null), null);
  assert.equal(selectHeldWeapon(held, 'Pistol', false, 'pistol'), null);
});

const clip = (memory, state, at) => chooseRemoteClip(memory, state, at);

test('remote locomotion selects armed sprint, crouch and firing clips', () => {
  const memory = {};
  assert.equal(clip(memory, { moving: true, sprinting: true, armed: true }, 1000), 'Run_Gun');
  assert.equal(clip(memory, { moving: true, sprinting: true, firing: true }, 1020), 'Run_Shoot');
  assert.equal(clip(memory, { crouched: true, moving: true }, 1040), 'Duck');
  assert.equal(clip(memory, { moving: true, firing: true }, 1060), 'Walk_Shoot');
  assert.equal(clip(memory, { firing: true }, 1080), 'Idle_Shoot');
});

test('server shot pulse keeps a short remote firing pose between snapshots', () => {
  const rp = { shotPulses: new Map() };
  const memory = {};
  assert.equal(playRemoteShot(rp, '', 1000), false);
  assert.equal(playRemoteShot(rp, 'peer', 1000), true);
  assert.equal(clip(memory, { firing: rp.shotPulses.get('peer') > 1100 }, 1100), 'Idle_Shoot');
  assert.equal(playRemoteShot(rp, 'peer', 1150), true);
  assert.equal(rp.shotPulses.get('peer'), 1340);
  assert.equal(clip(memory, { firing: rp.shotPulses.get('peer') > 1350 }, 1350), 'Idle');
});

test('remote cosmetic reload validates event and tracks one peer and weapon independently', () => {
  const rp = { reloads: new Map() };
  assert.equal(playRemoteReload(rp, '', 'rifle', 1600, 1000), false);
  assert.equal(playRemoteReload(rp, 'peer', '', 1600, 1000), false);
  assert.equal(playRemoteReload(rp, 'peer', 'rifle', 199, 1000), false);
  assert.equal(playRemoteReload(rp, 'peer', 'rifle', 6001, 1000), false);
  assert.equal(playRemoteReload(rp, 'peer', 'rifle', NaN, 1000), false);
  assert.equal(playRemoteReload(rp, 'peer', 'rifle', 1600, 1000), true);
  assert.deepEqual(rp.reloads.get('peer'), {
    weaponId: 'rifle', startedAt: 1000, durationMs: 1600, until: 2600,
  });
  assert.equal(playRemoteReload(rp, 'other', 'pistol', 1100, 1040), true);
  assert.equal(rp.reloads.get('peer').weaponId, 'rifle');
  assert.equal(rp.reloads.get('other').until, 2140);
});

test('remote reload pose detaches magazine, racks handle and returns to rest', () => {
  assert.deepEqual(remoteReloadPose(0), { magazine: 0, dip: 0, handle: 0 });
  assert.ok(remoteReloadPose(0.45).magazine > 0.99);
  assert.ok(remoteReloadPose(0.91).handle > 0.8);
  assert.deepEqual(remoteReloadPose(1), { magazine: 0, dip: 0, handle: 0 });
  assert.deepEqual(remoteReloadPose(Infinity), remoteReloadPose(0));
});

test('remote jump plays start, air loop and landing without spurious first-frame landing', () => {
  const memory = {};
  assert.equal(clip(memory, { airborne: true }, 1000), 'Jump_Idle');
  assert.equal(clip(memory, { airborne: false }, 1100), 'Jump_Land');
  assert.equal(clip(memory, { airborne: false }, 1510), 'Idle');
  assert.equal(clip(memory, { airborne: true }, 1600), 'Jump');
  assert.equal(clip(memory, { airborne: true }, 1900), 'Jump_Idle');
  assert.equal(clip(memory, { airborne: false }, 2000), 'Jump_Land');
  assert.equal(clip(memory, { moving: true }, 2450), 'Walk');
});

test('remote damage reaction plays once per observed health loss with a cooldown', () => {
  const memory = {};
  assert.equal(clip(memory, { health: 100 }, 1000), 'Idle');
  assert.equal(clip(memory, { health: 75 }, 1100), 'HitReact');
  assert.equal(clip(memory, { health: 75 }, 1200), 'HitReact');
  assert.equal(clip(memory, { health: 75 }, 1400), 'Idle');
  assert.equal(clip(memory, { health: 50 }, 1500), 'Idle');
  assert.equal(clip(memory, { health: 45 }, 1700), 'HitReact');
});

test('death and respawn clear stale air and damage animation states', () => {
  const memory = {};
  clip(memory, { health: 70, airborne: false }, 1000);
  clip(memory, { health: 40, airborne: true }, 1100);
  assert.equal(clip(memory, { dead: true, health: 0 }, 1200), 'Death');
  assert.equal(clip(memory, { health: 100, airborne: false }, 1300), 'Idle');
});
