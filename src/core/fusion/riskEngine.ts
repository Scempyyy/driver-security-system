/**
 * NeuroDrive AI - Pure Risk & Fusion Engine
 * 
 * Evaluates driver state and vehicle signals to produce explainable fused risk assessments,
 * manages confidence-weighted factor accumulation, enforces compound escalation rules,
 * prevents flapping via hysteresis hold windows, and manages alert cooldowns.
 * 
 * Pure TypeScript with zero DOM/browser dependencies.
 */

import { CONFIG } from '../config';
import {
  Alert,
  DriverFeatures,
  Factor,
  PersonalBaseline,
  RiskAssessment,
  RiskLevel,
  RISK_LEVELS,
  VehicleFeatures,
} from '../types';
import { buildExplanation } from './explanationBuilder';

export interface RiskEngineState {
  currentLevel: RiskLevel;
  levelStartTime: number;
  candidateDowngradeLevel: RiskLevel | null;
  candidateDowngradeStartTime: number | null;
  vehicleAnomalyStartTime: number | null;
  vehicleAnomalyActive: boolean;
  lastAlertTime: number;
  lastVoiceAlertTime: number;
  lastAssessment: RiskAssessment | null;
}

export interface RiskEngineResult {
  assessment: RiskAssessment;
  state: RiskEngineState;
  alert: Alert | null;
}

/**
 * Creates the initial state for the risk engine.
 */
export function createInitialRiskState(initialTime: number = 0): RiskEngineState {
  return {
    currentLevel: RISK_LEVELS.NORMAL,
    levelStartTime: initialTime,
    candidateDowngradeLevel: null,
    candidateDowngradeStartTime: null,
    vehicleAnomalyStartTime: null,
    vehicleAnomalyActive: false,
    lastAlertTime: -Infinity,
    lastVoiceAlertTime: -Infinity,
    lastAssessment: null,
  };
}

/**
 * Maps a numeric risk score (0.0 - 1.0) to standard RiskLevel based on config thresholds.
 */
export function scoreToRiskLevel(score: number): RiskLevel {
  if (score >= CONFIG.fusion.riskLevels.critical) return RISK_LEVELS.CRITICAL;
  if (score >= CONFIG.fusion.riskLevels.warning) return RISK_LEVELS.WARNING;
  if (score >= CONFIG.fusion.riskLevels.notice) return RISK_LEVELS.NOTICE;
  return RISK_LEVELS.NORMAL;
}

/**
 * Pure evaluation function for driver and vehicle risk fusion.
 */
