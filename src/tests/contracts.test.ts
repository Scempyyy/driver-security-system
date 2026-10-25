import { describe, it, expect } from 'vitest';
import { CONFIG, DEFAULT_BASELINE_PROFILE } from '../core/config';
import { RISK_LEVELS, DriverFeatures, VehicleFeatures, RiskAssessment, Alert } from '../core/types';

describe('M0: Contracts and Configuration Integrity', () => {
  it('defines 4 risk levels with strict monotonic ordering', () => {
    expect(RISK_LEVELS.NORMAL).toBe(0);
    expect(RISK_LEVELS.NOTICE).toBe(1);
    expect(RISK_LEVELS.WARNING).toBe(2);
    expect(RISK_LEVELS.CRITICAL).toBe(3);
  });

  it('provides configurable calibration durations', () => {
    expect(CONFIG.calibration.demoDurationSec).toBe(15);
    expect(CONFIG.calibration.fullDurationSec).toBe(60);
    expect(CONFIG.calibration.demoDurationSec).toBeLessThan(CONFIG.calibration.fullDurationSec);
    expect(CONFIG.calibration.minEarThreshold).toBeLessThan(CONFIG.calibration.maxEarThreshold);
  });

  it('provides configurable PERCLOS windows and threshold hierarchy', () => {
    expect(CONFIG.perclos.demoWindowSec).toBeGreaterThanOrEqual(20);
    expect(CONFIG.perclos.demoWindowSec).toBeLessThanOrEqual(30);
    expect(CONFIG.perclos.defaultWindowSec).toBe(60);
    
    expect(CONFIG.perclos.noticeThreshold).toBeLessThan(CONFIG.perclos.warningThreshold);
    expect(CONFIG.perclos.warningThreshold).toBeLessThan(CONFIG.perclos.criticalThreshold);
  });

  it('ensures composite driver weights sum to exactly 1.0', () => {
    const weights = CONFIG.fusion.driverWeights;
    const sum = weights.longClosure + weights.perclos + weights.yawn + weights.headNod + weights.attentionDrift;
    expect(Math.round(sum * 100) / 100).toBe(1.0);
  });

  it('ensures fusion compounding weights sum to 1.0', () => {
    const sum = CONFIG.fusion.compoundDriverWeight + CONFIG.fusion.compoundVehicleWeight;
    expect(Math.round(sum * 100) / 100).toBe(1.0);
  });

  it('verifies DEFAULT_BASELINE_PROFILE satisfies completeness criteria', () => {
    expect(DEFAULT_BASELINE_PROFILE.isComplete).toBe(true);
    expect(DEFAULT_BASELINE_PROFILE.earOpenBaseline).toBeGreaterThan(0.20);
    expect(DEFAULT_BASELINE_PROFILE.earThreshold).toBeLessThan(DEFAULT_BASELINE_PROFILE.earOpenBaseline);
    expect(DEFAULT_BASELINE_PROFILE.normalBlinkRate).toBeGreaterThan(0);
  });

  it('instantiates valid mock driver and vehicle features without type errors', () => {
    const mockDriver: DriverFeatures = {
      t: 1000,
      faceDetected: true,
      quality: 0.95,
      ear: 0.28,
      perclos60: 0.05,
      blinkRate: 16,
      longClosureSec: 0,
      mar: 0.20,
      yawning: false,
      headPitch: 2.1,
      headYaw: -1.2,
      headRoll: 0.5,
      eyesOffRoadSec: 0,
    };

    const mockVehicle: VehicleFeatures = {
      t: 1000,
      source: 'simulated',
      vibrationRms: 0.12,
      vibrationAnomaly: 0.05,
      audioRms: 0.08,
      audioAnomaly: 0.02,
      audioBands: [0.05, 0.08, 0.04],
    };

    const mockAssessment: RiskAssessment = {
      t: 1000,
      driverRisk: 0.1,
      vehicleRisk: 0.05,
      fusedRisk: 0.08,
      level: RISK_LEVELS.NORMAL,
      confidence: 0.95,
      factors: [],
      explanation: 'All driver and vehicle signals normal.',
      compoundEscalation: false,
    };

    const mockAlert: Alert = {
      id: 'alert-1',
      t: 1000,
      level: RISK_LEVELS.NORMAL,
      assessment: mockAssessment,
      acknowledged: true,
    };

    expect(mockDriver.faceDetected).toBe(true);
    expect(mockVehicle.source).toBe('simulated');
    expect(mockAssessment.level).toBe(0);
    expect(mockAlert.acknowledged).toBe(true);
  });
});
