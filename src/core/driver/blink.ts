/**
 * Sliding 60-second blink rate & slow blink pattern calculator.
 *
 * Normal blinks last under 0.40 s (normal blink rate 15-20 per minute).
 * Ordinary blinks NEVER trigger alarms or warnings.
 *
 * Slow blinks: closures lasting >= 0.40 s (CONFIG.driver.slowBlinkDurationSec).
 * - >= 3 slow blinks within 60 s -> slow blink pattern starting (NOTICE)
 * - 10 slow blinks within 60 s -> WARNING (CONFIG.driver.slowBlinkWarningCount)
 */

import { CONFIG } from '../config';

export interface BlinkTrackerConfig {
  windowSec?: number;             // Default 60 seconds
  slowBlinkDurationSec?: number;  // Default 0.40 seconds
  minBlinkDurationMs?: number;    // Default 50 ms
  maxBlinkDurationMs?: number;    // Closures exceeding this (e.g. 2000ms microsleep) are not saccadic blinks
}

export class BlinkTracker {
  private windowMs: number;
  private slowBlinkDurationMs: number;
  private minBlinkDurationMs: number;
  private maxBlinkDurationMs: number;

  private isEyesClosed = false;
  private closureStartMs = 0;
  private blinkTimestamps: number[] = [];
  private slowBlinkTimestamps: number[] = [];

  constructor(config?: BlinkTrackerConfig) {
    this.windowMs = (config?.windowSec ?? CONFIG.driver.slowBlinkWindowSec) * 1000;
    this.slowBlinkDurationMs = (config?.slowBlinkDurationSec ?? CONFIG.driver.slowBlinkDurationSec) * 1000;
    this.minBlinkDurationMs = config?.minBlinkDurationMs ?? 50;
    this.maxBlinkDurationMs = config?.maxBlinkDurationMs ?? 2000;
  }

  /**
   * Resets internal state.
   */
  public reset(): void {
    this.isEyesClosed = false;
    this.closureStartMs = 0;
    this.blinkTimestamps = [];
    this.slowBlinkTimestamps = [];
  }

  /**
   * Processes an eye state sample at monotonic timestamp `t` (ms).
   * Returns estimated total blinks per minute over the sliding window.
   */
  public update(t: number, isClosed: boolean): number {
    if (isClosed && !this.isEyesClosed) {
      // Leading-edge: transition from open to closed
      this.isEyesClosed = true;
      this.closureStartMs = t;
    } else if (!isClosed && this.isEyesClosed) {
      // Trailing-edge: eyes reopen
      this.isEyesClosed = false;
      const durationMs = t - this.closureStartMs;

      // Normal or slow blink (microsleep closures exceeding maxBlinkDurationMs are ignored)
      if (durationMs >= this.minBlinkDurationMs && durationMs <= this.maxBlinkDurationMs) {
        this.blinkTimestamps.push(t);

        // Check if this qualifies as a SLOW blink (>= 0.4s)
        if (durationMs >= this.slowBlinkDurationMs) {
          this.slowBlinkTimestamps.push(t);
        }
      }
    }

    this.prune(t);
    return this.calculateBlinkRate(t);
  }

  /**
   * Returns the count of slow blinks (>= 0.4s) recorded in the last 60 seconds.
   */
  public getSlowBlinkCount(nowMs: number): number {
    this.prune(nowMs);
    return this.slowBlinkTimestamps.length;
  }

  /**
   * Returns true if slow blink pattern is starting (>= 3 slow blinks within 60s).
   */
  public hasSlowBlinkPattern(nowMs: number): boolean {
    return this.getSlowBlinkCount(nowMs) >= CONFIG.driver.slowBlinkPatternNoticeCount;
  }

  /**
   * Returns true if slow blink warning threshold is reached (10 slow blinks within 60s).
   */
  public isSlowBlinkWarning(nowMs: number): boolean {
    return this.getSlowBlinkCount(nowMs) >= CONFIG.driver.slowBlinkWarningCount;
  }

  /**
   * Computes the current estimated blinks per minute.
   */
  public calculateBlinkRate(nowMs: number): number {
    this.prune(nowMs);
    const count = this.blinkTimestamps.length;
    if (count === 0) return 0;

    const windowMinutes = this.windowMs / 60000;
    return Math.round((count / windowMinutes) * 10) / 10;
  }

  private prune(nowMs: number): void {
    const cutoff = nowMs - this.windowMs;
    while (this.blinkTimestamps.length > 0 && this.blinkTimestamps[0] < cutoff) {
      this.blinkTimestamps.shift();
    }
    while (this.slowBlinkTimestamps.length > 0 && this.slowBlinkTimestamps[0] < cutoff) {
      this.slowBlinkTimestamps.shift();
    }
  }
}
