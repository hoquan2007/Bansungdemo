// Reuse the gameplay Soldier clips on the higher-detail 88-bone tactical rig.
// Retarget only once when assets load, never inside the frame loop or per peer.
import { retargetClip } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Quaternion, QuaternionKeyframeTrack } from 'three';
import { instantiate } from './models.js';

const SOURCE_BONES = {
  Hips: 'Hips',
  Spine: 'Abdomen',
  Spine1: 'Torso',
  Spine2: 'Torso',
  Neck: 'Neck',
  Head: 'Head',
  // GLTFLoader strips reserved '.' from Soldier node names, e.g. UpperLeg.L
  // becomes UpperLegL. retargetClip looks up the *loaded* skeleton bone names.
  RightShoulder: 'ShoulderR',
  RightArm: 'UpperArmR',
  RightForeArm: 'LowerArmR',
  LeftShoulder: 'ShoulderL',
  LeftArm: 'UpperArmL',
  LeftForeArm: 'LowerArmL',
  RightUpLeg: 'UpperLegR',
  RightLeg: 'LowerLegR',
  RightFoot: 'FootR',
  LeftUpLeg: 'UpperLegL',
  LeftLeg: 'LowerLegL',
  LeftFoot: 'FootL',
};

export function soldierBoneForTactical(name) {
  // GLTFLoader sanitizes the Mixamo colon (mixamorig:Hips_01 becomes
  // mixamorigHips_01). Support both the original glTF and loaded bone names.
  const stripped = name.replace(/^mixamorig:?/, '').replace(/_\d+$/, '');
  return SOURCE_BONES[stripped] ?? null;
}

function firstSkin(root) {
  let skin = null;
  root.traverse((node) => { if (!skin && node.isSkinnedMesh) skin = node; });
  return skin;
}

/**
 * The Sketchfab tactical armature has a -90 degree X axis conversion above
 * Hips, countered by an almost +90 degree X bind rotation on Hips itself.
 * SkeletonUtils copies the Soldier's *world* hip rotation and loses that
 * authored local correction, leaving the character horizontal. Calibrate one
 * offset against the standing Idle reference and apply it to every clip so
 * movement, crouch, jump and death retain their relative hip rotations.
 */
export function alignTacticalBindTracks(animations, bindRotations, minBones = 15) {
  const idle = animations.find(clip => clip.name === 'Idle');
  if (!idle) return false;
  const idleTracks = new Map(idle.tracks.map(track => [track.name, track]));
  const frame = new Quaternion();
  let calibrated = 0;
  for (const [boneName, bindQuaternion] of bindRotations) {
    const trackName = `.bones[${boneName}].quaternion`;
    const reference = idleTracks.get(trackName);
    if (!reference?.values || reference.values.length < 4) continue;
    // Align the first frame of the source idle to the tactical model's authored
    // neutral pose. Apply the same offset to every clip so relative motion stays.
    const sourceIdle = new Quaternion().fromArray(reference.values, 0);
    const correction = bindQuaternion.clone().multiply(sourceIdle.invert());
    for (const clip of animations) {
      const track = clip.tracks.find(t => t.name === trackName);
      if (!track) continue;
      for (let i = 0; i < track.values.length; i += 4) {
        frame.fromArray(track.values, i).premultiply(correction).normalize();
        frame.toArray(track.values, i);
      }
    }
    calibrated++;
  }
  return calibrated >= minBones; // full rigs require arms and legs, not only torso
}

export function alignTacticalHipTracks(animations, hipName, bindQuaternion) {
  return alignTacticalBindTracks(animations, new Map([[hipName, bindQuaternion]]), 1);
}

// The Quaternius Duck clip bends both legs, but opens the hands as if the
// character has put its gun away. Keep its lower-body motion and borrow the
// weapon-ready upper-body pose from Idle. All keys have already been retargeted
// and calibrated, so copying local quaternions cannot disturb Mixamo's bind.
const CROUCH_LOWER_BODY = /(?:Hips|LeftUpLeg|RightUpLeg|LeftLeg|RightLeg|LeftFoot|RightFoot)_/;

