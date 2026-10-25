import { describe, it, expect, beforeEach } from 'vitest';
import { VehicleSimulator } from '../core/vehicle/simulator';
import { VehicleScorer } from '../core/vehicle/vehicleScorer';
import { VehicleManager } from '../core/vehicle/vehicleManager';
import { MotionMonitor } from '../io/motion/motionMonitor';
import { AudioMonitor } from '../io/audio/audioMonitor';
import { DEFAULT_BASELINE_PROFILE } from '../core/config';

describe('VehicleSimulator', () => {
  let simulator: VehicleSimulator;

  beforeEach(() => {
    simulator = new VehicleSimulator('NORMAL');
  });

  it('initializes with NORMAL preset and returns source="simulated"', () => {
    const reading = simulator.sample(1000);
    expect(reading.source).toBe('simulated');
    expect(reading.vibrationRms).toBeCloseTo(0.12, 2);
    expect(reading.audioRms).toBeCloseTo(0.08, 2);
    expect(reading.audioBands).toHaveLength(3);
  });

  it('switches to BRAKE_JUDDER preset correctly', () => {
    simulator.setPreset('BRAKE_JUDDER');
    const reading = simulator.sample(2000);
    expect(reading.source).toBe('simulated');
    expect(reading.vibrationRms).toBeCloseTo(0.85, 2);
    expect(reading.audioRms).toBeCloseTo(0.45, 2);
    expect(reading.audioBands[0]).toBeGreaterThan(0.5); // High low-frequency brake shudder
  });

  it('switches to ENGINE_KNOCK preset correctly', () => {
    simulator.setPreset('ENGINE_KNOCK');
    const reading = simulator.sample(3000);
    expect(reading.source).toBe('simulated');
    expect(reading.vibrationRms).toBeCloseTo(0.55, 2);
    expect(reading.audioRms).toBeCloseTo(0.72, 2);
    expect(reading.audioBands[2]).toBeGreaterThan(0.7); // High-frequency knock ping
  });

  it('switches to RUMBLE_STRIP preset correctly', () => {
    simulator.setPreset('RUMBLE_STRIP');
    const reading = simulator.sample(4000);
    expect(reading.source).toBe('simulated');
    expect(reading.vibrationRms).toBeCloseTo(1.10, 2);
    expect(reading.audioRms).toBeCloseTo(0.65, 2);
  });

  it('allows manual slider adjustments with clamping', () => {
    simulator.setVibrationRms(1.8); // exceeds max 1.5
    expect(simulator.getState().vibrationRms).toBe(1.5);

    simulator.setVibrationRms(-0.5); // below min 0.0
    expect(simulator.getState().vibrationRms).toBe(0.0);

    simulator.setAudioRms(1.5); // exceeds max 1.0
    expect(simulator.getState().audioRms).toBe(1.0);

    simulator.setAudioBands([1.2, -0.2, 0.5]);
    const bands = simulator.getState().audioBands;
    expect(bands[0]).toBe(1.0);
    expect(bands[1]).toBe(0.0);
    expect(bands[2]).toBe(0.5);
  });

  it('applies oscillation jitter when requested', () => {
    simulator.setPreset('BRAKE_JUDDER');
    const s1 = simulator.sample(1000, true);
    const s2 = simulator.sample(1050, true);
    // At least one dimension has variance due to 12Hz wave
    expect(s1.vibrationRms).not.toBe(s2.vibrationRms);
  });
});

