import { describe, it, expect } from 'vitest';
import { CONFIG, DEFAULT_BASELINE_PROFILE } from '../core/config';
import {
  evaluateRisk,
  createInitialRiskState,
  scoreToRiskLevel,
} from '../core/fusion/riskEngine';
import { buildExplanation } from '../core/fusion/explanationBuilder';
import {
  DriverFeatures,
  VehicleFeatures,
  PersonalBaseline,
  RISK_LEVELS,
} from '../core/types';

describe('M2: Risk Engine & Fusion Vitest Suite', () => {
  const nominalDriver: DriverFeatures = {
    t: 1000,
    faceDetected: true,
    quality: 0.95,
    ear: 0.28,
    perclos60: 0.04,
    blinkRate: 18,
    longClosureSec: 0,
    mar: 0.20,
    yawning: false,
    headPitch: 0.0,
    headYaw: 0.0,
    headRoll: 0.0,
    eyesOffRoadSec: 0,
  };

  const nominalVehicle: VehicleFeatures = {
    t: 1000,
    source: 'sensor',
    vibrationRms: 0.12,
    vibrationAnomaly: 0.0,
    audioRms: 0.08,
    audioAnomaly: 0.0,
    audioBands: [0.05, 0.08, 0.03],
  };

  // ── Test 1: Drowsy only escalation ─────────────────────────────────────────
  it('Test 1: Drowsy only escalation elevates risk without compound escalation', () => {
    // Nominal state check
    const rNormal = evaluateRisk(nominalDriver, nominalVehicle, DEFAULT_BASELINE_PROFILE);
    expect(rNormal.assessment.level).toBe(RISK_LEVELS.NORMAL);
    expect(rNormal.assessment.compoundEscalation).toBe(false);

    // Drowsy with sustained eye closure (2.1s >= warning 1.8s)
    const drowsyDriver: DriverFeatures = {
      ...nominalDriver,
      t: 2000,
      longClosureSec: 2.1,
      ear: 0.15,
      perclos60: 0.28,
    };

    const rWarning = evaluateRisk(drowsyDriver, nominalVehicle, DEFAULT_BASELINE_PROFILE);
    expect(rWarning.assessment.level).toBe(RISK_LEVELS.WARNING);
    expect(rWarning.assessment.driverRisk).toBeGreaterThanOrEqual(0.60);
    expect(rWarning.assessment.vehicleRisk).toBe(0.0);
    expect(rWarning.assessment.compoundEscalation).toBe(false);
    expect(rWarning.assessment.explanation).toContain('Eyes closed 2.1 s');

    // Severe microsleep (3.5s >= critical 3.0s)
    const criticalDriver: DriverFeatures = {
      ...nominalDriver,
      t: 3000,
      longClosureSec: 3.5,
      ear: 0.12,
      perclos60: 0.45,
    };

    const rCritical = evaluateRisk(criticalDriver, nominalVehicle, DEFAULT_BASELINE_PROFILE);
    expect(rCritical.assessment.level).toBe(RISK_LEVELS.CRITICAL);
    expect(rCritical.assessment.driverRisk).toBeGreaterThanOrEqual(0.85);
    expect(rCritical.assessment.compoundEscalation).toBe(false);
  });

  // ── Test 2: Vehicle anomaly only ───────────────────────────────────────────
  it('Test 2: Vehicle anomaly only respects persistence window and does not trigger compound escalation', () => {
    const initialState = createInitialRiskState(1000);

    // Instantaneous vibration anomaly at t=1000 (< 1.5s persistence)
    const anomalousVehicleT1: VehicleFeatures = {
      ...nominalVehicle,
      t: 1000,
      vibrationRms: 0.85,
      vibrationAnomaly: 0.80,
    };

    const rInstant = evaluateRisk(nominalDriver, anomalousVehicleT1, DEFAULT_BASELINE_PROFILE, initialState);
    // Before 1.5s persistence window elapses, vehicle risk should not trigger alert level
    expect(rInstant.state.vehicleAnomalyActive).toBe(false);
    expect(rInstant.assessment.vehicleRisk).toBe(0);
    expect(rInstant.assessment.level).toBe(RISK_LEVELS.NORMAL);

    // After 2.0s persistence (> 1.5s anomalyPersistenceSec)
    const anomalousVehicleT2: VehicleFeatures = {
      ...nominalVehicle,
      t: 3000, // 2000 ms elapsed
      vibrationRms: 0.85,
      vibrationAnomaly: 0.80,
    };

    const rPersisted = evaluateRisk(nominalDriver, anomalousVehicleT2, DEFAULT_BASELINE_PROFILE, rInstant.state);
    expect(rPersisted.state.vehicleAnomalyActive).toBe(true);
    expect(rPersisted.assessment.vehicleRisk).toBeGreaterThanOrEqual(0.70);
    expect(rPersisted.assessment.compoundEscalation).toBe(false);
    // High vehicle anomaly alone reaches WARNING/CRITICAL based on score
    expect(rPersisted.assessment.level).toBeGreaterThanOrEqual(RISK_LEVELS.NOTICE);
    expect(rPersisted.assessment.explanation).toContain('unusual vibration');
  });

  // ── Test 3: Compound escalation ────────────────────────────────────────────
  it('Test 3: Compound escalation (drowsy + vehicle triggers +1 level escalation with explanation)', () => {
    // 1. Driver at NOTICE level (longClosure 1.2s, perclos 18%)
    const noticeDriver: DriverFeatures = {
      ...nominalDriver,
      t: 1000,
      longClosureSec: 1.2,
      perclos60: 0.18,
    };

    // First, verify driver alone is NOTICE (level 1)
    const rDriverOnly = evaluateRisk(noticeDriver, nominalVehicle, DEFAULT_BASELINE_PROFILE);
    expect(rDriverOnly.assessment.level).toBe(RISK_LEVELS.NOTICE);
    expect(rDriverOnly.assessment.compoundEscalation).toBe(false);

    // 2. Introduce active vehicle anomaly that has persisted for 2.0s
    let state = createInitialRiskState(0);
    const vehicleT0: VehicleFeatures = {
      ...nominalVehicle,
      t: 1000,
      vibrationRms: 0.65,
      vibrationAnomaly: 0.65,
    };
    const rT0 = evaluateRisk(noticeDriver, vehicleT0, DEFAULT_BASELINE_PROFILE, state);

    const vehicleT1: VehicleFeatures = {
      ...nominalVehicle,
      t: 3000, // 2.0s elapsed (> 1.5s persistence)
      vibrationRms: 0.65,
      vibrationAnomaly: 0.65,
    };
    const driverT1: DriverFeatures = {
      ...noticeDriver,
      t: 3000,
    };

    const rCompound = evaluateRisk(driverT1, vehicleT1, DEFAULT_BASELINE_PROFILE, rT0.state);

    // Compound rule: NOTICE (1) + active vehicle anomaly -> escalated to WARNING (2)!
    expect(rCompound.assessment.compoundEscalation).toBe(true);
    expect(rCompound.assessment.level).toBe(RISK_LEVELS.WARNING);

    // Verify explanation phrasing includes numeric evidence and compound rationale
    const explanation = rCompound.assessment.explanation;
    expect(explanation).toContain('Eyes closed 1.2 s');
    expect(explanation).toContain('unusual vibration');
    expect(explanation).toContain('Risk raised because both appear together.');

    // 3. Driver at WARNING (2) + vehicle anomaly -> escalated to CRITICAL (3)
    const warningDriver: DriverFeatures = {
      ...nominalDriver,
      t: 4000,
      longClosureSec: 2.1,
      perclos60: 0.28,
    };
    const vehicleT2: VehicleFeatures = {
      ...vehicleT1,
      t: 4000,
    };

    const rCriticalCompound = evaluateRisk(warningDriver, vehicleT2, DEFAULT_BASELINE_PROFILE, rCompound.state);
    expect(rCriticalCompound.assessment.compoundEscalation).toBe(true);
    expect(rCriticalCompound.assessment.level).toBe(RISK_LEVELS.CRITICAL);
    expect(rCriticalCompound.assessment.explanation).toContain('Risk raised because both appear together.');
  });

  // ── Test 4: Low confidence cap ─────────────────────────────────────────────
  it('Test 4: Low confidence cap (quality < 0.40 capped at NOTICE)', () => {
    // Severe microsleep that would normally be CRITICAL (longClosure = 3.2s)
    const severeDrowsyLowQuality: DriverFeatures = {
      ...nominalDriver,
      t: 1000,
      quality: 0.32, // < minQualityConfidence (0.40)
      longClosureSec: 3.2,
      perclos60: 0.45,
    };

    const result = evaluateRisk(severeDrowsyLowQuality, nominalVehicle, DEFAULT_BASELINE_PROFILE);

    // Must be capped at NOTICE (1) to prevent false-alarm spam
    expect(result.assessment.level).toBe(RISK_LEVELS.NOTICE);
    expect(result.assessment.confidence).toBeLessThan(CONFIG.driver.minQualityConfidence);

    // Face not detected should also be capped at NOTICE
    const noFaceDriver: DriverFeatures = {
      ...severeDrowsyLowQuality,
      faceDetected: false,
      quality: 0.0,
    };
    const resultNoFace = evaluateRisk(noFaceDriver, nominalVehicle, DEFAULT_BASELINE_PROFILE);
    expect(resultNoFace.assessment.level).toBe(RISK_LEVELS.NOTICE);
    expect(resultNoFace.assessment.confidence).toBe(0.0);
  });

  // ── Test 5: Hysteresis hold before downgrade ───────────────────────────────
  it('Test 5: Hysteresis hold must sustain lower risk for hysteresisHoldSec (3.0s) before downgrading', () => {
    // Step 1: Trigger WARNING level at t = 1000
    const warningDriver: DriverFeatures = {
      ...nominalDriver,
      t: 1000,
      longClosureSec: 2.0,
    };

    const rWarning = evaluateRisk(warningDriver, nominalVehicle, DEFAULT_BASELINE_PROFILE);
    expect(rWarning.assessment.level).toBe(RISK_LEVELS.WARNING);

    // Step 2: Driver immediately recovers to nominal at t = 2000 (1.0s elapsed < 3.0s hold)
    const nominalT1: DriverFeatures = {
      ...nominalDriver,
      t: 2000,
    };
    const rHold1 = evaluateRisk(nominalT1, nominalVehicle, DEFAULT_BASELINE_PROFILE, rWarning.state);
    expect(rHold1.assessment.level).toBe(RISK_LEVELS.WARNING); // Retained due to hysteresis!
    expect(rHold1.state.candidateDowngradeLevel).toBe(RISK_LEVELS.NORMAL);

    // Step 3: Still nominal at t = 3500 (2.5s elapsed < 3.0s hold)
    const nominalT2: DriverFeatures = {
      ...nominalDriver,
      t: 3500,
    };
    const rHold2 = evaluateRisk(nominalT2, nominalVehicle, DEFAULT_BASELINE_PROFILE, rHold1.state);
    expect(rHold2.assessment.level).toBe(RISK_LEVELS.WARNING); // Still held!

    // Step 4: Reached t = 5100 (3.1s elapsed >= 3.0s hysteresisHoldSec)
    const nominalT3: DriverFeatures = {
      ...nominalDriver,
      t: 5100,
    };
    const rDowngraded = evaluateRisk(nominalT3, nominalVehicle, DEFAULT_BASELINE_PROFILE, rHold2.state);
    expect(rDowngraded.assessment.level).toBe(RISK_LEVELS.NORMAL); // Successfully downgraded!

    // Step 5: Immediate escalation during hold
    // If during hold a CRITICAL spike occurs, escalation happens immediately without delay
    const rHoldAgain = evaluateRisk(nominalT1, nominalVehicle, DEFAULT_BASELINE_PROFILE, rWarning.state);
    const spikeDriver: DriverFeatures = {
      ...nominalDriver,
      t: 2500,
      longClosureSec: 3.5,
    };
    const rSpike = evaluateRisk(spikeDriver, nominalVehicle, DEFAULT_BASELINE_PROFILE, rHoldAgain.state);
    expect(rSpike.assessment.level).toBe(RISK_LEVELS.CRITICAL);
    expect(rSpike.state.candidateDowngradeLevel).toBeNull();
  });

  // ── Test 6: Incomplete calibration / fallback baseline behavior ───────────
  it('Test 6: Incomplete calibration and fallback baseline behavior works reliably', () => {
    const incompleteBaseline: PersonalBaseline = {
      ...DEFAULT_BASELINE_PROFILE,
      id: 'incomplete_profile',
      isComplete: false,
    };

    // Evaluates deterministically with fallback profile
    const result = evaluateRisk(nominalDriver, nominalVehicle, incompleteBaseline);
    expect(result.assessment.level).toBe(RISK_LEVELS.NORMAL);
    expect(result.assessment.confidence).toBeLessThan(nominalDriver.quality); // Scaled for incomplete profile

    // When drowsy under fallback baseline, detection remains accurate
    const drowsyDriver: DriverFeatures = {
      ...nominalDriver,
      t: 2000,
      longClosureSec: 2.2,
      perclos60: 0.30,
    };
    const rDrowsy = evaluateRisk(drowsyDriver, nominalVehicle, incompleteBaseline);
    expect(rDrowsy.assessment.level).toBe(RISK_LEVELS.WARNING);
  });

  // ── Explanation Builder Unit Checks ────────────────────────────────────────
  it('buildExplanation produces formatted explanation strings matching prompt examples', () => {
    const factors = [
      { id: 'long_eye_closure', label: 'Long Eye Closure', contribution: 0.35, evidence: 'Eyes closed 2.1 s' },
      { id: 'perclos_high', label: 'High PERCLOS', contribution: 0.30, evidence: 'PERCLOS 28%' },
      { id: 'vibration_anomaly', label: 'Vibration Anomaly', contribution: 0.35, evidence: 'unusual vibration for 4.2 s' },
    ];

    const compoundExplanation = buildExplanation(factors, true, RISK_LEVELS.WARNING);
    expect(compoundExplanation).toBe(
      'Eyes closed 2.1 s, PERCLOS 28%, plus unusual vibration for 4.2 s. Risk raised because both appear together.'
    );

    const singleExplanation = buildExplanation(factors.slice(0, 2), false, RISK_LEVELS.NOTICE);
    expect(singleExplanation).toBe('Eyes closed 2.1 s, PERCLOS 28%.');

    expect(scoreToRiskLevel(0.10)).toBe(RISK_LEVELS.NORMAL);
    expect(scoreToRiskLevel(0.30)).toBe(RISK_LEVELS.NOTICE);
    expect(scoreToRiskLevel(0.60)).toBe(RISK_LEVELS.WARNING);
    expect(scoreToRiskLevel(0.85)).toBe(RISK_LEVELS.CRITICAL);
  });
});
