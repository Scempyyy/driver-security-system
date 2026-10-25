/**
 * Vehicle Signal Manager
 * Coordinates between real physical sensors (DeviceMotion + Web Audio)
 * and the Vehicle Signal Simulator.
 * Provides unified VehicleFeatures output stream with seamless fallback.
 */

import { PersonalBaseline, VehicleFeatures, VehicleScenarioPreset, VehicleSignalSource } from '../types';
import { VehicleSimulator } from './simulator';
import { VehicleScorer, VehicleAnomalyScores } from './vehicleScorer';
import { MotionMonitor, MotionSample } from '../../io/motion/motionMonitor';
import { AudioMonitor, AudioSample } from '../../io/audio/audioMonitor';

export type VehicleFeaturesCallback = (features: VehicleFeatures, scores: VehicleAnomalyScores) => void;

export class VehicleManager {
  private source: VehicleSignalSource = 'simulated';
  private simulator: VehicleSimulator;
  private scorer: VehicleScorer;
  private motionMonitor: MotionMonitor;
  private audioMonitor: AudioMonitor;
  private baseline: PersonalBaseline | null = null;
  private callbacks: Set<VehicleFeaturesCallback> = new Set();
  private pollIntervalId: ReturnType<typeof setInterval> | null = null;
  private unsubscribeMotion: (() => void) | null = null;
  private unsubscribeAudio: (() => void) | null = null;

  // Sensor cache
  private latestMotion: MotionSample | null = null;
  private latestAudio: AudioSample | null = null;

  constructor(options?: {
    initialSource?: VehicleSignalSource;
    initialPreset?: VehicleScenarioPreset;
    persistenceSec?: number;
    baseline?: PersonalBaseline | null;
  }) {
    this.source = options?.initialSource ?? 'simulated';
    this.simulator = new VehicleSimulator(options?.initialPreset ?? 'NORMAL');
    this.scorer = new VehicleScorer(options?.persistenceSec);
    this.motionMonitor = new MotionMonitor();
    this.audioMonitor = new AudioMonitor();
    this.baseline = options?.baseline ?? null;
  }

  public getSource(): VehicleSignalSource {
    return this.source;
  }

  public getSimulator(): VehicleSimulator {
    return this.simulator;
  }

  public getScorer(): VehicleScorer {
    return this.scorer;
  }

  public setBaseline(baseline: PersonalBaseline | null): void {
    this.baseline = baseline;
  }

  /**
   * Switch source mode between 'sensor' and 'simulated'.
   * If switching to 'sensor' fails (unsupported or denied), falls back to 'simulated' and returns false.
   */
  public async setSource(newSource: VehicleSignalSource): Promise<boolean> {
    if (newSource === 'sensor') {
      const motionOk = await this.motionMonitor.start();
      const audioOk = await this.audioMonitor.start();

      if (!motionOk && !audioOk) {
        // Fallback to simulator if neither sensor is available
        this.source = 'simulated';
        return false;
      }

      this.source = 'sensor';
      this.bindSensors();
      return true;
    } else {
      this.source = 'simulated';
      this.unbindSensors();
      this.motionMonitor.stop();
      this.audioMonitor.stop();
      return true;
    }
  }

  /**
   * Starts periodic polling / feature dispatch (default 10 Hz matching UI target).
   */
  public start(intervalMs: number = 100): void {
    if (this.pollIntervalId) return;

    if (this.source === 'sensor') {
      this.bindSensors();
    }

    this.pollIntervalId = setInterval(() => {
      this.tick();
    }, intervalMs);
  }

  public stop(): void {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
    this.unbindSensors();
    this.motionMonitor.stop();
    this.audioMonitor.stop();
  }

  public subscribe(cb: VehicleFeaturesCallback): () => void {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  /**
   * Sample the current features and scores right now.
   */
  public getCurrentFeatures(nowMs: number = performance.now()): {
    features: VehicleFeatures;
    scores: VehicleAnomalyScores;
  } {
    let features: VehicleFeatures;

    if (this.source === 'simulated') {
      features = this.simulator.sample(nowMs, true);
    } else {
      const vib = this.latestMotion?.rms ?? 0.12;
      const aud = this.latestAudio?.rms ?? 0.08;
      const bands = this.latestAudio?.bands ?? [0.06, 0.08, 0.04];

      features = {
        t: nowMs,
        source: 'sensor',
        vibrationRms: vib,
        vibrationAnomaly: 0,
        audioRms: aud,
        audioAnomaly: 0,
        audioBands: bands,
      };
    }

    const scores = this.scorer.score(features, this.baseline);
    features.vibrationAnomaly = scores.vibrationAnomaly;
    features.audioAnomaly = scores.audioAnomaly;

    return { features, scores };
  }

  private tick(): void {
    const { features, scores } = this.getCurrentFeatures();
    for (const cb of this.callbacks) {
      try {
        cb(features, scores);
      } catch {
        // Ignore subscriber errors
      }
    }
  }

  private bindSensors(): void {
    if (!this.unsubscribeMotion) {
      this.unsubscribeMotion = this.motionMonitor.subscribe((sample) => {
        this.latestMotion = sample;
      });
    }
    if (!this.unsubscribeAudio) {
      this.unsubscribeAudio = this.audioMonitor.subscribe((sample) => {
        this.latestAudio = sample;
      });
    }
  }

  private unbindSensors(): void {
    if (this.unsubscribeMotion) {
      this.unsubscribeMotion();
      this.unsubscribeMotion = null;
    }
    if (this.unsubscribeAudio) {
      this.unsubscribeAudio();
      this.unsubscribeAudio = null;
    }
  }
}
