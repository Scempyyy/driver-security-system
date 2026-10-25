import { describe, it, expect, beforeEach } from 'vitest';
import { CONFIG } from '../core/config';
import { useNeuroDriveStore } from '../ui/store';
import { alertAudioPlayer } from '../io/speech/audioPlayer';
import { alertDispatcher } from '../io/speech/alertDispatcher';
import { RISK_LEVELS } from '../core/types';

describe('Volume, Silence Alarm & Audio Controls Unit Suite', () => {
  const memoryStore = new Map<string, string>();

  beforeEach(() => {
    memoryStore.clear();
    // Polyfill global window.localStorage for vitest node environment
    if (typeof window === 'undefined' || !window.localStorage) {
      const mockStorage = {
        getItem: (k: string) => memoryStore.get(k) ?? null,
        setItem: (k: string, v: string) => { memoryStore.set(k, v); },
        removeItem: (k: string) => { memoryStore.delete(k); },
        clear: () => { memoryStore.clear(); },
      };
      // @ts-expect-error test mock
      globalThis.window = { ...(globalThis.window || {}), localStorage: mockStorage };
      // @ts-expect-error test mock
      globalThis.localStorage = mockStorage;
    } else {
      window.localStorage.clear();
    }

    useNeuroDriveStore.getState().unSilenceAlarm();
    useNeuroDriveStore.getState().setVolumeSettings({
      masterVolume: 70,
      soundVolume: 100,
      voiceVolume: 100,
      muted: false,
    });
  });

  it('1. Default volume settings are loaded correctly from config', () => {
    const state = useNeuroDriveStore.getState();
    expect(state.volumeSettings.masterVolume).toBe(CONFIG.volume.defaultMasterVolume);
    expect(state.volumeSettings.soundVolume).toBe(CONFIG.volume.defaultSoundVolume);
    expect(state.volumeSettings.voiceVolume).toBe(CONFIG.volume.defaultVoiceVolume);
    expect(state.volumeSettings.muted).toBe(false);
  });

  it('2. Volume changes update store and clamp between 0 and 100', () => {
    const store = useNeuroDriveStore.getState();

    store.setVolumeSettings({ masterVolume: 45, soundVolume: 80, voiceVolume: 90 });
    expect(useNeuroDriveStore.getState().volumeSettings.masterVolume).toBe(45);
    expect(useNeuroDriveStore.getState().volumeSettings.soundVolume).toBe(80);
    expect(useNeuroDriveStore.getState().volumeSettings.voiceVolume).toBe(90);

    // Test clamping values outside 0-100
    store.setVolumeSettings({ masterVolume: 150, soundVolume: -20 });
    expect(useNeuroDriveStore.getState().volumeSettings.masterVolume).toBe(100);
    expect(useNeuroDriveStore.getState().volumeSettings.soundVolume).toBe(0);
  });

  it('3. Volume changes persist in localStorage under neurodrive_volume_settings_v1', () => {
    const store = useNeuroDriveStore.getState();
    store.setVolumeSettings({ masterVolume: 65, muted: true });

    const raw = (typeof window !== 'undefined' && window.localStorage)
      ? window.localStorage.getItem(CONFIG.volume.storageKey)
      : memoryStore.get(CONFIG.volume.storageKey);

    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.masterVolume).toBe(65);
    expect(parsed.muted).toBe(true);
  });

  it('4. Silence alarm action marks alerts acknowledged and sets silencedLevel', () => {
    const store = useNeuroDriveStore.getState();
    // Simulate active warning alert
    store.setRiskAssessment({
      t: Date.now(),
      driverRisk: 0.70,
      vehicleRisk: 0.0,
      fusedRisk: 0.70,
      level: RISK_LEVELS.WARNING,
      confidence: 0.95,
      factors: [],
      explanation: 'Warning active',
      compoundEscalation: false,
    });
    store.addAlert({
      id: 'alert_1',
      t: Date.now(),
      level: RISK_LEVELS.WARNING,
      assessment: store.riskAssessment,
      acknowledged: false,
    });

    expect(useNeuroDriveStore.getState().silencedLevel).toBeNull();
    expect(useNeuroDriveStore.getState().alertHistory[0].acknowledged).toBe(false);

    // User presses Silence Alarm
    store.silenceAlarm();

    expect(useNeuroDriveStore.getState().silencedLevel).toBe(RISK_LEVELS.WARNING);
    expect(useNeuroDriveStore.getState().alertHistory[0].acknowledged).toBe(true);

    // Audio/speech dispatcher suppresses audio when silenced
    let played = false;
    alertAudioPlayer.playAlert = async () => {
      played = true;
    };

    alertDispatcher.dispatch(RISK_LEVELS.WARNING, {
      volumeSettings: useNeuroDriveStore.getState().volumeSettings,
      silencedLevel: useNeuroDriveStore.getState().silencedLevel,
    });

    expect(played).toBe(false);

    // Escalation re-arms alarm
    store.unSilenceAlarm();
    expect(useNeuroDriveStore.getState().silencedLevel).toBeNull();
  });
});
