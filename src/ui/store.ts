import { create } from 'zustand';
import {
  DriverFeatures,
  VehicleFeatures,
  RiskAssessment,
  Alert,
  PersonalBaseline,
  CalibrationMode,
  VehicleScenarioPreset,
  RISK_LEVELS,
} from '../core/types';
import { DEFAULT_BASELINE_PROFILE, CONFIG } from '../core/config';

export type CalibrationStatus = 'idle' | 'calibrating' | 'complete';

export interface NeuroDriveStore {
  // Live Signals
  driverFeatures: DriverFeatures;
  vehicleFeatures: VehicleFeatures;
  riskAssessment: RiskAssessment;
  alertHistory: Alert[];
  riskHistory: Array<{
    t: number;
    driverRisk: number;
    vehicleRisk: number;
    fusedRisk: number;
  }>;

  // Calibration State
  calibrationStatus: CalibrationStatus;
  calibrationMode: CalibrationMode;
  calibrationProgress: number; // 0 to 100 percentage
  calibrationCountdownSec: number;
  activeBaseline: PersonalBaseline;

  // Vehicle Simulator State
  simulatorPreset: VehicleScenarioPreset;
  simulatedVibrationRms: number;
  simulatedAudioAnomaly: number;

  // System & Audio Settings
  audioMuted: boolean;
  voiceEnabled: boolean;
  selectedAlertForInspection: Alert | null;

  // Actions - Live State Updates
  updateDriverFeatures: (features: Partial<DriverFeatures>) => void;
  updateVehicleFeatures: (features: Partial<VehicleFeatures>) => void;
  setRiskAssessment: (assessment: RiskAssessment) => void;
  addAlert: (alert: Alert) => void;
  acknowledgeAlert: (alertId: string) => void;
  clearAlerts: () => void;
  setSelectedAlertForInspection: (alert: Alert | null) => void;

  // Actions - Calibration
  startCalibration: (mode: CalibrationMode) => void;
  tickCalibration: (remainingSec: number, progressPct: number) => void;
  completeCalibration: (baseline: PersonalBaseline) => void;
  cancelCalibration: () => void;
  loadSavedBaseline: () => void;
  resetToDefaultBaseline: () => void;

  // Actions - Vehicle Simulator
  setSimulatorPreset: (preset: VehicleScenarioPreset) => void;
  setManualSimulatedSignals: (vibrationRms: number, audioAnomaly: number) => void;

  // Actions - Settings
  setAudioMuted: (muted: boolean) => void;
  setVoiceEnabled: (enabled: boolean) => void;
}

const initialDriverFeatures: DriverFeatures = {
  t: Date.now(),
  faceDetected: false,
  quality: 0.0,
  ear: 0.0,
  perclos60: 0.0,
  blinkRate: 0,
  longClosureSec: 0.0,
  mar: 0.0,
  yawning: false,
  headPitch: 0.0,
  headYaw: 0.0,
  headRoll: 0.0,
  eyesOffRoadSec: 0.0,
};

const initialVehicleFeatures: VehicleFeatures = {
  t: Date.now(),
  source: 'simulated',
  vibrationRms: CONFIG.vehicle.normalVibrationRms,
  vibrationAnomaly: 0.0,
  audioRms: CONFIG.vehicle.normalAudioRms,
  audioAnomaly: 0.0,
  audioBands: [0.12, 0.08, 0.05],
};

const initialRiskAssessment: RiskAssessment = {
  t: Date.now(),
  driverRisk: 0.05,
  vehicleRisk: 0.02,
  fusedRisk: 0.04,
  level: RISK_LEVELS.NORMAL,
  confidence: 0.95,
  factors: [
    {
      id: 'eyes_open_nominal',
      label: 'Eyes Alert & Focused',
      contribution: 0.05,
      evidence: 'EAR 0.28 (Nominal baseline)',
    },
  ],
  explanation: 'Driver alert with eyes focused on the road. Vehicle telemetry normal.',
  compoundEscalation: false,
};