export function evaluateRisk(
  driverFeatures: DriverFeatures,
  vehicleFeatures: VehicleFeatures,
  baseline: PersonalBaseline,
  prevState?: RiskEngineState | null
): RiskEngineResult {
  const factors: Factor[] = [];

  // ── 1. Driver Features & Factor Calculation ──────────────────────────────
  let longClosureRisk = 0;
  if (driverFeatures.longClosureSec >= CONFIG.driver.longClosureCriticalSec) {
    longClosureRisk = 1.0;
  } else if (driverFeatures.longClosureSec >= CONFIG.driver.longClosureWarningSec) {
    const span = CONFIG.driver.longClosureCriticalSec - CONFIG.driver.longClosureWarningSec;
    longClosureRisk = 0.65 + 0.35 * ((driverFeatures.longClosureSec - CONFIG.driver.longClosureWarningSec) / span);
  } else if (driverFeatures.longClosureSec >= CONFIG.driver.longClosureNoticeSec) {
    const span = CONFIG.driver.longClosureWarningSec - CONFIG.driver.longClosureNoticeSec;
    longClosureRisk = 0.35 + 0.30 * ((driverFeatures.longClosureSec - CONFIG.driver.longClosureNoticeSec) / span);
  } else if (driverFeatures.longClosureSec > 0) {
    longClosureRisk = 0.35 * (driverFeatures.longClosureSec / CONFIG.driver.longClosureNoticeSec);
  }

  if (driverFeatures.longClosureSec > 0) {
    factors.push({
      id: 'long_eye_closure',
      label: 'Prolonged Eye Closure',
      contribution: longClosureRisk * CONFIG.fusion.driverWeights.longClosure,
      evidence: `Eyes closed ${driverFeatures.longClosureSec.toFixed(1)} s`,
    });
  }

  let perclosRisk = 0;
  if (driverFeatures.perclos60 >= CONFIG.perclos.criticalThreshold) {
    perclosRisk = 1.0;
  } else if (driverFeatures.perclos60 >= CONFIG.perclos.warningThreshold) {
    const span = CONFIG.perclos.criticalThreshold - CONFIG.perclos.warningThreshold;
    perclosRisk = 0.65 + 0.35 * ((driverFeatures.perclos60 - CONFIG.perclos.warningThreshold) / span);
  } else if (driverFeatures.perclos60 >= CONFIG.perclos.noticeThreshold) {
    const span = CONFIG.perclos.warningThreshold - CONFIG.perclos.noticeThreshold;
    perclosRisk = 0.35 + 0.30 * ((driverFeatures.perclos60 - CONFIG.perclos.noticeThreshold) / span);
  } else if (driverFeatures.perclos60 > 0) {
    perclosRisk = 0.35 * (driverFeatures.perclos60 / CONFIG.perclos.noticeThreshold);
  }

  if (driverFeatures.perclos60 > 0.05) {
    factors.push({
      id: 'perclos_high',
      label: 'High PERCLOS',
      contribution: perclosRisk * CONFIG.fusion.driverWeights.perclos,
      evidence: `PERCLOS ${Math.round(driverFeatures.perclos60 * 100)}%`,
    });
  }

  let yawnRisk = 0;
  if (driverFeatures.yawning) {
    yawnRisk = 0.85;
  } else if (driverFeatures.mar > CONFIG.driver.marYawnThreshold) {
    yawnRisk = 0.50;
  }

  if (yawnRisk > 0) {
    factors.push({
      id: 'yawn_detected',
      label: 'Yawning / Drowsiness',
      contribution: yawnRisk * CONFIG.fusion.driverWeights.yawn,
      evidence: `Yawn detected (MAR ${driverFeatures.mar.toFixed(2)})`,
    });
  }

  const pitchDrop = driverFeatures.headPitch - baseline.headPitchOffset;
  let headNodRisk = 0;
  if (pitchDrop >= 25.0) {
    headNodRisk = 1.0;
  } else if (pitchDrop >= CONFIG.driver.headPitchNodDropDeg) {
    headNodRisk = 0.50 + 0.50 * ((pitchDrop - CONFIG.driver.headPitchNodDropDeg) / (25.0 - CONFIG.driver.headPitchNodDropDeg));
  } else if (pitchDrop > 5.0) {
    headNodRisk = 0.30 * (pitchDrop / CONFIG.driver.headPitchNodDropDeg);
  }

  if (headNodRisk > 0.25) {
    factors.push({
      id: 'head_nod',
      label: 'Head Nodding',
      contribution: headNodRisk * CONFIG.fusion.driverWeights.headNod,
      evidence: `Head nod drop ${pitchDrop.toFixed(1)}°`,
    });
  }

  let attentionRisk = 0;
  if (driverFeatures.eyesOffRoadSec >= CONFIG.driver.eyesOffRoadWarningSec) {
    attentionRisk = 1.0;
  } else if (driverFeatures.eyesOffRoadSec >= CONFIG.driver.eyesOffRoadNoticeSec) {
    const span = CONFIG.driver.eyesOffRoadWarningSec - CONFIG.driver.eyesOffRoadNoticeSec;
    attentionRisk = 0.50 + 0.50 * ((driverFeatures.eyesOffRoadSec - CONFIG.driver.eyesOffRoadNoticeSec) / span);
  } else if (driverFeatures.eyesOffRoadSec > 0) {
    attentionRisk = 0.50 * (driverFeatures.eyesOffRoadSec / CONFIG.driver.eyesOffRoadNoticeSec);
  }

  if (attentionRisk > 0.20) {
    factors.push({
      id: 'attention_drift',
      label: 'Eyes Off Road',
      contribution: attentionRisk * CONFIG.fusion.driverWeights.attentionDrift,
      evidence: `Eyes off road ${driverFeatures.eyesOffRoadSec.toFixed(1)} s`,
    });
  }

  // Weighted composite driver risk
  const weightedDriverSum =
    longClosureRisk * CONFIG.fusion.driverWeights.longClosure +
    perclosRisk * CONFIG.fusion.driverWeights.perclos +
    yawnRisk * CONFIG.fusion.driverWeights.yawn +
    headNodRisk * CONFIG.fusion.driverWeights.headNod +
    attentionRisk * CONFIG.fusion.driverWeights.attentionDrift;

  // Single dominant symptom floor (microsleep, severe perclos, or prolonged distraction)
  let peakDriverRisk = 0;
  if (driverFeatures.longClosureSec >= CONFIG.driver.longClosureCriticalSec || driverFeatures.perclos60 >= CONFIG.perclos.criticalThreshold) {
    peakDriverRisk = Math.max(peakDriverRisk, 0.85);
  } else if (
    driverFeatures.longClosureSec >= CONFIG.driver.longClosureWarningSec ||
    driverFeatures.perclos60 >= CONFIG.perclos.warningThreshold ||
    driverFeatures.eyesOffRoadSec >= CONFIG.driver.eyesOffRoadWarningSec
  ) {
    peakDriverRisk = Math.max(peakDriverRisk, 0.60);
  } else if (
    driverFeatures.longClosureSec >= CONFIG.driver.longClosureNoticeSec ||
    driverFeatures.perclos60 >= CONFIG.perclos.noticeThreshold ||
    driverFeatures.eyesOffRoadSec >= CONFIG.driver.eyesOffRoadNoticeSec
  ) {
    peakDriverRisk = Math.max(peakDriverRisk, 0.30);
  }

  const driverRisk = Math.min(1.0, Math.max(weightedDriverSum, peakDriverRisk));
  const driverLevel = scoreToRiskLevel(driverRisk);

  // ── 2. Vehicle Anomaly with Persistence Window ────────────────────────────
  const instantVibrationAnomaly =
    vehicleFeatures.vibrationAnomaly >= 0.35 ||
    vehicleFeatures.vibrationRms >= CONFIG.vehicle.vibrationAnomalyThreshold;

  const instantAudioAnomaly =
    vehicleFeatures.audioAnomaly >= 0.35 ||
    vehicleFeatures.audioRms >= CONFIG.vehicle.audioAnomalyThreshold;

  const hasInstantAnomaly = instantVibrationAnomaly || instantAudioAnomaly;
  const rawAnomalyMagnitude = Math.max(vehicleFeatures.vibrationAnomaly, vehicleFeatures.audioAnomaly);

  let vehicleAnomalyStartTime = prevState?.vehicleAnomalyStartTime ?? null;
  let vehicleAnomalyActive = false;
  let vehicleRisk = 0;
  let anomalyDurationSec = 0;

  if (hasInstantAnomaly) {
    if (vehicleAnomalyStartTime === null) {
      vehicleAnomalyStartTime = vehicleFeatures.t;
    }
    anomalyDurationSec = Math.max(0, (vehicleFeatures.t - vehicleAnomalyStartTime) / 1000);
    if (anomalyDurationSec >= CONFIG.vehicle.anomalyPersistenceSec) {
      vehicleAnomalyActive = true;
      vehicleRisk = Math.max(rawAnomalyMagnitude, 0.50);
    } else {
      vehicleAnomalyActive = false;
      vehicleRisk = 0;
    }
  } else {
    vehicleAnomalyStartTime = null;
    vehicleAnomalyActive = false;
    vehicleRisk = 0;
  }

  if (vehicleAnomalyActive) {
    if (instantVibrationAnomaly) {
      factors.push({
        id: 'vibration_anomaly',
        label: 'Abnormal Vehicle Vibration',
        contribution: vehicleRisk * CONFIG.fusion.compoundVehicleWeight,
        evidence: `unusual vibration for ${anomalyDurationSec.toFixed(1)} s`,
      });
    }
    if (instantAudioAnomaly) {
      factors.push({
        id: 'audio_anomaly',
        label: 'Acoustic Anomaly',
        contribution: vehicleRisk * CONFIG.fusion.compoundVehicleWeight,
        evidence: `unusual cabin audio for ${anomalyDurationSec.toFixed(1)} s`,
      });
    }
  }

  // ── 3. Compound Escalation Rule ──────────────────────────────────────────
  let targetLevel: RiskLevel;
  let compoundEscalation = false;
  let fusedRisk: number;

  if (vehicleAnomalyActive && driverLevel >= CONFIG.fusion.compoundEscalationMinDriverLevel) {
    // Both driver impairment and active vehicle anomaly are present
    compoundEscalation = true;
    targetLevel = Math.min(RISK_LEVELS.CRITICAL, (driverLevel + 1) as RiskLevel) as RiskLevel;

    const levelFloorScore = targetLevel === RISK_LEVELS.CRITICAL
      ? CONFIG.fusion.riskLevels.critical
      : targetLevel === RISK_LEVELS.WARNING
      ? CONFIG.fusion.riskLevels.warning
      : CONFIG.fusion.riskLevels.notice;

    fusedRisk = Math.min(1.0, Math.max(driverRisk, vehicleRisk, levelFloorScore));
  } else {
    compoundEscalation = false;
    fusedRisk = Math.min(1.0, Math.max(driverRisk, vehicleRisk));
    targetLevel = scoreToRiskLevel(fusedRisk);
  }

  // ── 4. Low Confidence Cap ────────────────────────────────────────────────
  let confidence = driverFeatures.faceDetected ? driverFeatures.quality : 0.0;
  if (!baseline.isComplete) {
    confidence *= 0.85;
  }

  const isLowConfidence =
    !driverFeatures.faceDetected ||
    driverFeatures.quality < CONFIG.driver.minQualityConfidence ||
    confidence < CONFIG.driver.minQualityConfidence;

  if (isLowConfidence && targetLevel > CONFIG.fusion.lowConfidenceCapLevel) {
    targetLevel = CONFIG.fusion.lowConfidenceCapLevel;
  }

  // ── 5. Hysteresis State Machine ──────────────────────────────────────────
  const prevLevel: RiskLevel = prevState?.currentLevel ?? targetLevel;
  let newLevel: RiskLevel = prevLevel;
  let candidateDowngradeLevel: RiskLevel | null = prevState?.candidateDowngradeLevel ?? null;
  let candidateDowngradeStartTime: number | null = prevState?.candidateDowngradeStartTime ?? null;
  let levelStartTime = prevState?.levelStartTime ?? driverFeatures.t;

  if (targetLevel > prevLevel) {
    // Escalation takes effect immediately
    newLevel = targetLevel;
    candidateDowngradeLevel = null;
    candidateDowngradeStartTime = null;
    levelStartTime = driverFeatures.t;
  } else if (targetLevel === prevLevel) {
    newLevel = targetLevel;
    candidateDowngradeLevel = null;
    candidateDowngradeStartTime = null;
  } else {
    // targetLevel < prevLevel: Lower level requested, must sustain for hysteresisHoldSec
    const candidateStart =
      candidateDowngradeStartTime !== null &&
      candidateDowngradeLevel !== null &&
      candidateDowngradeLevel < prevLevel
        ? candidateDowngradeStartTime
        : driverFeatures.t;

    const elapsedHoldSec = (driverFeatures.t - candidateStart) / 1000;
    if (elapsedHoldSec >= CONFIG.fusion.hysteresisHoldSec) {
      newLevel = targetLevel;
      candidateDowngradeLevel = null;
      candidateDowngradeStartTime = null;
      levelStartTime = driverFeatures.t;
    } else {
      newLevel = prevLevel;
      candidateDowngradeLevel = targetLevel;
      candidateDowngradeStartTime = candidateStart;
    }
  }

  // ── 6. Alert Cooldown State Machine ──────────────────────────────────────
  let alert: Alert | null = null;
  let lastAlertTime = prevState?.lastAlertTime ?? -Infinity;
  let lastVoiceAlertTime = prevState?.lastVoiceAlertTime ?? -Infinity;

  const timeSinceLastAlertSec = (driverFeatures.t - lastAlertTime) / 1000;
  const timeSinceLastVoiceSec = (driverFeatures.t - lastVoiceAlertTime) / 1000;

  const isLevelEscalation = newLevel > (prevState?.currentLevel ?? RISK_LEVELS.NORMAL);
  const isSustainedDangerCooldownElapsed =
    newLevel >= RISK_LEVELS.WARNING && timeSinceLastAlertSec >= CONFIG.fusion.alertCooldownSec;

  // ── 7. Build Explanation & Risk Assessment ───────────────────────────────
  const explanation = buildExplanation(factors, compoundEscalation, newLevel);

  const assessment: RiskAssessment = {
    t: driverFeatures.t,
    driverRisk,
    vehicleRisk,
    fusedRisk,
    level: newLevel,
    confidence,
    factors,
    explanation,
    compoundEscalation,
  };

  if (newLevel > RISK_LEVELS.NORMAL && (isLevelEscalation || isSustainedDangerCooldownElapsed)) {
    alert = {
      id: `alert_${driverFeatures.t}_${Math.random().toString(36).slice(2, 8)}`,
      t: driverFeatures.t,
      level: newLevel,
      assessment,
      acknowledged: false,
    };
    lastAlertTime = driverFeatures.t;
    if (newLevel >= RISK_LEVELS.WARNING && timeSinceLastVoiceSec >= CONFIG.fusion.voiceAlertCooldownSec) {
      lastVoiceAlertTime = driverFeatures.t;
    }
  }

  const nextState: RiskEngineState = {
    currentLevel: newLevel,
    levelStartTime,
    candidateDowngradeLevel,
    candidateDowngradeStartTime,
    vehicleAnomalyStartTime,
    vehicleAnomalyActive,
    lastAlertTime,
    lastVoiceAlertTime,
    lastAssessment: assessment,
  };

  return {
    assessment,
    state: nextState,
    alert,
  };
}
