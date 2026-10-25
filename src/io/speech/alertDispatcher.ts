import { RiskLevel, RISK_LEVELS } from '../../core/types';
import { CONFIG } from '../../core/config';
import { alertAudioPlayer } from './audioPlayer';

export interface AlertDispatchOptions {
  muted?: boolean;
  voiceEnabled?: boolean;
  customMessage?: string;
}

class AlertDispatcher {
  private lastSpokenTime = 0;
  private lastAlertLevel: RiskLevel = RISK_LEVELS.NORMAL;

  /**
   * Dispatches tiered alerts based on RiskLevel:
   * - NORMAL: No audio/speech
   * - NOTICE: Gentle chime
   * - WARNING: Chime + spoken warning ("Warning: driver drowsiness detected")
   * - CRITICAL: Alarm siren + urgent spoken instruction ("Critical: pull over safely")
   * 
   * Enforces voice alert cooldowns to avoid repetitive speech spam.
   */
  public async dispatch(level: RiskLevel, options?: AlertDispatchOptions): Promise<void> {
    const isMuted = options?.muted ?? false;
    const voiceEnabled = options?.voiceEnabled ?? true;
    const now = Date.now();

    if (level === RISK_LEVELS.NORMAL) {
      this.lastAlertLevel = RISK_LEVELS.NORMAL;
      return;
    }

    if (isMuted) {
      return;
    }

    const cooldownMs = CONFIG.fusion.voiceAlertCooldownSec * 1000;
    const isLevelEscalated = level > this.lastAlertLevel;
    const canSpeak = voiceEnabled && (now - this.lastSpokenTime >= cooldownMs || isLevelEscalated);

    let spokenText = '';
    if (canSpeak) {
      if (options?.customMessage) {
        spokenText = options.customMessage;
      } else if (level === RISK_LEVELS.WARNING) {
        spokenText = 'Warning: driver drowsiness detected';
      } else if (level === RISK_LEVELS.CRITICAL) {
        spokenText = 'Critical: pull over safely';
      }
    }

    await alertAudioPlayer.playAlert(level, {
      spokenText: spokenText || undefined,
      enableVoice: canSpeak && spokenText.length > 0,
    });

    if (spokenText) {
      this.lastSpokenTime = now;
    }
    this.lastAlertLevel = level;
  }

  public resetCooldown(): void {
    this.lastSpokenTime = 0;
    this.lastAlertLevel = RISK_LEVELS.NORMAL;
  }
}

export const alertDispatcher = new AlertDispatcher();
