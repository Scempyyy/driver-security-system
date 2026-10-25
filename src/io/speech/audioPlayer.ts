import { RiskLevel, RISK_LEVELS } from '../../core/types';
import { getAssetUrl } from '../../core/paths';

export interface AlertSoundOptions {
  spokenText?: string;
  enableVoice?: boolean;
}

class AlertAudioPlayer {
  private audioCtx: AudioContext | null = null;
  private soundBuffers: Map<RiskLevel, AudioBuffer> = new Map();
  private isLoading = false;
  private isPrimed = false;

  private soundUrls: Record<RiskLevel, string> = {
    0: '',
    1: getAssetUrl('audio/notice.wav'),
    2: getAssetUrl('audio/warning.wav'),
    3: getAssetUrl('audio/critical.wav'),
  };

  /**
   * Initializes and resumes the AudioContext on user interaction
   */
  public async prime(): Promise<void> {
    if (this.isPrimed && this.audioCtx && this.audioCtx.state === 'running') {
      return;
    }

    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!this.audioCtx) {
        this.audioCtx = new AudioCtxClass();
      }
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }
      this.isPrimed = true;
      await this.preloadAll();
    } catch (err) {
      console.warn('[AudioPlayer] Could not prime AudioContext:', err);
    }
  }

  public async preloadAll(): Promise<void> {
    if (this.isLoading || !this.audioCtx) return;
    this.isLoading = true;

    for (const [levelKey, url] of Object.entries(this.soundUrls)) {
      const level = Number(levelKey) as RiskLevel;
      if (!url || this.soundBuffers.has(level)) continue;

      try {
        const resp = await fetch(url);
        if (resp.ok) {
          const arrayBuf = await resp.arrayBuffer();
          const audioBuf = await this.audioCtx.decodeAudioData(arrayBuf);
          this.soundBuffers.set(level, audioBuf);
        }
      } catch (e) {
        console.warn(`[AudioPlayer] Failed to load alert sound for level ${level}:`, e);
      }
    }
    this.isLoading = false;
  }

  /**
   * Plays the primary bundled Web Audio sound for the given risk level.
   * If enableVoice is true and spokenText is provided, optionally enqueues speechSynthesis.
   */
  public async playAlert(level: RiskLevel, options?: AlertSoundOptions): Promise<void> {
    if (level === RISK_LEVELS.NORMAL) return;

    await this.prime();

    // 1. Primary path: Web Audio API bundled clip
    const buffer = this.soundBuffers.get(level);
    if (this.audioCtx && buffer) {
      try {
        const source = this.audioCtx.createBufferSource();
        const gain = this.audioCtx.createGain();
        gain.gain.value = level === RISK_LEVELS.CRITICAL ? 1.0 : 0.7;
        source.buffer = buffer;
        source.connect(gain);
        gain.connect(this.audioCtx.destination);
        source.start(0);
      } catch (err) {
        console.warn('[AudioPlayer] Web Audio playback error:', err);
      }
    }

    // 2. Optional extra: Speech Synthesis for voice feedback
    if (options?.enableVoice && options.spokenText && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel(); // Cancel any lingering utterance
        const utterance = new SpeechSynthesisUtterance(options.spokenText);
        utterance.rate = level === RISK_LEVELS.CRITICAL ? 1.15 : 1.0;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
      } catch (speechErr) {
        console.warn('[AudioPlayer] SpeechSynthesis error:', speechErr);
      }
    }
  }
}

export const alertAudioPlayer = new AlertAudioPlayer();
