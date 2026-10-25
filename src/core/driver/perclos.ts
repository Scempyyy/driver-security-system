/**
 * Time-based rolling window PERCLOS (Percentage of Eye Closure) calculator.
 *
 * Uses wall-clock monotonic timestamps in milliseconds.
 * Tracks eyes closed vs total valid elapsed time within a sliding window
 * (e.g. 25 s demo or 60 s full standard window).
 */

export interface EyeSample {
  t: number;          // timestamp in milliseconds
  isClosed: boolean;  // whether eye closure criterion was met
}

export class PerclosTracker {
  private windowMs: number;
  private samples: EyeSample[] = [];

  constructor(windowSec = 60) {
    this.windowMs = windowSec * 1000;
  }

  /**
   * Updates window duration (e.g. switching between demo 25s and standard 60s).
   */
  public setWindowDuration(windowSec: number): void {
    this.windowMs = Math.max(1000, windowSec * 1000);
    this.prune(this.samples.length > 0 ? this.samples[this.samples.length - 1].t : 0);
  }

  /**
   * Resets all history.
   */
  public reset(): void {
    this.samples = [];
  }

  /**
   * Records an eye sample at timestamp `t` (ms) with `isClosed`.
   * Returns current PERCLOS ratio in [0.0, 1.0].
   */
  public addSample(t: number, isClosed: boolean): number {
    this.samples.push({ t, isClosed });
    this.prune(t);
    return this.calculate();
  }

  /**
   * Calculates PERCLOS over the current window.
   * If sample count is 0 or duration is negligible, returns 0.0.
   */
  public calculate(): number {
    if (this.samples.length < 2) {
      return this.samples.length === 1 && this.samples[0].isClosed ? 1.0 : 0.0;
    }

    let closedDurationMs = 0;
    const windowStart = this.samples[this.samples.length - 1].t - this.windowMs;

    for (let i = 1; i < this.samples.length; i++) {
      const prev = this.samples[i - 1];
      const curr = this.samples[i];

      // Effective span inside the window
      const segStart = Math.max(prev.t, windowStart);
      const segEnd = curr.t;
      const dt = segEnd - segStart;

      if (dt > 0 && prev.isClosed) {
        closedDurationMs += dt;
      }
    }

    const totalWindowSpan = this.samples[this.samples.length - 1].t - Math.max(this.samples[0].t, windowStart);
    if (totalWindowSpan <= 0) {
      return 0.0;
    }

    return Math.min(1.0, Math.max(0.0, closedDurationMs / totalWindowSpan));
  }

  private prune(nowMs: number): void {
    const cutoff = nowMs - this.windowMs;
    // Keep at least one point before cutoff to accurately integrate trapezoid/intervals
    let removeCount = 0;
    for (let i = 0; i < this.samples.length - 1; i++) {
      if (this.samples[i + 1].t < cutoff) {
        removeCount++;
      } else {
        break;
      }
    }
    if (removeCount > 0) {
      this.samples.splice(0, removeCount);
    }
  }
}