export function stabilizeTacticalCrouch(animations) {
  const duck = animations.find(clip => clip.name === 'Duck');
  const ready = animations.find(clip => clip.name === 'Idle');
  if (!duck || !ready) return false;

  const reference = new Map(ready.tracks.map(track => [track.name, track]));
  let replaced = 0;
  duck.tracks = duck.tracks.map(track => {
    if (!track.name.endsWith('.quaternion') || CROUCH_LOWER_BODY.test(track.name)) return track;
    const source = reference.get(track.name);
    if (!source || source.values.length < 4) return track;
    replaced++;
    return new QuaternionKeyframeTrack(track.name, [0, duck.duration], [
      ...source.values.slice(0, 4), ...source.values.slice(0, 4),
    ]);
  });
  return replaced >= 6; // torso + both arms must have a stable reference
}

// Networked hitboxes are 1.15m high while crouching. Source Duck has leg bend
// but no hip translation (retargeting intentionally strips root motion), so
// lower and slightly compress the *visual* model. Feet stay near the map floor;
// authoritative movement, damage and ray tests continue to use game physics.
export function updateTacticalCrouchVisual(character, crouched, dt) {
  if (!character?.tactical) return;
  const blend = Math.min(1, Math.max(0, dt) * 12);
  character.crouchVisual += ((crouched ? 1 : 0) - character.crouchVisual) * blend;
  const amount = character.crouchVisual;
  character.root.scale.y = character.baseScaleY * (1 - 0.12 * amount);
  character.root.position.y = character.baseRootY - 0.08 - 0.17 * amount;
}

/** Build the animation set, or return null so the playable legacy soldier is used. */
export function prepareTacticalCharacter(tactical, soldier) {
  if (!tactical?.scene || !soldier?.scene || !soldier.animations?.length) return null;
  const targetRoot = instantiate(tactical);
  const sourceRoot = instantiate(soldier);
  const target = firstSkin(targetRoot);
  const source = firstSkin(sourceRoot);
  if (!target?.skeleton || !source?.skeleton) return null;

  const hips = target.skeleton.bones.find(b => soldierBoneForTactical(b.name) === 'Hips');
  if (!hips) return null;
  // Capture the GLB's authored local hip transform before skeleton.pose():
  // glTF inverse-bind matrices can produce a different apparent rest rotation.
  const bindRotations = new Map(target.skeleton.bones.map(bone => [bone.name, bone.quaternion.clone()]));

  const animations = [];
  try {
    targetRoot.updateMatrixWorld(true);
    sourceRoot.updateMatrixWorld(true);
    for (const clip of soldier.animations) {
      source.skeleton.pose();
      target.skeleton.pose();
      const converted = retargetClip(target, source, clip, {
        fps: 20,
        // No root translation: network snapshots own world position and physics.
        hip: '__no_root_translation__',
        preserveBonePositions: true,
        getBoneName: (bone) => soldierBoneForTactical(bone.name),
      });
      const invalidTrack = converted.tracks.find((track) =>
        Array.from(track.values).some((value) => !Number.isFinite(value)));
      if (!converted.tracks.length || invalidTrack) {
        const index = invalidTrack ? Array.from(invalidTrack.values).findIndex((value) => !Number.isFinite(value)) : -1;
        throw new Error(`Invalid retargeted clip: ${clip.name}, duration=${clip.duration}, tracks=${converted.tracks.length}, invalid=${invalidTrack?.name ?? 'none'}@${index}`);
      }
      converted.name = clip.name;
      animations.push(converted);
    }
    if (!['Idle', 'Run', 'Walk', 'Death', 'Duck'].every((name) =>
      animations.some((clip) => clip.name === name))) return null;
    if (!alignTacticalBindTracks(animations, bindRotations)) return null;
    if (!stabilizeTacticalCrouch(animations)) return null;
    return { scene: tactical.scene, animations, tactical: true };
  } catch (error) {
    console.warn('[tactical] Retarget failed, using animated Soldier fallback:', error);
    return null;
  } finally {
    for (const root of [targetRoot, sourceRoot]) {
      root.traverse((node) => {
        if (!node.isMesh && !node.isSkinnedMesh) return;
        for (const mat of Array.isArray(node.material) ? node.material : [node.material]) mat.dispose();
      });
    }
  }
}
