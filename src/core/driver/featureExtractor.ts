/**
 * Driver Feature Extractor.
 *
 * Integrates EAR, MAR, Gaze, Head Pose, PERCLOS, and Blink tracking
 * into the complete DriverFeatures contract defined in `src/core/types.ts`.
 *
 * Maintains continuous wall-clock tracking of:
 * - `longClosureSec`: continuous duration eyes have remained closed
 * - `eyesOffRoadSec`: continuous duration head/gaze is turned away from road
 * - `yawning`: true if mouth aspect ratio exceeds threshold for min duration
 * - `quality`: estimated face tracking confidence (0.0 to 1.0)
 */

import { DriverFeatures, PersonalBaseline } from '../types';
import { CONFIG, DEFAULT_BASELINE_PROFILE } from '../config';
import { calculateEAR, Point2D } from './ear';
import { calculateMAR } from './mar';
import { calculateGaze } from './gaze';
import { calculateHeadPose, HeadPose } from './pose';
import { PerclosTracker } from './perclos';
import { BlinkTracker } from './blink';

export interface RawLandmarkData {
  landmarks?: Point2D[];
  matrix?: number[] | Float32Array | number[][];
  timestampMs?: number;
}

export class FeatureExtractor {
  private perclosTracker: PerclosTracker;
  private blinkTracker: BlinkTracker;

  // Continuous state tracking
  private closureStartMs: number | null = null;
  private eyesOffRoadStartMs: number | null = null;
  private yawnStartMs: number | null = null;

  private baseline: PersonalBaseline;

  constructor(baseline: PersonalBaseline = DEFAULT_BASELINE_PROFILE) {
    this.baseline = baseline;
    this.perclosTracker = new PerclosTracker(CONFIG.perclos.defaultWindowSec);
    this.blinkTracker = new BlinkTracker({ windowSec: 60 });
  }

  public updateBaseline(baseline: PersonalBaseline): void {
    this.baseline = baseline;
  }

  public setPerclosWindow(windowSec: number): void {
    this.perclosTracker.setWindowDuration(windowSec);
  }

  public reset(): void {
    this.closureStartMs = null;
    this.eyesOffRoadStartMs = null;
    this.yawnStartMs = null;
    this.perclosTracker.reset();
    this.blinkTracker.reset();
  }

  /**
   * Processes a video frame landmark result and returns a complete DriverFeatures object.
   */
  public extract(data: RawLandmarkData, nowMs = Date.now()): DriverFeatures {
    const t = data.timestampMs ?? nowMs;

    if (!data.landmarks || data.landmarks.length < 468) {
      // Face lost or insufficient landmarks
      this.closureStartMs = null;
      this.eyesOffRoadStartMs = null;
      this.yawnStartMs = null;

      return {
        t,
        faceDetected: false,
        quality: 0.0,
        ear: 0.0,
        perclos60: 0.0,
        blinkRate: 0.0,
        longClosureSec: 0.0,
        mar: 0.0,
        yawning: false,
        headPitch: 0.0,
        headYaw: 0.0,
        headRoll: 0.0,
        eyesOffRoadSec: 0.0,
      };
    }

    const landmarks = data.landmarks;

    // 1. EAR
    const { ear } = calculateEAR(landmarks);
    const earThreshold = this.baseline.earThreshold ?? CONFIG.driver.earFallbackThreshold;
    const isClosed = ear < earThreshold;

    // Continuous eye closure duration
    if (isClosed) {
      if (this.closureStartMs === null) {
        this.closureStartMs = t;
      }
    } else {
      this.closureStartMs = null;
    }
    const longClosureSec = this.closureStartMs !== null ? Math.max(0, (t - this.closureStartMs) / 1000) : 0;

    // 2. PERCLOS & Blink Rate
    const perclos60 = this.perclosTracker.addSample(t, isClosed);
    const blinkRate = this.blinkTracker.update(t, isClosed);

    // 3. MAR & Yawn Detection
    const mar = calculateMAR(landmarks);
    const isMouthOpen = mar >= CONFIG.driver.marYawnThreshold;

    if (isMouthOpen) {
      if (this.yawnStartMs === null) {
        this.yawnStartMs = t;
      }
    } else {
      this.yawnStartMs = null;
    }
    const yawnDurationSec = this.yawnStartMs !== null ? (t - this.yawnStartMs) / 1000 : 0;
    const yawning = yawnDurationSec >= CONFIG.driver.yawnMinDurationSec;

    // 4. Head Pose
    let headPose: HeadPose = { pitch: 0, yaw: 0, roll: 0 };
    if (data.matrix) {
      try {
        headPose = calculateHeadPose(data.matrix);
      } catch {
        // Fallback to 0 if matrix malformed
      }
    }

    // Adjust for personal neutral offsets
    const adjustedPitch = headPose.pitch - (this.baseline.headPitchOffset || 0);
    const adjustedYaw = headPose.yaw - (this.baseline.headYawOffset || 0);
    const adjustedRoll = headPose.roll;

    // 5. Gaze / Eyes Off Road
    const gaze = calculateGaze(landmarks);
    const isYawOff = Math.abs(adjustedYaw) > CONFIG.driver.eyesOffRoadYawDeg;
    const isPitchUpOff = adjustedPitch < CONFIG.driver.eyesOffRoadPitchUpDeg;
    const isGazeOff = gaze.lookingAway;

    const isDistracted = isYawOff || isPitchUpOff || isGazeOff;
    if (isDistracted) {
      if (this.eyesOffRoadStartMs === null) {
        this.eyesOffRoadStartMs = t;
      }
    } else {
      this.eyesOffRoadStartMs = null;
    }
    const eyesOffRoadSec = this.eyesOffRoadStartMs !== null ? Math.max(0, (t - this.eyesOffRoadStartMs) / 1000) : 0;

    // 6. Face Quality heuristic
    // Based on landmark presence, iris visibility, and extreme poses
    let quality = 0.95;
    if (landmarks.length < 478) quality -= 0.15; // Missing iris landmarks
    if (Math.abs(adjustedYaw) > 45 || Math.abs(adjustedPitch) > 35) quality -= 0.3; // Extreme angles reduce fidelity
    if (ear <= 0.05 && !isClosed) quality -= 0.2; // Unrealistic geometry
    quality = Math.max(0.1, Math.min(1.0, quality));

    return {
      t,
      faceDetected: true,
      quality,
      ear: Math.round(ear * 1000) / 1000,
      perclos60: Math.round(perclos60 * 1000) / 1000,
      blinkRate,
      longClosureSec: Math.round(longClosureSec * 10) / 10,
      mar: Math.round(mar * 1000) / 1000,
      yawning,
      headPitch: Math.round(adjustedPitch * 10) / 10,
      headYaw: Math.round(adjustedYaw * 10) / 10,
      headRoll: Math.round(adjustedRoll * 10) / 10,
      eyesOffRoadSec: Math.round(eyesOffRoadSec * 10) / 10,
    };
  }
}
