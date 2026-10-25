/**
 * Vehicle Anomaly Scorer
 * Calculates vibrationAnomaly (0-1) and audioAnomaly (0-1) against personal/configured baseline.
 * Implements persistence tracking (signals must persist for >= anomalyPersistenceSec to trigger active flag).
 */

import { CONFIG } from '../config';
import { PersonalBaseline, VehicleFeatures } from '../types';

export interface VehicleAnomalyScores {
  vibrationAnomaly: number;  // 0.0 to 1.0 continuous severity
  audioAnomaly: number;      // 0.0 to 1.0 continuous severity
  vibrationActive: boolean;  // True if sustained past persistence window
  audioActive: boolean;      // True if sustained past persistence window
  combinedAnomaly: number;   // 0.0 to 1.0 combined vehicle anomaly score
  isAnomalyActive: boolean;  // True if either anomaly has persisted sufficiently
  vibrationDurationSec: number;
  audioDurationSec: number;
}

export class VehicleScorer {
  private vibExceededStartMs: number | null = null;
  private audioExceededStartMs: number | null = null;
  private persistenceSec: number;

  constructor(persistenceSec?: number) {
    this.persistenceSec = persistenceSec ?? CONFIG.vehicle.anomalyPersistenceSec;
  }

  /**
   * Resets internal persistence timers.
   */
  public reset(): void {
    this.vibExceededStartMs = null;
    this.audioExceededStartMs = null;
  }

  /**
   * Evaluates raw vehicle readings against baseline and tracks persistence.
   */
  public score(
    reading: { vibrationRms: number; audioRms: number; t: number },
    baseline?: PersonalBaseline | null
  ): VehicleAnomalyScores {
    const vibBase = baseline?.vibrationBaselineRms ?? CONFIG.vehicle.normalVibrationRms;
    const audBase = baseline?.audioBaselineRms ?? CONFIG.vehicle.normalAudioRms;

    // Thresholds: if baseline exists, use dynamic deviation, else config threshold
    const vibThreshold = Math.max(CONFIG.vehicle.vibrationAnomalyThreshold, vibBase * 2.5);
    const audioThreshold = Math.max(CONFIG.vehicle.audioAnomalyThreshold, audBase * 2.5);

    // Continuous 0.0-1.0 scoring
    // 0 when at or below baseline, scaling up to 1.0 when exceeding threshold
    const vibExcess = Math.max(0, reading.vibrationRms - vibBase);
    const vibRange = Math.max(0.01, vibThreshold - vibBase);
    const vibrationAnomaly = Math.min(1.0, Math.max(0.0, vibExcess / vibRange));

    const audExcess = Math.max(0, reading.audioRms - audBase);
    const audRange = Math.max(0.01, audioThreshold - audBase);
    const audioAnomaly = Math.min(1.0, Math.max(0.0, audExcess / audRange));

    // Persistence tracking
    // Vibration
    let vibDurationSec = 0;
    if (reading.vibrationRms >= vibThreshold) {
      if (this.vibExceededStartMs === null) {
        this.vibExceededStartMs = reading.t;
      }
      vibDurationSec = Math.max(0, (reading.t - this.vibExceededStartMs) / 1000.0);
    } else {
      this.vibExceededStartMs = null;
    }
    const vibrationActive = vibDurationSec >= this.persistenceSec;

    // Audio
    let audioDurationSec = 0;
    if (reading.audioRms >= audioThreshold) {
      if (this.audioExceededStartMs === null) {
        this.audioExceededStartMs = reading.t;
      }
      audioDurationSec = Math.max(0, (reading.t - this.audioExceededStartMs) / 1000.0);
    } else {
      this.audioExceededStartMs = null;
    }
    const audioActive = audioDurationSec >= this.persistenceSec;

    const isAnomalyActive = vibrationActive || audioActive;
    const combinedAnomaly = Math.max(vibrationAnomaly, audioAnomaly);

    return {
      vibrationAnomaly: Number(vibrationAnomaly.toFixed(4)),
      audioAnomaly: Number(audioAnomaly.toFixed(4)),
      vibrationActive,
      audioActive,
      combinedAnomaly: Number(combinedAnomaly.toFixed(4)),
      isAnomalyActive,
      vibrationDurationSec: Number(vibDurationSec.toFixed(2)),
      audioDurationSec: Number(audioDurationSec.toFixed(2)),
    };
  }

  /**
   * Enriches a VehicleFeatures object with scored anomaly values.
   */
  public enrich(features: VehicleFeatures, baseline?: PersonalBaseline | null): VehicleFeatures {
    const scores = this.score(features, baseline);
    return {
      ...features,
      vibrationAnomaly: scores.vibrationAnomaly,
      audioAnomaly: scores.audioAnomaly,
    };
  }
}