export const useNeuroDriveStore = create<NeuroDriveStore>((set) => ({
  driverFeatures: initialDriverFeatures,
  vehicleFeatures: initialVehicleFeatures,
  riskAssessment: initialRiskAssessment,
  alertHistory: [],
  riskHistory: [
    {
      t: Date.now(),
      driverRisk: 0.05,
      vehicleRisk: 0.02,
      fusedRisk: 0.04,
    },
  ],

  calibrationStatus: 'idle',
  calibrationMode: 'demo_15s',
  calibrationProgress: 0,
  calibrationCountdownSec: CONFIG.calibration.demoDurationSec,
  activeBaseline: (() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem(CONFIG.calibration.storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.isComplete) return parsed as PersonalBaseline;
        }
      }
    } catch {
      // Fallback
    }
    return DEFAULT_BASELINE_PROFILE;
  })(),

  simulatorPreset: 'NORMAL',
  simulatedVibrationRms: CONFIG.vehicle.normalVibrationRms,
  simulatedAudioAnomaly: 0.0,

  audioMuted: false,
  voiceEnabled: true,
  selectedAlertForInspection: null,

  updateDriverFeatures: (features) =>
    set((state) => ({
      driverFeatures: { ...state.driverFeatures, ...features, t: features.t ?? Date.now() },
    })),

  updateVehicleFeatures: (features) =>
    set((state) => ({
      vehicleFeatures: { ...state.vehicleFeatures, ...features, t: features.t ?? Date.now() },
    })),

  setRiskAssessment: (assessment) =>
    set((state) => {
      const now = assessment.t || Date.now();
      const cutoff = now - CONFIG.ui.riskTimelineWindowSec * 1000;
      const filtered = state.riskHistory.filter((item) => item.t >= cutoff);
      filtered.push({
        t: now,
        driverRisk: assessment.driverRisk,
        vehicleRisk: assessment.vehicleRisk,
        fusedRisk: assessment.fusedRisk,
      });

      return {
        riskAssessment: assessment,
        riskHistory: filtered,
      };
    }),

  addAlert: (alert) =>
    set((state) => ({
      // Keep last 50 alerts in history
      alertHistory: [alert, ...state.alertHistory].slice(0, 50),
    })),

  acknowledgeAlert: (alertId) =>
    set((state) => ({
      alertHistory: state.alertHistory.map((a) =>
        a.id === alertId ? { ...a, acknowledged: true } : a
      ),
    })),

  clearAlerts: () => set({ alertHistory: [] }),

  setSelectedAlertForInspection: (alert) => set({ selectedAlertForInspection: alert }),

  startCalibration: (mode) => {
    const duration =
      mode === 'demo_15s'
        ? CONFIG.calibration.demoDurationSec
        : CONFIG.calibration.fullDurationSec;
    set({
      calibrationStatus: 'calibrating',
      calibrationMode: mode,
      calibrationProgress: 0,
      calibrationCountdownSec: duration,
    });
  },

  tickCalibration: (remainingSec, progressPct) =>
    set({
      calibrationCountdownSec: remainingSec,
      calibrationProgress: progressPct,
    }),

  completeCalibration: (baseline) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(CONFIG.calibration.storageKey, JSON.stringify(baseline));
      }
    } catch (e) {
      console.warn('Failed to save baseline to localStorage:', e);
    }
    set({
      calibrationStatus: 'complete',
      calibrationProgress: 100,
      calibrationCountdownSec: 0,
      activeBaseline: baseline,
    });
  },

  cancelCalibration: () =>
    set({
      calibrationStatus: 'idle',
      calibrationProgress: 0,
    }),

  loadSavedBaseline: () => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem(CONFIG.calibration.storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.isComplete) {
            set({
              activeBaseline: parsed as PersonalBaseline,
              calibrationStatus: 'complete',
            });
            return;
          }
        }
      }
    } catch {
      // Ignore
    }
    set({
      activeBaseline: DEFAULT_BASELINE_PROFILE,
      calibrationStatus: 'complete',
    });
  },

  resetToDefaultBaseline: () => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(CONFIG.calibration.storageKey);
      }
    } catch {
      // Ignore
    }
    set({
      activeBaseline: DEFAULT_BASELINE_PROFILE,
      calibrationStatus: 'idle',
    });
  },

  setSimulatorPreset: (preset) => {
    let vibRms: number = CONFIG.vehicle.normalVibrationRms;
    let audioAnomaly = 0.0;
    let bands: [number, number, number] = [0.1, 0.08, 0.05];

    switch (preset) {
      case 'BRAKE_JUDDER':
        vibRms = 0.62;
        audioAnomaly = 0.55;
        bands = [0.72, 0.45, 0.15];
        break;
      case 'ENGINE_KNOCK':
        vibRms = 0.48;
        audioAnomaly = 0.78;
        bands = [0.85, 0.62, 0.28];
        break;
      case 'RUMBLE_STRIP':
        vibRms = 0.88;
        audioAnomaly = 0.70;
        bands = [0.92, 0.78, 0.40];
        break;
      case 'NORMAL':
      default:
        vibRms = CONFIG.vehicle.normalVibrationRms;
        audioAnomaly = 0.0;
        bands = [0.12, 0.08, 0.05];
        break;
    }

    set((state) => ({
      simulatorPreset: preset,
      simulatedVibrationRms: vibRms,
      simulatedAudioAnomaly: audioAnomaly,
      vehicleFeatures: {
        ...state.vehicleFeatures,
        source: 'simulated',
        vibrationRms: vibRms,
        vibrationAnomaly: preset === 'NORMAL' ? 0.0 : Math.min(1.0, vibRms / 0.8),
        audioAnomaly,
        audioBands: bands,
        t: Date.now(),
      },
    }));
  },

  setManualSimulatedSignals: (vibrationRms, audioAnomaly) =>
    set((state) => ({
      simulatedVibrationRms: vibrationRms,
      simulatedAudioAnomaly: audioAnomaly,
      vehicleFeatures: {
        ...state.vehicleFeatures,
        source: 'simulated',
        vibrationRms,
        vibrationAnomaly:
          vibrationRms > CONFIG.vehicle.vibrationAnomalyThreshold ? Math.min(1.0, (vibrationRms - CONFIG.vehicle.vibrationAnomalyThreshold) * 2) : 0,
        audioAnomaly,
        t: Date.now(),
      },
    })),

  setAudioMuted: (muted) => set({ audioMuted: muted }),
  setVoiceEnabled: (enabled) => set({ voiceEnabled: enabled }),
}));
