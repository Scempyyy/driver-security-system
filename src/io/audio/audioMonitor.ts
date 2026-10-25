/**
 * Web Audio API microphone monitor using AnalyserNode.
 * Computes RMS amplitude and simple 3-band energy:
 * - Low: 20 - 300 Hz
 * - Mid: 300 - 2000 Hz
 * - High: 2000 - 8000 Hz
 * Provides seamless fallback to simulator if mic is not granted or unavailable.
 */

export interface AudioSample {
  t: number;
  rms: number;                         // 0.0 to 1.0 normalized RMS amplitude
  bands: [number, number, number];    // [Low, Mid, High] normalized 0.0 to 1.0
}

export type AudioCallback = (sample: AudioSample) => void;

export class AudioMonitor {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private isListening: boolean = false;
  private isAvailable: boolean = false;
  private currentSample: AudioSample = {
    t: 0,
    rms: 0,
    bands: [0, 0, 0],
  };
  private callbacks: Set<AudioCallback> = new Set();
  private animationFrameId: number | null = null;

  public isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      (typeof AudioContext !== 'undefined' || typeof (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext !== 'undefined')
    );
  }

  public async start(): Promise<boolean> {
    if (this.isListening) return true;
    if (!this.isSupported()) {
      this.isAvailable = false;
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      });

      this.mediaStream = stream;
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioCtx();
      
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.5;

      this.sourceNode = this.audioContext.createMediaStreamSource(stream);
      this.sourceNode.connect(this.analyser);

      this.isListening = true;
      this.isAvailable = true;
      this.startLoop();
      return true;
    } catch {
      this.stop();
      this.isAvailable = false;
      return false;
    }
  }

  public stop(): void {
    if (this.animationFrameId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    this.analyser = null;
    this.isListening = false;
  }

  public subscribe(cb: AudioCallback): () => void {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  public getCurrentSample(): AudioSample {
    return { ...this.currentSample, bands: [...this.currentSample.bands] };
  }

  public isActive(): boolean {
    return this.isListening;
  }

  public isReady(): boolean {
    return this.isAvailable;
  }

  private startLoop(): void {
    if (typeof requestAnimationFrame === 'undefined') return;

    const tick = () => {
      if (!this.isListening || !this.analyser || !this.audioContext) return;

      const bufferLength = this.analyser.frequencyBinCount;
      const timeData = new Float32Array(bufferLength);
      const freqData = new Uint8Array(bufferLength);

      this.analyser.getFloatTimeDomainData(timeData);
      this.analyser.getByteFrequencyData(freqData);

      // Compute RMS from time domain data
      let sumSq = 0;
      for (let i = 0; i < timeData.length; i++) {
        sumSq += timeData[i] * timeData[i];
      }
      const rawRms = Math.sqrt(sumSq / timeData.length);
      // Normalized RMS (clamp 0.0 - 1.0)
      const rms = Math.min(1.0, rawRms * 3.0);

      // Simple 3-band energy from frequency domain data
      // Sample rate typically 44100 or 48000 Hz. Nyquist is sampleRate / 2.
      // binWidth = (sampleRate / 2) / bufferLength
      const sampleRate = this.audioContext.sampleRate || 44100;
      const binWidth = (sampleRate / 2) / bufferLength;

      let lowSum = 0, lowCount = 0;
      let midSum = 0, midCount = 0;
      let highSum = 0, highCount = 0;

      for (let i = 0; i < bufferLength; i++) {
        const freq = i * binWidth;
        const val = freqData[i] / 255.0; // 0.0 to 1.0

        if (freq >= 20 && freq < 300) {
          lowSum += val;
          lowCount++;
        } else if (freq >= 300 && freq < 2000) {
          midSum += val;
          midCount++;
        } else if (freq >= 2000 && freq <= 8000) {
          highSum += val;
          highCount++;
        }
      }

      const low = lowCount > 0 ? lowSum / lowCount : 0;
      const mid = midCount > 0 ? midSum / midCount : 0;
      const high = highCount > 0 ? highSum / highCount : 0;

      this.currentSample = {
        t: performance.now(),
        rms: Number(rms.toFixed(4)),
        bands: [
          Number(low.toFixed(4)),
          Number(mid.toFixed(4)),
          Number(high.toFixed(4)),
        ],
      };

      for (const cb of this.callbacks) {
        try {
          cb(this.currentSample);
        } catch {
          // Ignore subscriber errors
        }
      }

      this.animationFrameId = requestAnimationFrame(tick);
    };

    this.animationFrameId = requestAnimationFrame(tick);
  }
}
