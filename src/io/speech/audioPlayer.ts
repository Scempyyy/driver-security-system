import { RiskLevel, RISK_LEVELS, VolumeSettings } from '../../core/types';
import { CONFIG } from '../../core/config';
import { getAssetUrl } from '../../core/paths';

export interface AlertSoundOptions {
  spokenText?: string;
  enableVoice?: boolean;
}

class AlertAudioPlayer {
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private soundBuffers: Map<RiskLevel, AudioBuffer> = new Map();
  private currentSources: AudioBufferSourceNode[] = [];
  private isLoading = false;
  private isPrimed = false;

  private volumeSettings: VolumeSettings = {
    masterVolume: CONFIG.volume.defaultMasterVolume,
    soundVolume: CONFIG.volume.defaultSoundVolume,
    voiceVolume: CONFIG.volume.defaultVoiceVolume,
    muted: CONFIG.volume.defaultMuted,
  };

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
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!this.audioCtx) {
        this.audioCtx = new AudioCtxClass();
        this.masterGain = this.audioCtx.createGain();
        this.masterGain.connect(this.audioCtx.destination);
        this.applyGain();
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
   * Updates volume settings in real time and adjusts master GainNode immediately.
   */
  public setVolume(settings: VolumeSettings): void {
    this.volumeSettings = { ...settings };
    this.applyGain();
  }

  private applyGain(): void {
    if (!this.audioCtx || !this.masterGain) return;
    const { masterVolume, soundVolume, muted } = this.volumeSettings;
    const linearGain = muted ? 0.0 : (masterVolume / 100) * (soundVolume / 100);
    this.masterGain.gain.setValueAtTime(linearGain, this.audioCtx.currentTime);
  }

  /**
   * Stops all active audio playback and speech synthesis immediately.
   */
  public stop(): void {
    for (const src of this.currentSources) {
      try {
        src.stop();
        src.disconnect();
      } catch {}
    }
    this.currentSources = [];

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
  }

  /**
   * Picks the most natural English voice from window.speechSynthesis.getVoices().
   */
  private getBestVoice(): SpeechSynthesisVoice | null {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    // Prefer high-quality/natural English voices
    const preferredEnglish = voices.find(
      (v) =>
        v.lang.startsWith('en') &&
        (v.name.includes('Natural') ||
          v.name.includes('Google') ||
          v.name.includes('Samantha') ||
          v.name.includes('Daniel') ||
          v.name.includes('Karen') ||
          v.localService)
    );

    if (preferredEnglish) return preferredEnglish;

    const anyEnglish = voices.find((v) => v.lang.startsWith('en'));
    return anyEnglish || voices[0] || null;
  }

  /**
   * Plays the alert: Web Audio chime first, followed by short natural voice after ~0.5s delay.
   */
  public async playAlert(level: RiskLevel, options?: AlertSoundOptions): Promise<void> {
    if (level === RISK_LEVELS.NORMAL) return;

    await this.prime();

    // 1. Web Audio chime / siren
    const buffer = this.soundBuffers.get(level);
    if (this.audioCtx && this.masterGain && buffer) {
      try {
        const source = this.audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.masterGain);
        source.onended = () => {
          this.currentSources = this.currentSources.filter((s) => s !== source);
        };
        this.currentSources.push(source);
        source.start(0);
      } catch (err) {
        console.warn('[AudioPlayer] Web Audio playback error:', err);
      }
    }

    // 2. Speech Synthesis voice (if enabled, not muted, and text provided)
    const { masterVolume, voiceVolume, muted } = this.volumeSettings;
    const effectiveVoiceVol = muted ? 0.0 : (masterVolume / 100) * (voiceVolume / 100);

    if (
      options?.enableVoice &&
      options.spokenText &&
      effectiveVoiceVol > 0 &&
      typeof window !== 'undefined' &&
      'speechSynthesis' in window
    ) {
      const delayMs = CONFIG.voice.speechChimeDelayMs; // ~500ms chime delay
      setTimeout(() => {
        try {
          window.speechSynthesis.cancel(); // Cancel any lingering speech before speaking
          const utterance = new SpeechSynthesisUtterance(options.spokenText);
          utterance.volume = effectiveVoiceVol;
          utterance.rate = CONFIG.voice.speechRate; // 0.95 natural rate
          utterance.pitch = 1.0;

          const voice = this.getBestVoice();
          if (voice) {
            utterance.voice = voice;
          }

          window.speechSynthesis.speak(utterance);
        } catch (speechErr) {
          console.warn('[AudioPlayer] SpeechSynthesis error:', speechErr);
        }
      }, delayMs);
    }
  }

  /**
   * Plays a test sound chime and short test speech at current volume settings.
   */
  public async playTestSound(): Promise<void> {
    await this.playAlert(RISK_LEVELS.WARNING, {
      spokenText: 'You seem drowsy.',
      enableVoice: true,
    });
  }
}

export const alertAudioPlayer = new AlertAudioPlayer();
