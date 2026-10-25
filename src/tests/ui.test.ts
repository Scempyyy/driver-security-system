import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useNeuroDriveStore } from '../ui/store';
import { alertDispatcher } from '../io/speech/alertDispatcher';
import { alertAudioPlayer } from '../io/speech/audioPlayer';
import { RISK_LEVELS, Alert } from '../core/types';
import { CONFIG, DEFAULT_BASELINE_PROFILE } from '../core/config';

describe('UI Store & State Management (M4)', () => {
  beforeEach(() => {
    // Reset store to initial state
    useNeuroDriveStore.setState({
      alertHistory: [],
      riskHistory: [],
      calibrationStatus: 'idle',
      calibrationMode: 'demo_15s',
      simulatorPreset: 'NORMAL',
      audioMuted: false,
      voiceEnabled: true,
      selectedAlertForInspection: null,
      activeBaseline: DEFAULT_BASELINE_PROFILE,
    });
  });

  it('updates driver features correctly', () => {
    const store = useNeuroDriveStore.getState();
    store.updateDriverFeatures({ ear: 0.18, longClosureSec: 1.5 });

    const updated = useNeuroDriveStore.getState().driverFeatures;
    expect(updated.ear).toBe(0.18);
    expect(updated.longClosureSec).toBe(1.5);
  });

  it('updates vehicle features and sets simulator preset', () => {
    const store = useNeuroDriveStore.getState();
    store.setSimulatorPreset('BRAKE_JUDDER');

    const updated = useNeuroDriveStore.getState();
    expect(updated.simulatorPreset).toBe('BRAKE_JUDDER');
    expect(updated.vehicleFeatures.vibrationRms).toBe(0.62);
    expect(updated.vehicleFeatures.audioAnomaly).toBe(0.55);
    expect(updated.vehicleFeatures.source).toBe('simulated');
  });

  it('records risk assessment and appends to risk history', () => {
    const store = useNeuroDriveStore.getState();
    const mockAssessment = {
      t: Date.now(),
      driverRisk: 0.6,
      vehicleRisk: 0.4,
      fusedRisk: 0.55,
      level: RISK_LEVELS.WARNING,
      confidence: 0.9,
      factors: [
        {
          id: 'test_factor',
          label: 'Test Factor',
          contribution: 0.5,
          evidence: 'Test evidence 1.0',
        },
      ],
      explanation: 'Test risk explanation',
      compoundEscalation: false,
    };

    store.setRiskAssessment(mockAssessment);

    const state = useNeuroDriveStore.getState();
    expect(state.riskAssessment.level).toBe(RISK_LEVELS.WARNING);
    expect(state.riskHistory.length).toBeGreaterThan(0);
    expect(state.riskHistory[state.riskHistory.length - 1].fusedRisk).toBe(0.55);
  });

  it('stores alerts in alertHistory and manages acknowledgment', () => {
    const store = useNeuroDriveStore.getState();
    const mockAlert: Alert = {
      id: 'alert_123',
      t: Date.now(),
      level: RISK_LEVELS.CRITICAL,
      assessment: {
        t: Date.now(),
        driverRisk: 0.8,
        vehicleRisk: 0.7,
        fusedRisk: 0.85,
        level: RISK_LEVELS.CRITICAL,
        confidence: 0.95,
        factors: [],
        explanation: 'Critical microsleep alert',
        compoundEscalation: true,
      },
      acknowledged: false,
    };

    store.addAlert(mockAlert);
    expect(useNeuroDriveStore.getState().alertHistory.length).toBe(1);
    expect(useNeuroDriveStore.getState().alertHistory[0].acknowledged).toBe(false);

    store.acknowledgeAlert('alert_123');
    expect(useNeuroDriveStore.getState().alertHistory[0].acknowledged).toBe(true);
  });

  it('handles calibration lifecycle: start, tick, complete, reset', () => {
    const store = useNeuroDriveStore.getState();
    store.startCalibration('demo_15s');

    let state = useNeuroDriveStore.getState();
    expect(state.calibrationStatus).toBe('calibrating');
    expect(state.calibrationMode).toBe('demo_15s');
    expect(state.calibrationCountdownSec).toBe(CONFIG.calibration.demoDurationSec);

    store.tickCalibration(10, 33);
    state = useNeuroDriveStore.getState();
    expect(state.calibrationCountdownSec).toBe(10);
    expect(state.calibrationProgress).toBe(33);

    const calibratedProfile = {
      ...DEFAULT_BASELINE_PROFILE,
      id: 'custom_baseline',
      earOpenBaseline: 0.32,
      earThreshold: 0.24,
    };
    store.completeCalibration(calibratedProfile);

    state = useNeuroDriveStore.getState();
    expect(state.calibrationStatus).toBe('complete');
    expect(state.activeBaseline.earOpenBaseline).toBe(0.32);
    expect(state.activeBaseline.earThreshold).toBe(0.24);
  });
});

