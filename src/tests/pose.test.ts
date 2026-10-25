import { describe, it, expect } from 'vitest';
import {
  calculateHeadPose,
  calculateHeadPoseFromLandmarks,
  createPoseMatrix,
  extractRotationMatrix,
} from '../core/driver/pose';

describe('Head Pose Extraction & Euler Angles', () => {
  it('identifies identity matrix as zero pitch, yaw, roll', () => {
    const identity = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];
    const pose = calculateHeadPose(identity);
    expect(pose.pitch).toBeCloseTo(0, 4);
    expect(pose.yaw).toBeCloseTo(0, 4);
    expect(pose.roll).toBeCloseTo(0, 4);
  });

  it('correctly calculates pure 20 deg pitch down (+down)', () => {
    const mat = createPoseMatrix(20, 0, 0);
    const pose = calculateHeadPose(mat);
    expect(pose.pitch).toBeCloseTo(20, 2);
    expect(pose.yaw).toBeCloseTo(0, 2);
    expect(pose.roll).toBeCloseTo(0, 2);
  });

  it('correctly calculates pure 30 deg yaw right (+right)', () => {
    const mat = createPoseMatrix(0, 30, 0);
    const pose = calculateHeadPose(mat);
    expect(pose.pitch).toBeCloseTo(0, 2);
    expect(pose.yaw).toBeCloseTo(30, 2);
    expect(pose.roll).toBeCloseTo(0, 2);
  });

  it('correctly calculates pure 15 deg roll right (+right)', () => {
    const mat = createPoseMatrix(0, 0, 15);
    const pose = calculateHeadPose(mat);
    expect(pose.pitch).toBeCloseTo(0, 2);
    expect(pose.yaw).toBeCloseTo(0, 2);
    expect(pose.roll).toBeCloseTo(15, 2);
  });

  it('correctly validates sign conventions (negative pitch up, negative yaw left, negative roll left)', () => {
    const pitchUp = calculateHeadPose(createPoseMatrix(-15, 0, 0));
    expect(pitchUp.pitch).toBeCloseTo(-15, 2);

    const yawLeft = calculateHeadPose(createPoseMatrix(0, -25, 0));
    expect(yawLeft.yaw).toBeCloseTo(-25, 2);

    const rollLeft = calculateHeadPose(createPoseMatrix(0, 0, -10));
    expect(rollLeft.roll).toBeCloseTo(-10, 2);
  });

  it('handles 2D 4x4 matrix representation and 1D Float32Array', () => {
    const flat = createPoseMatrix(10, -12, 8);
    const float32 = new Float32Array(flat);
    const poseFloat = calculateHeadPose(float32);
    expect(poseFloat.pitch).toBeCloseTo(10, 2);
    expect(poseFloat.yaw).toBeCloseTo(-12, 2);
    expect(poseFloat.roll).toBeCloseTo(8, 2);

    const R = extractRotationMatrix(flat);
    const mat2D = [
      [R[0][0], R[0][1], R[0][2], 0],
      [R[1][0], R[1][1], R[1][2], 0],
      [R[2][0], R[2][1], R[2][2], 0],
      [0, 0, 0, 1],
    ];
    const pose2D = calculateHeadPose(mat2D);
    expect(pose2D.pitch).toBeCloseTo(10, 2);
    expect(pose2D.yaw).toBeCloseTo(-12, 2);
    expect(pose2D.roll).toBeCloseTo(8, 2);
  });

  it('calculates head pose from 2D/3D landmarks as a fallback', () => {
    // Generate synthetic 478 landmarks
    const lms = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));

    // Neutral face setup
    lms[1] = { x: 0.5, y: 0.5, z: 0 };    // Nose
    lms[263] = { x: 0.6, y: 0.45, z: 0 }; // Left eye
    lms[33] = { x: 0.4, y: 0.45, z: 0 };  // Right eye
    lms[152] = { x: 0.5, y: 0.7, z: 0 };  // Chin
    lms[10] = { x: 0.5, y: 0.2, z: 0 };   // Forehead

    const neutral = calculateHeadPoseFromLandmarks(lms);
    expect(neutral.yaw).toBeCloseTo(0, 1);

    // Turned right: nose shifts towards left eye (in image coords: x increases)
    lms[1] = { x: 0.56, y: 0.5, z: 0 };
    const turnedRight = calculateHeadPoseFromLandmarks(lms);
    expect(turnedRight.yaw).toBeGreaterThan(20);

    // Turned left: nose shifts towards right eye (in image coords: x decreases)
    lms[1] = { x: 0.44, y: 0.5, z: 0 };
    const turnedLeft = calculateHeadPoseFromLandmarks(lms);
    expect(turnedLeft.yaw).toBeLessThan(-20);
  });
});
