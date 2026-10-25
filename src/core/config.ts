/**
 * NeuroDrive AI Central Configuration
 * ALL thresholds, weights, windows, and timings live here.
 * No magic numbers elsewhere in the codebase.
 */

import { PersonalBaseline, RiskLevel, RISK_LEVELS } from './types';

export const CONFIG = {
  // ── Calibration & Windows ───────────────────────────────────────────────────
  calibration: {
    demoDurationSec: 15,            // Fast 15 s calibration for quick demos
    fullDurationSec: 60,            // Thorough 60 s calibration
    earMultiplier: 0.75,            // threshold = open_ear_baseline * 0.75
    minEarThreshold: 0.16,          // Absolute floor for EAR threshold
    maxEarThreshold: 0.35,          // Absolute ceiling for EAR threshold
    storageKey: 'neurodrive_baseline_profile_v1',
  },

  perclos: {
    demoWindowSec: 25,              // Configurable demo window (20-30s for rapid demonstration)
    defaultWindowSec: 60,           // Standard 60s window
    noticeThreshold: 0.15,          // 15% eye closure in window = NOTICE
    warningThreshold: 0.25,         // 25% eye closure in window = WARNING
    criticalThreshold: 0.40,        // 40% eye closure in window = CRITICAL
  },

  driver: {
    earSmoothingFrames: 4,          // Number of frames for EAR moving average smoothing
    earFallbackBaseline: 0.28,      // Used when uncalibrated
    earFallbackThreshold: 0.21,     // Fallback closure threshold if no baseline

    // 1. Continuous Eye Closure Rules
    // Ordinary blinks under 0.5s are ignored completely
    longClosureNoticeSec: 2.0,       // Sustained closure >= 2.0s -> NOTICE (silent)
    longClosureCriticalSec: 5.0,     // Sustained closure >= 5.0s -> CRITICAL

    // Slow Blink Rules (ordinary blinks < 0.4s are ignored; normal rate 15-20/min)
    slowBlinkDurationSec: 0.40,      // Eye closure duration >= 0.40s qualifies as a slow blink
    slowBlinkWindowSec: 60,          // Rolling window to count slow blinks
    slowBlinkPatternNoticeCount: 3,  // >= 3 slow blinks in 60s indicates pattern starting -> NOTICE
    slowBlinkWarningCount: 10,       // 10 slow blinks in 60s -> WARNING (voice + chime)

    // 4. Head Yaw Attention Rules (HEAD YAW ONLY, iris ignored for alert)
    headYawSmoothingFrames: 5,       // Number of frames for head yaw moving average smoothing
    headYawOffRoadDeg: 25.0,         // Head turned > 25° from calibrated forward
    glanceIgnoreSec: 1.5,            // Glances shorter than 1.5s completely ignored (mirror checks)
    headYawNoticeSec: 3.0,           // Head turned > 25° for >= 3.0s -> NOTICE
    headYawWarningSec: 6.0,          // Head turned > 25° for >= 6.0s -> WARNING

    // 5. Yawn Detection Rules
    marYawnThreshold: 0.60,          // MAR above this indicates mouth open
    yawnMinDurationSec: 1.5,         // Mouth must be open continuously >= 1.5s (not talking/laughing)
    yawnNoticeCount: 3,              // 3 yawns within window trigger silent NOTICE
    yawnWindowDemoSec: 120,          // 2 minutes window for 3 yawns in demo mode
    yawnWindowFullSec: 600,          // 10 minutes window for 3 yawns in normal mode

    headPitchNodDropDeg: 15.0,       // Pitch drop > 15 deg from baseline = nod
    headNodMinDurationSec: 1.2,      // Must persist 1.2s to count as nod
    
    blinkRateLowThreshold: 10,       // < 10 blinks/min suggests drowsiness
    blinkRateHighThreshold: 32,      // > 32 blinks/min suggests fatigue flutter
    
    minQualityConfidence: 0.40,      // Face detection quality below 0.40 triggers low confidence
  },

  voice: {
    // 2. Short, natural sentences with no colons, symbols, or numbers
    noticeSpokenText: '',                                            // NOTICE: silent
    warningSpokenText: 'You seem drowsy. Please take a break soon.', // WARNING
    criticalSpokenText: 'Pull over safely.',                         // CRITICAL
    speechRate: 0.95,
    speechChimeDelayMs: 500,         // Play chime first, speak after ~0.5s
    speechRepeatIntervalSec: 20,     // Repeat voice at most every 20s while level persists
  },

  volume: {
    // Volume popup and persistence
    storageKey: 'neurodrive_volume_settings_v1',
    defaultMasterVolume: 70,         // 0 to 100%
    defaultSoundVolume: 100,         // 0 to 100%
    defaultVoiceVolume: 100,         // 0 to 100%
    defaultMuted: false,
  },

  vehicle: {
    normalVibrationRms: 0.12,        // Normal idle/smooth driving vibration (m/s^2)
    vibrationAnomalyThreshold: 0.45, // Vibration RMS exceeding this triggers anomaly score
    normalAudioRms: 0.08,            // Ambient cabin noise RMS
    audioAnomalyThreshold: 0.35,     // Cabin noise exceeding this triggers anomaly score
    anomalyPersistenceSec: 1.5,      // Vehicle anomaly must persist for 1.5s to influence risk
  },

  fusion: {
    // Risk score thresholds mapping 0.0-1.0 fused risk to 4 levels
    riskLevels: {
      notice: 0.28,
      warning: 0.58,
      critical: 0.82,
    },
    
    // Weights for composite driver risk (sum to 1.0)
    driverWeights: {
      longClosure: 0.35,
      perclos: 0.30,
      yawn: 0.15,
      headNod: 0.10,
      attentionDrift: 0.10,
    },
    
    // Weights for compounding driver + vehicle
    compoundDriverWeight: 0.65,
    compoundVehicleWeight: 0.35,
    
    // Escalation rule: active vehicle anomaly bumps risk level if driver >= NOTICE
    compoundEscalationMinDriverLevel: RISK_LEVELS.NOTICE as RiskLevel,
    
    // Low confidence caps alert level at NOTICE
    lowConfidenceCapLevel: RISK_LEVELS.NOTICE as RiskLevel,
    
    // Hysteresis & Cooldowns
    hysteresisHoldSec: 3.0,          // Must stay below lower threshold for 3s before downgrading level
    alertCooldownSec: 4.5,           // Minimum seconds between repeated audible alerts
    voiceAlertCooldownSec: 20.0,     // Repeat voice at most every 20s while level persists
  },

  ui: {
    throttleFps: 10,                 // Throttle dashboard UI state updates to 10 Hz
    riskTimelineWindowSec: 60,       // Show last 60 seconds of risk history on chart
    audioBandsCount: 3,              // Low, Mid, High simple band bars
  },
} as const;

/**
 * Default fallback personal baseline profile
 * Allows the user or demo to skip calibration or recover instantly.
 */
export const DEFAULT_BASELINE_PROFILE: PersonalBaseline = {
  id: 'default_calibrated_profile',
  calibratedAt: 0,
  mode: 'demo_15s',
  earOpenBaseline: 0.28,
  earThreshold: 0.21,
  marClosedBaseline: 0.22,
  headPitchOffset: 0.0,
  headYawOffset: 0.0,
  normalBlinkRate: 18,
  vibrationBaselineRms: 0.12,
  audioBaselineRms: 0.08,
  isComplete: true,
};
