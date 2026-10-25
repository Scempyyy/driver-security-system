/**
 * CameraManager
 *
 * Manages video streaming via navigator.mediaDevices.getUserMedia,
 * feeds video frames into MediaPipe FaceLandmarker detectForVideo,
 * and tracks live processing FPS and active delegate (GPU | CPU).
 */

import { FaceLandmarker, FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { initializeFaceLandmarker, LandmarkerDelegate } from './landmarkerLoader';

export interface CameraManagerOptions {
  videoElement?: HTMLVideoElement;
  wasmPath?: string;
  modelPath?: string;
  width?: number;
  height?: number;
  onFrameResult?: (result: FaceLandmarkerResult, timestampMs: number) => void;
  onError?: (error: Error) => void;
  onFpsUpdate?: (fps: number) => void;
  onDelegateReady?: (delegate: LandmarkerDelegate, loadTimeMs: number) => void;
}

export class CameraManager {
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private landmarker: FaceLandmarker | null = null;
  private delegate: LandmarkerDelegate = 'CPU';

  private isRunning = false;
  private animFrameId: number | null = null;
  private lastVideoTime = -1;

  // FPS calculation
  private frameCount = 0;
  private lastFpsCalcTime = 0;
  private currentFps = 0;

  private options: CameraManagerOptions;

  constructor(options: CameraManagerOptions = {}) {
    this.options = options;
  }

  public getActiveDelegate(): LandmarkerDelegate {
    return this.delegate;
  }

  public getCurrentFps(): number {
    return this.currentFps;
  }

  public isStreamActive(): boolean {
    return this.isRunning && !!this.stream;
  }

  /**
   * Initializes the landmarker and starts the video stream.
   */
  public async start(videoEl?: HTMLVideoElement): Promise<void> {
    if (videoEl) {
      this.video = videoEl;
    } else if (this.options.videoElement) {
      this.video = this.options.videoElement;
    } else if (typeof document !== 'undefined') {
      this.video = document.createElement('video');
      this.video.autoplay = true;
      this.video.playsInline = true;
      this.video.muted = true;
    }

    // 1. Initialize Landmarker if not yet ready
    if (!this.landmarker) {
      const initResult = await initializeFaceLandmarker(
        this.options.wasmPath,
        this.options.modelPath
      );
      this.landmarker = initResult.landmarker;
      this.delegate = initResult.delegate;
      this.options.onDelegateReady?.(initResult.delegate, initResult.loadTimeMs);
    }

    // 2. Request user media video stream
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          width: { ideal: this.options.width ?? 640 },
          height: { ideal: this.options.height ?? 480 },
          facingMode: 'user',
        },
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (this.video) {
        this.video.srcObject = this.stream;
        await this.video.play();
      }
    }

    this.isRunning = true;
    this.lastFpsCalcTime = performance.now();
    this.frameCount = 0;
    this.processLoop();
  }

  /**
   * Main video processing loop running on requestAnimationFrame.
   */
  private processLoop = (): void => {
    if (!this.isRunning) return;

    const now = performance.now();

    if (this.video && this.landmarker && this.video.readyState >= 2) {
      if (this.video.currentTime !== this.lastVideoTime) {
        this.lastVideoTime = this.video.currentTime;
        const timestampMs = Math.round(now);

        try {
          const results = this.landmarker.detectForVideo(this.video, timestampMs);
          this.options.onFrameResult?.(results, timestampMs);

          // Update FPS metrics
          this.frameCount++;
          if (now - this.lastFpsCalcTime >= 1000) {
            this.currentFps = Math.round((this.frameCount * 1000) / (now - this.lastFpsCalcTime));
            this.frameCount = 0;
            this.lastFpsCalcTime = now;
            this.options.onFpsUpdate?.(this.currentFps);
          }
        } catch (err) {
          this.options.onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }
    }

    if (typeof requestAnimationFrame !== 'undefined') {
      this.animFrameId = requestAnimationFrame(this.processLoop);
    }
  };

  /**
   * Stops the video stream, cancels animation loop, and releases resources.
   */
  public stop(): void {
    this.isRunning = false;

    if (this.animFrameId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.video) {
      this.video.srcObject = null;
    }

    this.currentFps = 0;
    this.frameCount = 0;
  }

  /**
   * Disposes the landmarker and all underlying webgl / wasm memory.
   */
  public dispose(): void {
    this.stop();
    if (this.landmarker) {
      this.landmarker.close();
      this.landmarker = null;
    }
  }
}
