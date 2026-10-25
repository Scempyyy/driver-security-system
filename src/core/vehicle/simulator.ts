/**
 * Vehicle Signal Simulator
 * Generates simulated vehicle signals (vibration and audio) with manual controls
 * and predefined one-click scenario presets.
 */

import { VehicleFeatures, VehicleScenarioPreset } from '../types';

export interface SimulatorPresetConfig {
  vibrationRms: number;
  audioRms: number;
  audioBands: [number, number, number]; // [Low, Mid, High]
  oscillationFreqHz?: number;
  noiseAmplitude?: number;
}

export const SCENARIO_PRESETS: Record<VehicleScenarioPreset, SimulatorPresetConfig> = {
  NORMAL: {
    vibrationRms: 0.12,
    audioRms: 0.08,
    audioBands: [0.06, 0.08, 0.04],
    oscillationFreqHz: 0.5,
    noiseAmplitude: 0.02,
  },
  BRAKE_JUDDER: {
    vibrationRms: 0.85,
    audioRms: 0.45,
    audioBands: [0.60, 0.35, 0.15],
    oscillationFreqHz: 12.0, // rapid oscillation characteristic of rotor runout/judder
    noiseAmplitude: 0.08,
  },
  ENGINE_KNOCK: {
    vibrationRms: 0.55,
    audioRms: 0.72,
    audioBands: [0.30, 0.45, 0.85], // rhythmic high-frequency spike
    oscillationFreqHz: 8.0,
    noiseAmplitude: 0.10,
  },
  RUMBLE_STRIP: {
    vibrationRms: 1.10,
    audioRms: 0.65,
    audioBands: [0.90, 0.60, 0.40], // high low-end rumble
    oscillationFreqHz: 20.0,
    noiseAmplitude: 0.15,
  },
};

export interface SimulatorState {
  preset: VehicleScenarioPreset;
  vibrationRms: number;
  audioRms: number;
  audioBands: [number, number, number];
  oscillationFreqHz: number;
  noiseAmplitude: number;
}

export class VehicleSimulator {
  private state: SimulatorState;

  constructor(initialPreset: VehicleScenarioPreset = 'NORMAL') {
    const config = SCENARIO_PRESETS[initialPreset];
    this.state = {
      preset: initialPreset,
      vibrationRms: config.vibrationRms,
      audioRms: config.audioRms,
      audioBands: [...config.audioBands],
      oscillationFreqHz: config.oscillationFreqHz ?? 1.0,
      noiseAmplitude: config.noiseAmplitude ?? 0.05,
    };
  }

  public setPreset(preset: VehicleScenarioPreset): void {
    const config = SCENARIO_PRESETS[preset];
    this.state.preset = preset;
    this.state.vibrationRms = config.vibrationRms;
    this.state.audioRms = config.audioRms;
    this.state.audioBands = [...config.audioBands];
    this.state.oscillationFreqHz = config.oscillationFreqHz ?? 1.0;
    this.state.noiseAmplitude = config.noiseAmplitude ?? 0.05;
  }

  public setVibrationRms(value: number): void {
    this.state.vibrationRms = Math.max(0.0, Math.min(1.5, value));
  }

  public setAudioRms(value: number): void {
    this.state.audioRms = Math.max(0.0, Math.min(1.0, value));
  }

  public setAudioBands(bands: [number, number, number]): void {
    this.state.audioBands = [
      Math.max(0.0, Math.min(1.0, bands[0])),
      Math.max(0.0, Math.min(1.0, bands[1])),
      Math.max(0.0, Math.min(1.0, bands[2])),
    ];
  }

  public getState(): Readonly<SimulatorState> {
    return { ...this.state, audioBands: [...this.state.audioBands] };
  }

  /**
   * Generates a VehicleFeatures reading for the given timestamp (ms).
   * Note: vibrationAnomaly and audioAnomaly are initial estimates here (e.g. 0-1)
   * which can be scored/refined against a baseline by VehicleScorer.
   */
  public sample(timestampMs: number, addOscillation: boolean = false): VehicleFeatures {
    let vib = this.state.vibrationRms;
    let aud = this.state.audioRms;
    let bands: [number, number, number] = [
      this.state.audioBands[0],
      this.state.audioBands[1],
      this.state.audioBands[2],
    ];

    if (addOscillation) {
      const tSec = timestampMs / 1000.0;
      const wave = Math.sin(2 * Math.PI * this.state.oscillationFreqHz * tSec);
      const jitter = wave * this.state.noiseAmplitude;
      vib = Math.max(0.0, Math.min(1.5, vib + jitter));
      aud = Math.max(0.0, Math.min(1.0, aud + jitter * 0.5));
      bands = [
        Math.max(0.0, Math.min(1.0, bands[0] + jitter * 0.3)),
        Math.max(0.0, Math.min(1.0, bands[1] + jitter * 0.3)),
        Math.max(0.0, Math.min(1.0, bands[2] + jitter * 0.3)),
      ];
    }

    return {
      t: timestampMs,
      source: 'simulated',
      vibrationRms: Number(vib.toFixed(4)),
      vibrationAnomaly: 0, // default, will be populated by scorer or direct inspection
      audioRms: Number(aud.toFixed(4)),
      audioAnomaly: 0,
      audioBands: [
        Number(bands[0].toFixed(4)),
        Number(bands[1].toFixed(4)),
        Number(bands[2].toFixed(4)),
      ],
    };
  }
}
