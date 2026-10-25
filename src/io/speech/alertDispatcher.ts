import { RiskLevel, RISK_LEVELS, VolumeSettings } from '../../core/types';
import { CONFIG } from '../../core/config';
import { alertAudioPlayer } from './audioPlayer';

export interface AlertDispatchOptions {
  volumeSettings?: VolumeSettings;
  silencedLevel?: RiskLevel | null;
  voiceEnabled?: boolean;
  muted?: boolean;
  customMessage?: string;
}

class AlertDispatcher {
  private lastSpokenTime = 0;
  private lastAlertLevel: RiskLevel = RISK_LEVELS.NORMAL;

  /**
   * Tiered alerts:
   * - NORMAL: silent
   * - NOTICE: silent (visual banner only)
   * - WARNING: chime + natural voice ("You seem drowsy. Please take a break soon.")
   * - CRITICAL: chime/siren + urgent natural voice ("Pull over safely.")
   *
   * Voice rules:
   * - Cancel any current speech before speaking
   * - Speak once when level changes
   * - Repeat at most every 20s while level persists
   * - Play chime first, then speak after ~0.5s
   * - Never overlap voices
   * - If silencedLevel is equal to or higher than current level, audio and voice are suppressed
   */
  public async dispatch(level: RiskLevel, options?: AlertDispatchOptions): Promise<void> {
    const volume = options?.volumeSettings ?? {
      masterVolume: CONFIG.volume.defaultMasterVolume,
      soundVolume: CONFIG.volume.defaultSoundVolume,
      voiceVolume: CONFIG.volume.defaultVoiceVolume,
      muted: options?.muted ?? false,
    };
    alertAudioPlayer.setVolume(volume);

    const isSilenced = options?.silencedLevel !== null && options?.silencedLevel !== undefined && options.silencedLevel >= level;
    const isMuted = Boolean(options?.muted) || volume.muted || volume.masterVolume === 0 || isSilenced;
    const voiceEnabled = (options?.voiceEnabled ?? true) && !isMuted;
    const now = Date.now();

    if (level === RISK_LEVELS.NORMAL) {
      this.lastAlertLevel = RISK_LEVELS.NORMAL;
      alertAudioPlayer.stop();
      return;
    }

    // NOTICE is silent visual only per rule 1 & 2
    if (level === RISK_LEVELS.NOTICE) {
      this.lastAlertLevel = level;
      return;
    }

    // Check level change or repeat interval (20s)
    const isLevelEscalated = level > this.lastAlertLevel;
    const repeatIntervalMs = CONFIG.voice.speechRepeatIntervalSec * 1000;
    const canRepeat = now - this.lastSpokenTime >= repeatIntervalMs;

    if (!isLevelEscalated && !canRepeat) {
      return;
    }

    let spokenText = '';
    if (options?.customMessage) {
      spokenText = options.customMessage;
    } else if (level === RISK_LEVELS.WARNING) {
      spokenText = CONFIG.voice.warningSpokenText; // "You seem drowsy. Please take a break soon."
    } else if (level === RISK_LEVELS.CRITICAL) {
      spokenText = CONFIG.voice.criticalSpokenText; // "Pull over safely."
    }

    if (!isMuted) {
      await alertAudioPlayer.playAlert(level, {
        spokenText: spokenText || undefined,
        enableVoice: voiceEnabled && spokenText.length > 0,
      });

      if (spokenText) {
        this.lastSpokenTime = now;
      }
    }

    this.lastAlertLevel = level;
  }

  /**
   * Silences current alert sound and voice immediately.
   */
  public silence(): void {
    alertAudioPlayer.stop();
  }

  public resetCooldown(): void {
    this.lastSpokenTime = 0;
    this.lastAlertLevel = RISK_LEVELS.NORMAL;
    alertAudioPlayer.stop();
  }
}

export const alertDispatcher = new AlertDispatcher();
