/**
 * NeuroDrive AI - Personal Baseline & Calibration Engine
 * 
 * Implements calibration wizard logic (15 s demo mode and 60 s full mode),
 * accumulates facial and vehicle baseline samples, derives safety-clamped thresholds,
 * performs bounded online adaptation with safety floors, and manages storage serialization.
 * 
 * Pure TypeScript with zero DOM/browser dependencies.
 */

import { CONFIG, DEFAULT_BASELINE_PROFILE } from '../config';
import { CalibrationMode, PersonalBaseline } from '../types';

export interface CalibrationSample {
  ear: number;
  mar: number;
  headPitch: number;
  headYaw: number;
  quality?: number;
  vibrationRms?: number;
  audioRms?: number;
  blinkRate?: number;
  timestamp?: number;
}

export interface CalibrationSession {
  id: string;
  mode: CalibrationMode;
  targetDurationSec: number;
  startTime: number;
  lastSampleTime: number;
  samples: CalibrationSample[];
  isComplete: boolean;
  result: PersonalBaseline | null;
}

export interface CalibrationProgress {
  progress: number;       // 0.0 to 1.0
  elapsedSec: number;
  sampleCount: number;
  isComplete: boolean;
  session: CalibrationSession;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

/**
 * Derives the EAR closure threshold from an open-eye baseline,
 * clamped strictly within safety boundaries [minEarThreshold, maxEarThreshold].
 */
export function deriveEarThreshold(openEarBaseline: number): number {
  const rawThreshold = openEarBaseline * CONFIG.calibration.earMultiplier;
  return Math.min(
    CONFIG.calibration.maxEarThreshold,
    Math.max(CONFIG.calibration.minEarThreshold, rawThreshold)
  );
}

/**
 * Initializes a new calibration session for 15s demo or 60s full mode.
 */
export function createCalibrationSession(
  mode: CalibrationMode = 'demo_15s',
  startTime: number = Date.now()
): CalibrationSession {
  const targetDurationSec = mode === 'demo_15s'
    ? CONFIG.calibration.demoDurationSec
    : CONFIG.calibration.fullDurationSec;

  return {
    id: `calib_${startTime}`,
    mode,
    targetDurationSec,
    startTime,
    lastSampleTime: startTime,
    samples: [],
    isComplete: false,
    result: null,
  };
}

/**
 * Appends a calibration sample if quality criteria are met.
 * Automatically completes when elapsed duration reaches targetDurationSec.
 */
export function addCalibrationSample(
  session: CalibrationSession,
  sample: CalibrationSample,
  currentTime: number = Date.now()
): CalibrationProgress {
  if (session.isComplete && session.result) {
    return {
      progress: 1.0,
      elapsedSec: session.targetDurationSec,
      sampleCount: session.samples.length,
      isComplete: true,
      session,
    };
  }

  // Filter out low quality samples (< minQualityConfidence)
  const quality = sample.quality ?? 1.0;
  if (quality >= CONFIG.driver.minQualityConfidence && sample.ear > 0.10) {
    session.samples.push({
      ...sample,
      timestamp: sample.timestamp ?? currentTime,
    });
  }

  session.lastSampleTime = currentTime;
  const elapsedSec = Math.max(0, (currentTime - session.startTime) / 1000);
  const progress = Math.min(1.0, elapsedSec / session.targetDurationSec);

  if (elapsedSec >= session.targetDurationSec) {
    session.isComplete = true;
    session.result = finalizeCalibration(session, currentTime);
    return {
      progress: 1.0,
      elapsedSec,
      sampleCount: session.samples.length,
      isComplete: true,
      session,
    };
  }

  return {
    progress,
    elapsedSec,
    sampleCount: session.samples.length,
    isComplete: false,
    session,
  };
}

/**
 * Computes mean of numeric array with fallback
 */
function calculateMean(values: number[], fallback: number): number {
  if (values.length === 0) return fallback;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return sum / values.length;
}

/**
 * Finalizes the calibration session and derives a PersonalBaseline profile.
 */
export function finalizeCalibration(
  session: CalibrationSession,
  finishTime: number = Date.now()
): PersonalBaseline {
  if (session.samples.length === 0) {
    return {
      ...DEFAULT_BASELINE_PROFILE,
      id: `fallback_${finishTime}`,
      calibratedAt: finishTime,
      mode: session.mode,
      isComplete: false,
    };
  }

  const earValues = session.samples.map(s => s.ear);
  const marValues = session.samples.map(s => s.mar);
  const pitchValues = session.samples.map(s => s.headPitch);
  const yawValues = session.samples.map(s => s.headYaw);
  const blinkValues = session.samples.map(s => s.blinkRate).filter((b): b is number => b !== undefined && b > 0);
  const vibrationValues = session.samples.map(s => s.vibrationRms).filter((v): v is number => v !== undefined);
  const audioValues = session.samples.map(s => s.audioRms).filter((a): a is number => a !== undefined);

  const earOpenBaseline = calculateMean(earValues, DEFAULT_BASELINE_PROFILE.earOpenBaseline);
  const earThreshold = deriveEarThreshold(earOpenBaseline);
  const marClosedBaseline = calculateMean(marValues, DEFAULT_BASELINE_PROFILE.marClosedBaseline);
  const headPitchOffset = calculateMean(pitchValues, DEFAULT_BASELINE_PROFILE.headPitchOffset);
  const headYawOffset = calculateMean(yawValues, DEFAULT_BASELINE_PROFILE.headYawOffset);
  const normalBlinkRate = calculateMean(blinkValues, DEFAULT_BASELINE_PROFILE.normalBlinkRate);
  const vibrationBaselineRms = calculateMean(vibrationValues, DEFAULT_BASELINE_PROFILE.vibrationBaselineRms);
  const audioBaselineRms = calculateMean(audioValues, DEFAULT_BASELINE_PROFILE.audioBaselineRms);

  return {
    id: `profile_${finishTime}`,
    calibratedAt: finishTime,
    mode: session.mode,
    earOpenBaseline,
    earThreshold,
    marClosedBaseline,
    headPitchOffset,
    headYawOffset,
    normalBlinkRate: Math.round(normalBlinkRate),
    vibrationBaselineRms,
    audioBaselineRms,
    isComplete: true,
  };
}

/**
 * Bounded online adaptation:
 * Slowly adapts the baseline profile over time (e.g. slight lighting or posture shifts)
 * while strictly preserving safety floors so a chronically tired driver's baseline
 * cannot drift into masking dangerous fatigue.
 */
export function adaptBaseline(
  currentBaseline: PersonalBaseline,
  sample: CalibrationSample,
  adaptationRate: number = 0.005
): PersonalBaseline {
  const quality = sample.quality ?? 1.0;
  // Only adapt during attentive, nominal conditions with high quality face detection
  if (
    quality < CONFIG.driver.minQualityConfidence ||
    sample.ear <= currentBaseline.earThreshold ||
    sample.mar >= CONFIG.driver.marYawnThreshold
  ) {
    return currentBaseline;
  }

  // Smooth exponential moving average update
  const rawUpdatedEar = currentBaseline.earOpenBaseline * (1 - adaptationRate) + sample.ear * adaptationRate;

  // Absolute safety floor: open ear baseline cannot drift below min threshold / multiplier
  const minSafeOpenEar = CONFIG.calibration.minEarThreshold / CONFIG.calibration.earMultiplier;
  const safeOpenEar = Math.max(minSafeOpenEar, rawUpdatedEar);

  const safeEarThreshold = deriveEarThreshold(safeOpenEar);

  // Smooth neutral head pose drift
  const safePitchOffset = currentBaseline.headPitchOffset * (1 - adaptationRate) + sample.headPitch * adaptationRate;
  const safeYawOffset = currentBaseline.headYawOffset * (1 - adaptationRate) + sample.headYaw * adaptationRate;

  return {
    ...currentBaseline,
    earOpenBaseline: safeOpenEar,
    earThreshold: safeEarThreshold,
    headPitchOffset: safePitchOffset,
    headYawOffset: safeYawOffset,
  };
}

/**
 * Evaluates bounded EAR deviation with safety floor protection.
 * Ensures that even if a driver's baseline is unusually low, any EAR below
 * CONFIG.calibration.minEarThreshold or earFallbackThreshold is flagged as closed.
 */
export function computeBoundedEarDeviation(
  currentEar: number,
  baseline: PersonalBaseline
): {
  isClosed: boolean;
  deviationScore: number;
  safetyFloorApplied: boolean;
} {
  // Absolute safety floor check
  if (currentEar <= CONFIG.calibration.minEarThreshold) {
    return {
      isClosed: true,
      deviationScore: 1.0,
      safetyFloorApplied: true,
    };
  }

  const effectiveThreshold = Math.max(baseline.earThreshold, CONFIG.calibration.minEarThreshold);
  const isClosed = currentEar < effectiveThreshold;

  if (currentEar >= baseline.earOpenBaseline) {
    return {
      isClosed: false,
      deviationScore: 0.0,
      safetyFloorApplied: false,
    };
  }

  const denominator = Math.max(0.01, baseline.earOpenBaseline - effectiveThreshold);
  const deviation = Math.min(1.0, Math.max(0.0, (baseline.earOpenBaseline - currentEar) / denominator));

  return {
    isClosed,
    deviationScore: deviation,
    safetyFloorApplied: false,
  };
}

/**
 * JSON serialization of PersonalBaseline
 */
export function serializeBaseline(baseline: PersonalBaseline): string {
  return JSON.stringify(baseline);
}

/**
 * JSON deserialization of PersonalBaseline with schema verification
 */
export function deserializeBaseline(jsonStr: string): PersonalBaseline | null {
  try {
    const parsed = JSON.parse(jsonStr);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.earOpenBaseline !== 'number' || typeof parsed.earThreshold !== 'number') {
      return null;
    }
    return {
      ...DEFAULT_BASELINE_PROFILE,
      ...parsed,
      isComplete: Boolean(parsed.isComplete),
    };
  } catch {
    return null;
  }
}

/**
 * Saves baseline profile to storage (browser localStorage or custom storage interface).
 */
export function saveBaselineToStorage(
  baseline: PersonalBaseline,
  storage?: KeyValueStorage
): boolean {
  try {
    const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!s) return false;
    s.setItem(CONFIG.calibration.storageKey, serializeBaseline(baseline));
    return true;
  } catch {
    return false;
  }
}

/**
 * Loads baseline profile from storage.
 */
export function loadBaselineFromStorage(
  storage?: KeyValueStorage
): PersonalBaseline | null {
  try {
    const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!s) return null;
    const raw = s.getItem(CONFIG.calibration.storageKey);
    if (!raw) return null;
    return deserializeBaseline(raw);
  } catch {
    return null;
  }
}

/**
 * Retrieves the active effective baseline profile.
 * Falls back safely to DEFAULT_BASELINE_PROFILE if uncalibrated or skipped.
 */
export function getEffectiveBaseline(storage?: KeyValueStorage): PersonalBaseline {
  const loaded = loadBaselineFromStorage(storage);
  return loaded ?? DEFAULT_BASELINE_PROFILE;
}