describe('VehicleScorer & Persistence', () => {
  let scorer: VehicleScorer;

  beforeEach(() => {
    // 1.5 second persistence matching config
    scorer = new VehicleScorer(1.5);
  });

  it('scores normal ambient vehicle signals as zero or near-zero anomaly', () => {
    const score = scorer.score({
      t: 1000,
      vibrationRms: 0.12,
      audioRms: 0.08,
    }, DEFAULT_BASELINE_PROFILE);

    expect(score.vibrationAnomaly).toBe(0);
    expect(score.audioAnomaly).toBe(0);
    expect(score.vibrationActive).toBe(false);
    expect(score.audioActive).toBe(false);
    expect(score.isAnomalyActive).toBe(false);
  });

  it('scores high vibration above threshold as anomaly', () => {
    const score = scorer.score({
      t: 1000,
      vibrationRms: 0.85,
      audioRms: 0.08,
    }, DEFAULT_BASELINE_PROFILE);

    expect(score.vibrationAnomaly).toBe(1.0);
    expect(score.audioAnomaly).toBe(0);
    // Not active immediately (needs 1.5s persistence)
    expect(score.vibrationActive).toBe(false);
    expect(score.isAnomalyActive).toBe(false);
  });

  it('activates vibration anomaly after persisting >= 1.5 seconds', () => {
    // Reading 1 at t = 1000 ms
    let res = scorer.score({ t: 1000, vibrationRms: 0.85, audioRms: 0.08 });
    expect(res.vibrationActive).toBe(false);
    expect(res.vibrationDurationSec).toBe(0);

    // Reading 2 at t = 2000 ms (1.0s elapsed)
    res = scorer.score({ t: 2000, vibrationRms: 0.85, audioRms: 0.08 });
    expect(res.vibrationActive).toBe(false);
    expect(res.vibrationDurationSec).toBeCloseTo(1.0, 1);

    // Reading 3 at t = 2600 ms (1.6s elapsed >= 1.5s)
    res = scorer.score({ t: 2600, vibrationRms: 0.85, audioRms: 0.08 });
    expect(res.vibrationActive).toBe(true);
    expect(res.isAnomalyActive).toBe(true);
    expect(res.vibrationDurationSec).toBeCloseTo(1.6, 1);
  });

  it('resets persistence duration immediately when signal drops below threshold', () => {
    scorer.score({ t: 1000, vibrationRms: 0.85, audioRms: 0.08 });
    scorer.score({ t: 2600, vibrationRms: 0.85, audioRms: 0.08 }); // 1.6s -> active

    // Drops at t = 3000 ms
    const drop = scorer.score({ t: 3000, vibrationRms: 0.12, audioRms: 0.08 });
    expect(drop.vibrationActive).toBe(false);
    expect(drop.vibrationDurationSec).toBe(0);
    expect(drop.isAnomalyActive).toBe(false);

    // Re-spikes at t = 3500 ms (should start timing over from 0)
    const reSpike = scorer.score({ t: 3500, vibrationRms: 0.85, audioRms: 0.08 });
    expect(reSpike.vibrationActive).toBe(false);
    expect(reSpike.vibrationDurationSec).toBe(0);
  });

  it('activates audio anomaly after persisting >= 1.5 seconds', () => {
    scorer.score({ t: 1000, vibrationRms: 0.12, audioRms: 0.70 });
    const mid = scorer.score({ t: 2000, vibrationRms: 0.12, audioRms: 0.70 });
    expect(mid.audioActive).toBe(false);

    const active = scorer.score({ t: 2600, vibrationRms: 0.12, audioRms: 0.70 });
    expect(active.audioActive).toBe(true);
    expect(active.isAnomalyActive).toBe(true);
  });

  it('enriches VehicleFeatures with scored values', () => {
    const raw = {
      t: 1000,
      source: 'simulated' as const,
      vibrationRms: 0.85,
      vibrationAnomaly: 0,
      audioRms: 0.45,
      audioAnomaly: 0,
      audioBands: [0.6, 0.3, 0.1] as [number, number, number],
    };
    const enriched = scorer.enrich(raw, DEFAULT_BASELINE_PROFILE);
    expect(enriched.vibrationAnomaly).toBeGreaterThan(0.5);
    expect(enriched.audioAnomaly).toBeGreaterThan(0.5);
  });
});

describe('MotionMonitor & AudioMonitor fallbacks', () => {
  it('MotionMonitor handles environment gracefully', async () => {
    const monitor = new MotionMonitor();
    expect(typeof monitor.isSupported()).toBe('boolean');
    expect(monitor.isActive()).toBe(false);
    expect(monitor.getCurrentRms()).toBe(0);

    // In node/vitest environment, DeviceMotionEvent is usually not on global window
    const started = await monitor.start();
    // Should return false and not crash
    expect(typeof started).toBe('boolean');
    monitor.stop();
  });

  it('AudioMonitor handles environment gracefully', async () => {
    const monitor = new AudioMonitor();
    expect(typeof monitor.isSupported()).toBe('boolean');
    expect(monitor.isActive()).toBe(false);

    const started = await monitor.start();
    expect(typeof started).toBe('boolean');
    monitor.stop();
  });
});

describe('VehicleManager', () => {
  let manager: VehicleManager;

  beforeEach(() => {
    manager = new VehicleManager({ initialPreset: 'NORMAL' });
  });

  it('initializes with simulated source by default', () => {
    expect(manager.getSource()).toBe('simulated');
    const { features, scores } = manager.getCurrentFeatures(1000);
    expect(features.source).toBe('simulated');
    expect(features.vibrationRms).toBeCloseTo(0.12, 1);
    expect(scores.isAnomalyActive).toBe(false);
  });

  it('seamlessly falls back to simulated if sensors are unsupported or fail', async () => {
    const ok = await manager.setSource('sensor');
    // In headless test environment, sensors fail and it returns false while remaining simulated
    if (!ok) {
      expect(manager.getSource()).toBe('simulated');
    }
  });

  it('streams features via subscription', () => {
    const samples: any[] = [];
    const unsubscribe = manager.subscribe((feat, scores) => {
      samples.push({ feat, scores });
    });

    // Run a manual tick
    manager.getSimulator().setPreset('BRAKE_JUDDER');
    const res = manager.getCurrentFeatures(2000);
    expect(res.features.vibrationRms).toBeGreaterThan(0.7);

    unsubscribe();
  });
});
