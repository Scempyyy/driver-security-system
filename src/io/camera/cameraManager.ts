/**
 * CameraManager
 *
 * Manages webcam streaming via navigator.mediaDevices.getUserMedia,
 * categorizes hardware/permission errors, feeds video frames into MediaPipe
 * FaceLandmarker detectForVideo, and tracks live processing FPS.
 */

import { FaceLandmarker, FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { initializeFaceLandmarker, LandmarkerDelegate } from './landmarkerLoader';

export type CameraStatus =
  | 'idle'
  | 'starting'
  | 'active'
  | 'denied'
  | 'not-found'
  | 'busy'
  | 'error';

export interface CameraManagerOptions {
  videoElement?: HTMLVideoElement;
  wasmPath?: string;
  modelPath?: string;
  width?: number;
  height?: number;
  onFrameResult?: (result: FaceLandmarkerResult, timestampMs: number) => void;
  onError?: (error: Error, status: CameraStatus) => void;
  onFpsUpdate?: (fps: number) => void;
  onDelegateReady?: (delegate: LandmarkerDelegate, loadTimeMs: number) => void;
  onStatusChange?: (status: CameraStatus, message?: string) => void;
}

export class CameraManager {
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private landmarker: FaceLandmarker | null = null;
  private delegate: LandmarkerDelegate = 'CPU';

  private isRunning = false;
  private animFrameId: number | null = null;
  private lastVideoTime = -1;

  private status: CameraStatus = 'idle';
  private errorMessage = '';

  // FPS calculation
  private frameCount = 0;
  private lastFpsCalcTime = 0;
  private currentFps = 0;

  private options: CameraManagerOptions;

  constructor(options: CameraManagerOptions = {}) {
    this.options = options;
  }

  public getStatus(): CameraStatus {
    return this.status;
  }

  public getErrorMessage(): string {
    return this.errorMessage;
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

  private setStatus(status: CameraStatus, message = ''): void {
    this.status = status;
    this.errorMessage = message;
    this.options.onStatusChange?.(status, message);
  }

  /**
   * Initializes the landmarker and starts the video stream.
   */
  public async start(videoEl?: HTMLVideoElement): Promise<void> {
    if (this.isRunning && this.stream) {
      return;
    }

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

    this.setStatus('starting', 'Requesting camera access...');

    // 1. Request user media video stream FIRST to trigger browser prompt
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Webcam media devices API is not supported in this browser environment.');
      }

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
        // Wait for video to load metadata and begin playback
        await new Promise<void>((resolve, reject) => {
          if (!this.video) return resolve();
          this.video.onloadedmetadata = () => {
            this.video?.play().then(() => resolve()).catch(reject);
          };
          this.video.onerror = () => reject(new Error('Video element failed to play stream.'));
        });
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      let mappedStatus: CameraStatus = 'error';
      let friendlyMessage = error.message;

      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        mappedStatus = 'denied';
        friendlyMessage = 'Camera permission denied. Please click the camera icon in your browser URL bar and allow access.';
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        mappedStatus = 'not-found';
        friendlyMessage = 'Camera not connected. No webcam found (/dev/video0 missing or disconnected).';
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        mappedStatus = 'busy';
        friendlyMessage = 'Camera is busy or currently claimed by another process or application.';
      }

      this.setStatus(mappedStatus, friendlyMessage);
      this.options.onError?.(error, mappedStatus);
      this.stop();
      throw error;
    }

    // 2. Initialize Landmarker
    if (!this.landmarker) {
      this.setStatus('starting', 'Loading MediaPipe Face Landmarker model...');
      try {
        const initResult = await initializeFaceLandmarker(
          this.options.wasmPath,
          this.options.modelPath
        );
        this.landmarker = initResult.landmarker;
        this.delegate = initResult.delegate;
        this.options.onDelegateReady?.(initResult.delegate, initResult.loadTimeMs);
      } catch (landmarkerErr) {
        const error = landmarkerErr instanceof Error ? landmarkerErr : new Error(String(landmarkerErr));
        this.setStatus('error', `MediaPipe model load error: ${error.message}`);
        this.options.onError?.(error, 'error');
        this.stop();
        throw error;
      }
    }

    this.isRunning = true;
    this.setStatus('active', 'Camera active and tracking live');
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
          const error = err instanceof Error ? err : new Error(String(err));
          this.options.onError?.(error, 'error');
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
    this.setStatus('idle', 'Camera stopped');
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
