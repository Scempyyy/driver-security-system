/**
 * Driver Feature Extractor.
 *
 * Integrates EAR, MAR, Gaze, Head Pose, PERCLOS, and Blink tracking
 * into the complete DriverFeatures contract defined in `src/core/types.ts`.
 *
 * Features:
 * - EAR smoothing over recent frames to prevent momentary flickers from triggering closures.
 * - Continuous eye closure tracking (ordinary blinks under 0.5s are ignored).
 * - Slow blink tracking (duration >= 0.4s).
 * - Head Yaw smoothing and HEAD-YAW-ONLY off-road attention detection (ignoring iris for alerts;
 *   ignoring glances shorter than 1.5s for mirror checks).
 * - Yawn confirmation: mouth open continuously >= 1.5s; tracks rolling yawn timestamps.
 */

import { DriverFeatures, PersonalBaseline } from '../types';
import { CONFIG, DEFAULT_BASELINE_PROFILE } from '../config';
import { calculateEAR, Point2D } from './ear';
import { calculateMAR } from './mar';
import { calculateHeadPose, HeadPose, MatrixInput } from './pose';
import { PerclosTracker } from './perclos';
import { BlinkTracker } from './blink';

export interface RawLandmarkData {
  landmarks?: Point2D[];
  matrix?: MatrixInput;
  timestampMs?: number;
}

export class FeatureExtractor {
  private perclosTracker: PerclosTracker;
  private blinkTracker: BlinkTracker;

  // Smoothing buffers
  private earBuffer: number[] = [];
  private yawBuffer: number[] = [];

  // Continuous state tracking
  private closureStartMs: number | null = null;
  private eyesOffRoadStartMs: number | null = null;
  private yawnStartMs: number | null = null;
  private yawnTimestamps: number[] = [];

  private baseline: PersonalBaseline;

  constructor(baseline: PersonalBaseline = DEFAULT_BASELINE_PROFILE) {
    this.baseline = baseline;
    this.perclosTracker = new PerclosTracker(CONFIG.perclos.defaultWindowSec);
    this.blinkTracker = new BlinkTracker({
      windowSec: CONFIG.driver.slowBlinkWindowSec,
      slowBlinkDurationSec: CONFIG.driver.slowBlinkDurationSec,
    });
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
    this.yawnTimestamps = [];
    this.earBuffer = [];
    this.yawBuffer = [];
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
      this.earBuffer = [];
      this.yawBuffer = [];

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
        slowBlinks60s: 0,
        recentYawnCount: 0,
      };
    }

    const landmarks = data.landmarks;

    // 1. EAR Calculation & Smoothing over frames
    const { ear: rawEar } = calculateEAR(landmarks);
    this.earBuffer.push(rawEar);
    if (this.earBuffer.length > CONFIG.driver.earSmoothingFrames) {
      this.earBuffer.shift();
    }
    const ear = this.earBuffer.reduce((a, b) => a + b, 0) / this.earBuffer.length;

    const earThreshold = this.baseline.earThreshold ?? CONFIG.driver.earFallbackThreshold;
    // Eyes are closed when smoothed EAR is below threshold AND raw instantaneous EAR is not distinctly open
    const isClosed = ear < earThreshold && rawEar < earThreshold;

    // Continuous eye closure duration (ordinary blinks under 0.5s are ignored completely)
    if (isClosed) {
      if (this.closureStartMs === null) {
        this.closureStartMs = t;
      }
    } else {
      this.closureStartMs = null;
      // If eyes have clearly reopened, reset earBuffer to instant rawEar to prevent lag
      if (rawEar >= earThreshold) {
        this.earBuffer = [rawEar];
      }
    }
    const longClosureSec = this.closureStartMs !== null ? Math.max(0, (t - this.closureStartMs) / 1000) : 0;

    // 2. PERCLOS & Blink Rate (with slow blink tracking)
    const perclos60 = this.perclosTracker.addSample(t, isClosed);
    const blinkRate = this.blinkTracker.update(t, isClosed);
    const slowBlinks60s = this.blinkTracker.getSlowBlinkCount(t);

    // 3. MAR & Yawn Detection (continuous >= 1.5s)
    const mar = calculateMAR(landmarks);
    const isMouthOpen = mar >= CONFIG.driver.marYawnThreshold;

    let yawning = false;
    if (isMouthOpen) {
      if (this.yawnStartMs === null) {
        this.yawnStartMs = t;
      }
      const yawnDurationSec = (t - this.yawnStartMs) / 1000;
      yawning = yawnDurationSec >= CONFIG.driver.yawnMinDurationSec;
    } else {
      if (this.yawnStartMs !== null) {
        const completedDuration = (t - this.yawnStartMs) / 1000;
        if (completedDuration >= CONFIG.driver.yawnMinDurationSec) {
          this.yawnTimestamps.push(t);
        }
      }
      this.yawnStartMs = null;
      yawning = false;
    }

    // Prune yawn timestamps within active window
    const yawnWindowSec =
      this.baseline.mode === 'demo_15s'
        ? CONFIG.driver.yawnWindowDemoSec
        : CONFIG.driver.yawnWindowFullSec;
    const yawnCutoff = t - yawnWindowSec * 1000;
    while (this.yawnTimestamps.length > 0 && this.yawnTimestamps[0] < yawnCutoff) {
      this.yawnTimestamps.shift();
    }
    const recentYawnCount = this.yawnTimestamps.length;

    // 4. Head Pose Extraction & Smoothing
    let headPose: HeadPose = { pitch: 0, yaw: 0, roll: 0 };
    if (data.matrix) {
      try {
        headPose = calculateHeadPose(data.matrix);
      } catch {
        // Fallback to 0 if matrix malformed
      }
    }

    // Smooth head yaw over frames
    this.yawBuffer.push(headPose.yaw);
    if (this.yawBuffer.length > CONFIG.driver.headYawSmoothingFrames) {
      this.yawBuffer.shift();
    }
    const smoothedYaw = this.yawBuffer.reduce((a, b) => a + b, 0) / this.yawBuffer.length;

    // Adjust for personal neutral offsets recorded during calibration
    const adjustedPitch = headPose.pitch - (this.baseline.headPitchOffset || 0);
    const adjustedYaw = smoothedYaw - (this.baseline.headYawOffset || 0);
    const adjustedRoll = headPose.roll;

    // 5. Eyes Off Road: HEAD YAW ONLY!
    // Ignore iris/eye direction for this alert (glances < 1.5s ignored for mirror checks)
    const isYawOff = Math.abs(adjustedYaw) > CONFIG.driver.headYawOffRoadDeg;
    if (isYawOff) {
      if (this.eyesOffRoadStartMs === null) {
        this.eyesOffRoadStartMs = t;
      }
      const rawAwaySec = (t - this.eyesOffRoadStartMs) / 1000;
      // Mirror checks (< 1.5s) are ignored
      var eyesOffRoadSec = rawAwaySec >= CONFIG.driver.glanceIgnoreSec ? rawAwaySec : 0.0;
    } else {
      this.eyesOffRoadStartMs = null;
      var eyesOffRoadSec = 0.0;
    }

    // 6. Face Quality heuristic
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
      slowBlinks60s,
      recentYawnCount,
    };
  }
}
