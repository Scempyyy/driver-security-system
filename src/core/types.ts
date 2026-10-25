/**
 * Core type definitions for NeuroDrive AI.
 * Strict TypeScript types with zero DOM or browser API dependencies.
 */

export type RiskLevel = 0 | 1 | 2 | 3;

export const RISK_LEVELS = {
  NORMAL: 0 as RiskLevel,
  NOTICE: 1 as RiskLevel,
  WARNING: 2 as RiskLevel,
  CRITICAL: 3 as RiskLevel,
} as const;

export type RiskLevelName = 'NORMAL' | 'NOTICE' | 'WARNING' | 'CRITICAL';

export interface DriverFeatures {
  t: number;                // monotonic timestamp in milliseconds
  faceDetected: boolean;
  quality: number;          // 0.0 to 1.0 confidence/quality score
  ear: number;              // Eye Aspect Ratio (average of left and right)
  perclos60: number;        // PERCLOS ratio over active window (0.0 to 1.0)
  blinkRate: number;        // Estimated blinks per minute
  longClosureSec: number;   // Continuous eye closure duration in seconds
  mar: number;              // Mouth Aspect Ratio
  yawning: boolean;         // True if sustained mouth opening exceeds yawn criteria
  headPitch: number;        // Degrees: positive = downward tilt (nod), negative = upward
  headYaw: number;          // Degrees: positive = turned right, negative = turned left
  headRoll: number;         // Degrees: positive = tilt right, negative = tilt left
  eyesOffRoadSec: number;   // Elapsed seconds looking away from road
  slowBlinks60s?: number;   // Count of slow blinks (closure >= 0.4s) in last 60s
  recentYawnCount?: number; // Count of confirmed yawns in rolling window
}

export type VehicleSignalSource = 'sensor' | 'simulated';

export interface VehicleFeatures {
  t: number;                // timestamp in ms
  source: VehicleSignalSource;
  vibrationRms: number;     // Accelerometer RMS magnitude (m/s^2)
  vibrationAnomaly: number; // 0.0 to 1.0 anomaly score
  audioRms: number;         // RMS audio energy (normalized 0.0 to 1.0)
  audioAnomaly: number;     // 0.0 to 1.0 anomaly score
  audioBands: [number, number, number]; // Low, Mid, High band energies (RMS bars)
}

export interface Factor {
  id: string;               // e.g. 'long_eye_closure', 'perclos_high', 'brake_vibration'
  label: string;            // Human-readable title e.g. 'Prolonged Eye Closure'
  contribution: number;     // 0.0 to 1.0 contribution weight to final risk
  evidence: string;         // Real numeric evidence string, e.g. "Eyes closed 2.1 s"
}

export interface RiskAssessment {
  t: number;
  driverRisk: number;       // 0.0 to 1.0
  vehicleRisk: number;      // 0.0 to 1.0
  fusedRisk: number;        // 0.0 to 1.0
  level: RiskLevel;
  confidence: number;       // 0.0 to 1.0
  factors: Factor[];
  explanation: string;
  compoundEscalation: boolean; // True if vehicle + driver compound triggered level bump
}

export interface Alert {
  id: string;
  t: number;
  level: RiskLevel;
  assessment: RiskAssessment;
  acknowledged: boolean;
}

export type CalibrationMode = 'demo_15s' | 'full_60s';

export interface PersonalBaseline {
  id: string;
  calibratedAt: number;     // Epoch timestamp in ms
  mode: CalibrationMode;
  earOpenBaseline: number;  // Calibrated open eye EAR
  earThreshold: number;     // Derived closure threshold (e.g. earOpenBaseline * multiplier)
  marClosedBaseline: number;// Normal closed mouth MAR
  headPitchOffset: number;  // Neutral head pitch offset
  headYawOffset: number;    // Neutral head yaw offset
  normalBlinkRate: number;  // Baseline blinks/min
  vibrationBaselineRms: number;
  audioBaselineRms: number;
  isComplete: boolean;
}

export type VehicleScenarioPreset = 'NORMAL' | 'BRAKE_JUDDER' | 'ENGINE_KNOCK' | 'RUMBLE_STRIP';

export interface VolumeSettings {
  masterVolume: number; // 0 to 100%
  soundVolume: number;  // 0 to 100%
  voiceVolume: number;  // 0 to 100%
  muted: boolean;
}
