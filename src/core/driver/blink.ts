/**
 * Sliding 60-second blink rate calculator with leading-edge closure detection.
 *
 * Saccadic blinks typically last 100-400 ms.
 * Leading-edge detection triggers when eyes transition from open -> closed.
 * To avoid counting prolonged closures / microsleeps as normal blinks,
 * a blink event is confirmed when eyes reopen within maxBlinkDurationMs (e.g. 500 ms).
 * A sliding window tracks total confirmed blinks to estimate blinks per minute (BPM).
 */

export interface BlinkTrackerConfig {
  windowSec?: number;             // Default 60 seconds
  maxBlinkDurationMs?: number;    // Closures longer than this (e.g. 500 ms) are microsleeps, not standard blinks
  minBlinkDurationMs?: number;    // Closures shorter than this (e.g. 50 ms) might be noise
}

export class BlinkTracker {
  private windowMs: number;
  private maxBlinkDurationMs: number;
  private minBlinkDurationMs: number;

  private isEyesClosed = false;
  private closureStartMs = 0;
  private blinkTimestamps: number[] = [];

  constructor(config?: BlinkTrackerConfig) {
    this.windowMs = (config?.windowSec ?? 60) * 1000;
    this.maxBlinkDurationMs = config?.maxBlinkDurationMs ?? 600;
    this.minBlinkDurationMs = config?.minBlinkDurationMs ?? 50;
  }

  /**
   * Resets internal state.
   */
  public reset(): void {
    this.isEyesClosed = false;
    this.closureStartMs = 0;
    this.blinkTimestamps = [];
  }

  /**
   * Processes an eye state sample at monotonic timestamp `t` (ms).
   * Returns estimated blinks per minute over the sliding window.
   */
  public update(t: number, isClosed: boolean): number {
    if (isClosed && !this.isEyesClosed) {
      // Leading-edge: transition from open to closed
      this.isEyesClosed = true;
      this.closureStartMs = t;
    } else if (!isClosed && this.isEyesClosed) {
      // Trailing-edge: eyes reopen
      this.isEyesClosed = false;
      const duration = t - this.closureStartMs;
      if (duration >= this.minBlinkDurationMs && duration <= this.maxBlinkDurationMs) {
        this.blinkTimestamps.push(t);
      }
    }

    this.prune(t);
    return this.calculateBlinkRate(t);
  }

  /**
   * Computes the current estimated blinks per minute.
   * If total window span is less than window duration, extrapolates rate safely.
   */
  public calculateBlinkRate(nowMs: number): number {
    this.prune(nowMs);
    const count = this.blinkTimestamps.length;
    if (count === 0) return 0;

    // Window span in minutes:
    const windowMinutes = this.windowMs / 60000;
    return Math.round((count / windowMinutes) * 10) / 10;
  }

  private prune(nowMs: number): void {
    const cutoff = nowMs - this.windowMs;
    while (this.blinkTimestamps.length > 0 && this.blinkTimestamps[0] < cutoff) {
      this.blinkTimestamps.shift();
    }
  }
}
