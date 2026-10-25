import { describe, it, expect, beforeEach } from 'vitest';
import { calculateEAR, calculateSingleEyeEAR, LEFT_EYE_INDICES } from '../core/driver/ear';
import { calculateMAR } from '../core/driver/mar';
import { calculateGaze, GAZE_LANDMARKS } from '../core/driver/gaze';
import { PerclosTracker } from '../core/driver/perclos';
import { BlinkTracker } from '../core/driver/blink';
import { FeatureExtractor } from '../core/driver/featureExtractor';
import { createPoseMatrix } from '../core/driver/pose';
import { DEFAULT_BASELINE_PROFILE } from '../core/config';

describe('Driver Vision Module - Formulas, Timing & Features', () => {
  // Helper to make blank 478 landmarks
  const createMockLandmarks = (count = 478) => {
    return Array.from({ length: count }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  };

  describe('1. EAR Calculation (12-landmark techfestthing/ formula)', () => {
    it('returns 0.0 for empty landmarks', () => {
      expect(calculateEAR([]).ear).toBe(0.0);
    });

    it('calculates correct EAR for known synthetic eye geometry', () => {
      const lms = createMockLandmarks(478);
      // Setup Left Eye: [362, 385, 387, 263, 373, 380]
      // p1 (362): inner corner (10, 20)
      // p4 (263): outer corner (30, 20) -> horizontal width = 20
      // p2 (385): top 1 (15, 17), p6 (380): bot 1 (15, 23) -> v1 = 6
      // p3 (387): top 2 (25, 17), p5 (373): bot 2 (25, 23) -> v2 = 6
      // Expected EAR = (6 + 6) / (2 * 20) = 12 / 40 = 0.30 (standard open eye)
      lms[362] = { x: 10, y: 20, z: 0 };
      lms[263] = { x: 30, y: 20, z: 0 };
      lms[385] = { x: 15, y: 17, z: 0 };
      lms[380] = { x: 15, y: 23, z: 0 };
      lms[387] = { x: 25, y: 17, z: 0 };
      lms[373] = { x: 25, y: 23, z: 0 };

      const leftEar = calculateSingleEyeEAR(lms, LEFT_EYE_INDICES);
      expect(leftEar).toBeCloseTo(0.30, 4);

      // Closed eye: v1 = 0, v2 = 0 -> EAR = 0
      lms[385] = { x: 15, y: 20, z: 0 };
      lms[380] = { x: 15, y: 20, z: 0 };
      lms[387] = { x: 25, y: 20, z: 0 };
      lms[373] = { x: 25, y: 20, z: 0 };
      const closedEar = calculateSingleEyeEAR(lms, LEFT_EYE_INDICES);
      expect(closedEar).toBeCloseTo(0.0, 4);
    });

    it('calculates average EAR for both eyes', () => {
      const lms = createMockLandmarks(478);
      // Both open at 0.30
      // Left
      lms[362] = { x: 10, y: 20, z: 0 };
      lms[263] = { x: 30, y: 20, z: 0 };
      lms[385] = { x: 15, y: 17, z: 0 };
      lms[380] = { x: 15, y: 23, z: 0 };
      lms[387] = { x: 25, y: 17, z: 0 };
      lms[373] = { x: 25, y: 23, z: 0 };
      // Right: [33, 160, 158, 133, 153, 144]
      // p1: 33, p4: 133, p2: 160, p6: 144, p3: 158, p5: 153
      lms[33] = { x: 40, y: 20, z: 0 };
      lms[133] = { x: 60, y: 20, z: 0 };
      lms[160] = { x: 45, y: 17, z: 0 };
      lms[144] = { x: 45, y: 23, z: 0 };
      lms[158] = { x: 55, y: 17, z: 0 };
      lms[153] = { x: 55, y: 23, z: 0 };

      const { ear, leftEar, rightEar } = calculateEAR(lms);
      expect(leftEar).toBeCloseTo(0.30, 4);
      expect(rightEar).toBeCloseTo(0.30, 4);
      expect(ear).toBeCloseTo(0.30, 4);
    });
  });

  describe('2. MAR Calculation (8-landmark techfestthing/ formula)', () => {
    it('calculates normal closed mouth and open yawning MAR', () => {
      const lms = createMockLandmarks(478);
      // MOUTH_INDICES: [61, 291, 39, 181, 0, 17, 269, 405]
      // Horizontal corners: 61 (p0), 291 (p1) -> width = 40 (x=20 to x=60)
      lms[61] = { x: 20, y: 50, z: 0 };
      lms[291] = { x: 60, y: 50, z: 0 };

      // Vertical 1: p2 (39) to p6 (269) -> dist = 8
      // Vertical 2: p3 (181) to p7 (405) -> dist = 8
      // Normal closed mouth: (8 + 8) / (2 * 40) = 16 / 80 = 0.20
      lms[39] = { x: 35, y: 46, z: 0 };
      lms[269] = { x: 35, y: 54, z: 0 };
      lms[181] = { x: 45, y: 46, z: 0 };
      lms[405] = { x: 45, y: 54, z: 0 };

      const normalMar = calculateMAR(lms);
      expect(normalMar).toBeCloseTo(0.20, 4);

      // Yawning wide open mouth: vertical dist = 30 each
      // (30 + 30) / (2 * 40) = 60 / 80 = 0.75
      lms[39] = { x: 35, y: 35, z: 0 };
      lms[269] = { x: 35, y: 65, z: 0 };
      lms[181] = { x: 45, y: 35, z: 0 };
      lms[405] = { x: 45, y: 65, z: 0 };

      const yawnMar = calculateMAR(lms);
      expect(yawnMar).toBeCloseTo(0.75, 4);
    });
  });

  describe('3. Gaze & Iris Deviation', () => {
    it('detects straight ahead gaze vs deviated gaze', () => {
      const lms = createMockLandmarks(478);
      // Left eye: inner 362 (x=10), outer 263 (x=30) -> center = 20, width = 20
      lms[362] = { x: 10, y: 20, z: 0 };
      lms[263] = { x: 30, y: 20, z: 0 };
      // Iris [469, 470, 471, 472] centered at x=20
      for (const idx of GAZE_LANDMARKS.LEFT_IRIS) {
        lms[idx] = { x: 20, y: 20, z: 0 };
      }

      // Right eye: inner 133 (x=40), outer 33 (x=60) -> center = 50, width = 20
      lms[133] = { x: 40, y: 20, z: 0 };
      lms[33] = { x: 60, y: 20, z: 0 };
      // Iris [474, 475, 476, 477] centered at x=50
      for (const idx of GAZE_LANDMARKS.RIGHT_IRIS) {
        lms[idx] = { x: 50, y: 20, z: 0 };
      }

      const straightGaze = calculateGaze(lms);
      expect(straightGaze.meanDeviation).toBeCloseTo(0.0, 4);
      expect(straightGaze.lookingAway).toBe(false);

      // Shift both irises far right: +8 units -> ratio = 8 / 20 = 0.40 (> 0.35 threshold)
      for (const idx of GAZE_LANDMARKS.LEFT_IRIS) {
        lms[idx] = { x: 28, y: 20, z: 0 };
      }
      for (const idx of GAZE_LANDMARKS.RIGHT_IRIS) {
        lms[idx] = { x: 58, y: 20, z: 0 };
      }

      const shiftedGaze = calculateGaze(lms);
      expect(shiftedGaze.meanDeviation).toBeCloseTo(0.40, 3);
      expect(shiftedGaze.lookingAway).toBe(true);
    });
  });

  describe('4. PERCLOS Rolling Window Calculator', () => {
    it('accurately integrates eye closures over sliding time window', () => {
      const tracker = new PerclosTracker(10); // 10 second window for test
      let t = 1000;

      // 0 to 5s: eyes open
      for (let i = 0; i < 5; i++) {
        tracker.addSample(t, false);
        t += 1000;
      }
      expect(tracker.calculate()).toBe(0.0);

      // 5s to 10s: eyes closed (5 seconds closed out of 9s span = ~55%)
      for (let i = 0; i < 5; i++) {
        tracker.addSample(t, true);
        t += 1000;
      }
      const p = tracker.calculate();
      expect(p).toBeGreaterThanOrEqual(0.40);
      expect(p).toBeLessThanOrEqual(0.60);

      // Shift forward by 15s with eyes open -> window slides past closed period
      for (let i = 0; i < 12; i++) {
        tracker.addSample(t, false);
        t += 1000;
      }
      expect(tracker.calculate()).toBe(0.0);
    });
  });

  describe('5. Blink Rate Tracker', () => {
    it('detects leading-edge closures and computes BPM within realistic ranges', () => {
      const tracker = new BlinkTracker({ windowSec: 60, minBlinkDurationMs: 50, maxBlinkDurationMs: 500 });
      let t = 0;

      // Simulate 10 standard blinks (each 200 ms duration) spaced across 60 seconds
      for (let b = 0; b < 10; b++) {
        t += 5000; // interval
        tracker.update(t, true); // leading edge
        t += 200; // 200ms blink closure
        tracker.update(t, false); // reopened
      }

      const bpm = tracker.calculateBlinkRate(t);
      expect(bpm).toBe(10);
    });

    it('ignores prolonged microsleep closures from blink count', () => {
      const tracker = new BlinkTracker({ windowSec: 60, maxBlinkDurationMs: 500 });
      let t = 1000;

      // Prolonged closure of 2500 ms (microsleep, not a saccadic blink)
      tracker.update(t, true);
      t += 2500;
      tracker.update(t, false);

      expect(tracker.calculateBlinkRate(t)).toBe(0);
    });
  });

  describe('6. FeatureExtractor Integration', () => {
    let extractor: FeatureExtractor;

    beforeEach(() => {
      extractor = new FeatureExtractor(DEFAULT_BASELINE_PROFILE);
    });

    it('handles null / empty landmarks gracefully with zero quality', () => {
      const features = extractor.extract({ landmarks: [] }, 1000);
      expect(features.faceDetected).toBe(false);
      expect(features.quality).toBe(0.0);
      expect(features.ear).toBe(0.0);
      expect(features.longClosureSec).toBe(0.0);
    });

    it('tracks continuous longClosureSec correctly', () => {
      const lms = createMockLandmarks(478);
      // Set eyes closed: EAR = 0 < 0.21 fallback threshold
      let t = 1000;
      extractor.extract({ landmarks: lms, timestampMs: t }, t);

      t += 1500; // 1.5 seconds later
      const f2 = extractor.extract({ landmarks: lms, timestampMs: t }, t);
      expect(f2.longClosureSec).toBeCloseTo(1.5, 1);

      // Reopen eyes
      // Set left & right eye open to EAR ~ 0.30
      lms[362] = { x: 10, y: 20, z: 0 };
      lms[263] = { x: 30, y: 20, z: 0 };
      lms[385] = { x: 15, y: 17, z: 0 };
      lms[380] = { x: 15, y: 23, z: 0 };
      lms[387] = { x: 25, y: 17, z: 0 };
      lms[373] = { x: 25, y: 23, z: 0 };

      lms[33] = { x: 40, y: 20, z: 0 };
      lms[133] = { x: 60, y: 20, z: 0 };
      lms[160] = { x: 45, y: 17, z: 0 };
      lms[144] = { x: 45, y: 23, z: 0 };
      lms[158] = { x: 55, y: 17, z: 0 };
      lms[153] = { x: 55, y: 23, z: 0 };

      t += 200;
      const f3 = extractor.extract({ landmarks: lms, timestampMs: t }, t);
      expect(f3.longClosureSec).toBe(0.0);
    });

    it('detects sustained yawning and head orientation angles', () => {
      const lms = createMockLandmarks(478);
      // Yawning mouth setup
      lms[61] = { x: 20, y: 50, z: 0 };
      lms[291] = { x: 60, y: 50, z: 0 };
      lms[39] = { x: 35, y: 35, z: 0 };
      lms[269] = { x: 35, y: 65, z: 0 };
      lms[181] = { x: 45, y: 35, z: 0 };
      lms[405] = { x: 45, y: 65, z: 0 };

      const matrix = createPoseMatrix(18, -28, 5); // 18 deg pitch down, 28 deg yaw left

      let t = 1000;
      const f1 = extractor.extract({ landmarks: lms, matrix, timestampMs: t }, t);
      expect(f1.mar).toBeGreaterThan(0.60);
      expect(f1.yawning).toBe(false); // Not yet reached yawnMinDurationSec (1.5s)
      expect(f1.headPitch).toBeCloseTo(18, 1);
      expect(f1.headYaw).toBeCloseTo(-28, 1);

      // 1.6s later of sustained opening
      t += 1600;
      const f2 = extractor.extract({ landmarks: lms, matrix, timestampMs: t }, t);
      expect(f2.yawning).toBe(true);
      expect(f2.eyesOffRoadSec).toBeCloseTo(1.6, 1); // yaw > 25 deg counts as off road
    });
  });
});
