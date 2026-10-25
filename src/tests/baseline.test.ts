import { describe, it, expect } from 'vitest';
import { CONFIG, DEFAULT_BASELINE_PROFILE } from '../core/config';
import {
  createCalibrationSession,
  addCalibrationSample,
  finalizeCalibration,
  deriveEarThreshold,
  adaptBaseline,
  computeBoundedEarDeviation,
  serializeBaseline,
  deserializeBaseline,
  saveBaselineToStorage,
  loadBaselineFromStorage,
  getEffectiveBaseline,
  KeyValueStorage,
  CalibrationSample,
} from '../core/baseline/calibration';
import { PersonalBaseline } from '../core/types';

describe('M2: Baseline Calibration & Online Adaptation', () => {
  it('supports 15s demo mode and 60s full mode session durations', () => {
    const demoSession = createCalibrationSession('demo_15s', 1000);
    expect(demoSession.mode).toBe('demo_15s');
    expect(demoSession.targetDurationSec).toBe(15);
    expect(demoSession.samples).toHaveLength(0);
    expect(demoSession.isComplete).toBe(false);

    const fullSession = createCalibrationSession('full_60s', 1000);
    expect(fullSession.mode).toBe('full_60s');
    expect(fullSession.targetDurationSec).toBe(60);
  });

  it('accumulates valid samples and filters out low quality or closed eyes during calibration', () => {
    const session = createCalibrationSession('demo_15s', 1000);

    // High quality valid sample
    const progress1 = addCalibrationSample(session, {
      ear: 0.32,
      mar: 0.18,
      headPitch: 1.5,
      headYaw: -0.5,
      quality: 0.95,
      blinkRate: 18,
    }, 2000);

    expect(session.samples).toHaveLength(1);
    expect(progress1.progress).toBeCloseTo(1 / 15, 2);
    expect(progress1.isComplete).toBe(false);

    // Low quality sample (< minQualityConfidence 0.40) should be filtered
    addCalibrationSample(session, {
      ear: 0.30,
      mar: 0.20,
      headPitch: 0.0,
      headYaw: 0.0,
      quality: 0.25, // low confidence
    }, 3000);

    expect(session.samples).toHaveLength(1);

    // Filter out invalid EAR (<= 0.10)
    addCalibrationSample(session, {
      ear: 0.05,
      mar: 0.20,
      headPitch: 0.0,
      headYaw: 0.0,
      quality: 0.90,
    }, 4000);

    expect(session.samples).toHaveLength(1);
  });

  it('completes session and derives threshold: open_ear * 0.75 clamped to [0.16, 0.35]', () => {
    // Test nominal EAR = 0.32 -> 0.32 * 0.75 = 0.24 (within range)
    expect(deriveEarThreshold(0.32)).toBeCloseTo(0.24, 4);

    // Test very low open EAR = 0.18 -> 0.18 * 0.75 = 0.135 -> clamped to min 0.16
    expect(deriveEarThreshold(0.18)).toBe(CONFIG.calibration.minEarThreshold);
    expect(deriveEarThreshold(0.18)).toBe(0.16);

    // Test high open EAR = 0.50 -> 0.50 * 0.75 = 0.375 -> clamped to max 0.35
    expect(deriveEarThreshold(0.50)).toBe(CONFIG.calibration.maxEarThreshold);
    expect(deriveEarThreshold(0.50)).toBe(0.35);

    // Complete session lifecycle
    const session = createCalibrationSession('demo_15s', 0);
    for (let sec = 1; sec <= 15; sec++) {
      addCalibrationSample(session, {
        ear: 0.30,
        mar: 0.20,
        headPitch: 2.0,
        headYaw: -1.0,
        quality: 0.90,
        blinkRate: 20,
        vibrationRms: 0.11,
        audioRms: 0.07,
      }, sec * 1000);
    }

    expect(session.isComplete).toBe(true);
    expect(session.result).not.toBeNull();
    const result = session.result!;
    expect(result.earOpenBaseline).toBeCloseTo(0.30, 2);
    expect(result.earThreshold).toBeCloseTo(0.30 * 0.75, 2);
    expect(result.marClosedBaseline).toBeCloseTo(0.20, 2);
    expect(result.headPitchOffset).toBeCloseTo(2.0, 1);
    expect(result.headYawOffset).toBeCloseTo(-1.0, 1);
    expect(result.isComplete).toBe(true);
  });

  it('enforces bounded online adaptation so chronically tired baseline cannot mask danger', () => {
    const initialBaseline: PersonalBaseline = {
      ...DEFAULT_BASELINE_PROFILE,
      earOpenBaseline: 0.30,
      earThreshold: 0.225,
      headPitchOffset: 0.0,
      headYawOffset: 0.0,
    };

    // Attempting to adapt with drowsy/low EAR sample (< earThreshold) should be rejected
    const drowsySample: CalibrationSample = {
      ear: 0.19,
      mar: 0.20,
      headPitch: 0.0,
      headYaw: 0.0,
      quality: 0.95,
    };
    const adapted1 = adaptBaseline(initialBaseline, drowsySample);
    expect(adapted1.earOpenBaseline).toBe(initialBaseline.earOpenBaseline);
    expect(adapted1.earThreshold).toBe(initialBaseline.earThreshold);

    // Nominal attentive sample should slightly adapt
    const nominalSample: CalibrationSample = {
      ear: 0.32,
      mar: 0.20,
      headPitch: 1.0,
      headYaw: 0.5,
      quality: 0.95,
    };
    const adapted2 = adaptBaseline(initialBaseline, nominalSample, 0.1);
    expect(adapted2.earOpenBaseline).toBeGreaterThan(initialBaseline.earOpenBaseline);
    expect(adapted2.earThreshold).toBeGreaterThan(initialBaseline.earThreshold);

    // Verify absolute safety floor: chronically low EAR (<= minEarThreshold) triggers safety floor
    const devSafe = computeBoundedEarDeviation(0.14, initialBaseline);
    expect(devSafe.isClosed).toBe(true);
    expect(devSafe.safetyFloorApplied).toBe(true);
    expect(devSafe.deviationScore).toBe(1.0);
  });

  it('serializes, deserializes, and persists profile with skip-calibration fallback', () => {
    const mockStorageMap = new Map<string, string>();
    const mockStorage: KeyValueStorage = {
      getItem: (k) => mockStorageMap.get(k) ?? null,
      setItem: (k, v) => { mockStorageMap.set(k, v); },
      removeItem: (k) => { mockStorageMap.delete(k); },
    };

    // Before any saved profile, getEffectiveBaseline returns DEFAULT_BASELINE_PROFILE
    const fallback = getEffectiveBaseline(mockStorage);
    expect(fallback.isComplete).toBe(true);
    expect(fallback.id).toBe(DEFAULT_BASELINE_PROFILE.id);

    // Define custom profile
    const customProfile: PersonalBaseline = {
      ...DEFAULT_BASELINE_PROFILE,
      id: 'profile_test_user',
      earOpenBaseline: 0.34,
      earThreshold: 0.255,
    };

    // Test direct serialization and deserialization functions
    const serialized = serializeBaseline(customProfile);
    expect(typeof serialized).toBe('string');
    const deserialized = deserializeBaseline(serialized);
    expect(deserialized?.id).toBe(customProfile.id);

    // Test finalizeCalibration directly with empty session fallback
    const emptySession = createCalibrationSession('demo_15s', 5000);
    const fallbackResult = finalizeCalibration(emptySession, 6000);
    expect(fallbackResult.isComplete).toBe(false);

    // Save custom profile
    const saved = saveBaselineToStorage(customProfile, mockStorage);
    expect(saved).toBe(true);

    const loaded = loadBaselineFromStorage(mockStorage);
    expect(loaded).not.toBeNull();
    expect(loaded?.id).toBe('profile_test_user');
    expect(loaded?.earOpenBaseline).toBeCloseTo(0.34, 2);
    expect(loaded?.earThreshold).toBeCloseTo(0.255, 3);

    // Corrupted JSON should safely return null and fall back
    mockStorage.setItem(CONFIG.calibration.storageKey, 'invalid-json');
    expect(loadBaselineFromStorage(mockStorage)).toBeNull();
    expect(getEffectiveBaseline(mockStorage).id).toBe(DEFAULT_BASELINE_PROFILE.id);
  });
});