describe('Tiered Alert Dispatcher (M4)', () => {
  beforeEach(() => {
    alertDispatcher.resetCooldown();
    vi.restoreAllMocks();
  });

  it('does not play audio or speech on NORMAL level', async () => {
    const spy = vi.spyOn(alertAudioPlayer, 'playAlert').mockResolvedValue();
    await alertDispatcher.dispatch(RISK_LEVELS.NORMAL);
    expect(spy).not.toHaveBeenCalled();
  });

  it('dispatches NOTICE alert without speech', async () => {
    const spy = vi.spyOn(alertAudioPlayer, 'playAlert').mockResolvedValue();
    await alertDispatcher.dispatch(RISK_LEVELS.NOTICE);
    expect(spy).toHaveBeenCalledWith(
      RISK_LEVELS.NOTICE,
      expect.objectContaining({
        enableVoice: false,
      })
    );
  });

  it('dispatches WARNING alert with warning spoken text', async () => {
    const spy = vi.spyOn(alertAudioPlayer, 'playAlert').mockResolvedValue();
    await alertDispatcher.dispatch(RISK_LEVELS.WARNING, { voiceEnabled: true });
    expect(spy).toHaveBeenCalledWith(
      RISK_LEVELS.WARNING,
      expect.objectContaining({
        spokenText: 'Warning: driver drowsiness detected',
        enableVoice: true,
      })
    );
  });

  it('dispatches CRITICAL alert with urgent spoken text', async () => {
    const spy = vi.spyOn(alertAudioPlayer, 'playAlert').mockResolvedValue();
    await alertDispatcher.dispatch(RISK_LEVELS.CRITICAL, { voiceEnabled: true });
    expect(spy).toHaveBeenCalledWith(
      RISK_LEVELS.CRITICAL,
      expect.objectContaining({
        spokenText: 'Critical: pull over safely',
        enableVoice: true,
      })
    );
  });

  it('respects muted option and suppresses alert audio', async () => {
    const spy = vi.spyOn(alertAudioPlayer, 'playAlert').mockResolvedValue();
    await alertDispatcher.dispatch(RISK_LEVELS.WARNING, { muted: true });
    expect(spy).not.toHaveBeenCalled();
  });

  it('enforces speech cooldown to prevent voice spam', async () => {
    const spy = vi.spyOn(alertAudioPlayer, 'playAlert').mockResolvedValue();

    // First call speaks
    await alertDispatcher.dispatch(RISK_LEVELS.WARNING, { voiceEnabled: true });
    expect(spy).toHaveBeenLastCalledWith(
      RISK_LEVELS.WARNING,
      expect.objectContaining({
        enableVoice: true,
      })
    );

    // Immediate second call at same level should suppress speech due to cooldown
    await alertDispatcher.dispatch(RISK_LEVELS.WARNING, { voiceEnabled: true });
    expect(spy).toHaveBeenLastCalledWith(
      RISK_LEVELS.WARNING,
      expect.objectContaining({
        enableVoice: false,
      })
    );
  });
});
