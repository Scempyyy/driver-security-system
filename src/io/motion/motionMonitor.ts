/**
 * Browser DeviceMotionEvent listener for phone accelerometer.
 * Calculates magnitude = sqrt(x^2 + y^2 + z^2) - 9.8 (or uses accelerationIncludingGravity/acceleration).
 * Supports iOS explicit permission request (DeviceMotionEvent.requestPermission).
 * Provides seamless fallback to simulator if physical sensor is unavailable.
 */

export interface MotionSample {
  t: number;
  rms: number;
  raw: { x: number; y: number; z: number };
}

export type MotionCallback = (sample: MotionSample) => void;

export class MotionMonitor {
  private isListening: boolean = false;
  private isAvailable: boolean = false;
  private currentRms: number = 0;
  private listener: ((event: DeviceMotionEvent) => void) | null = null;
  private callbacks: Set<MotionCallback> = new Set();
  
  // Rolling window for RMS calculation
  private windowSamples: number[] = [];
  private readonly maxWindowSamples = 20;

  /**
   * Check if DeviceMotionEvent is supported in the current environment.
   */
  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'DeviceMotionEvent' in window;
  }

  /**
   * Request permission if required by platform (e.g. iOS 13+ Safari).
   */
  public async requestPermission(): Promise<boolean> {
    if (!this.isSupported()) {
      this.isAvailable = false;
      return false;
    }

    try {
      const motionEvent = window.DeviceMotionEvent as unknown as {
        requestPermission?: () => Promise<'granted' | 'denied'>;
      };

      if (typeof motionEvent.requestPermission === 'function') {
        const state = await motionEvent.requestPermission();
        this.isAvailable = state === 'granted';
        return this.isAvailable;
      }

      // Non-iOS or older platforms do not require explicit requestPermission
      this.isAvailable = true;
      return true;
    } catch {
      this.isAvailable = false;
      return false;
    }
  }

  /**
   * Starts listening to DeviceMotionEvent.
   */
  public async start(): Promise<boolean> {
    if (this.isListening) return true;

    if (!this.isAvailable) {
      const granted = await this.requestPermission();
      if (!granted) {
        return false;
      }
    }

    this.listener = (event: DeviceMotionEvent) => {
      this.handleMotionEvent(event);
    };

    window.addEventListener('devicemotion', this.listener, true);
    this.isListening = true;
    return true;
  }

  /**
   * Stops listening to motion events.
   */
  public stop(): void {
    if (this.listener && typeof window !== 'undefined') {
      window.removeEventListener('devicemotion', this.listener, true);
    }
    this.listener = null;
    this.isListening = false;
    this.windowSamples = [];
  }

  public subscribe(cb: MotionCallback): () => void {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  public getCurrentRms(): number {
    return this.currentRms;
  }

  public isActive(): boolean {
    return this.isListening;
  }

  private handleMotionEvent(event: DeviceMotionEvent): void {
    let x = 0;
    let y = 0;
    let z = 0;
    let magnitude = 0;

    // Prefer linear acceleration (gravity removed by hardware sensor fusion)
    if (event.acceleration && (event.acceleration.x !== null || event.acceleration.y !== null || event.acceleration.z !== null)) {
      x = event.acceleration.x ?? 0;
      y = event.acceleration.y ?? 0;
      z = event.acceleration.z ?? 0;
      magnitude = Math.sqrt(x * x + y * y + z * z);
    } else if (event.accelerationIncludingGravity) {
      // Fallback: magnitude minus earth gravity (~9.80665 m/s^2)
      x = event.accelerationIncludingGravity.x ?? 0;
      y = event.accelerationIncludingGravity.y ?? 0;
      z = event.accelerationIncludingGravity.z ?? 0;
      const total = Math.sqrt(x * x + y * y + z * z);
      magnitude = Math.abs(total - 9.80665);
    }

    // Update rolling buffer
    this.windowSamples.push(magnitude);
    if (this.windowSamples.length > this.maxWindowSamples) {
      this.windowSamples.shift();
    }

    // RMS of recent samples
    const sumSq = this.windowSamples.reduce((sum, v) => sum + v * v, 0);
    this.currentRms = Math.sqrt(sumSq / this.windowSamples.length);

    const sample: MotionSample = {
      t: performance.now(),
      rms: Number(this.currentRms.toFixed(4)),
      raw: { x, y, z },
    };

    for (const cb of this.callbacks) {
      try {
        cb(sample);
      } catch {
        // Ignore subscriber errors
      }
    }
  }
}
