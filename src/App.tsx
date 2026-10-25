import React, { useState } from 'react';
import { Shield, Cpu, Activity, Volume2, Sparkles } from 'lucide-react';
import { CONFIG, DEFAULT_BASELINE_PROFILE } from './core/config';
import { RISK_LEVELS, RiskLevel } from './core/types';
import { alertAudioPlayer } from './io/speech/audioPlayer';
import { LandmarkerDelegate } from './io/camera/landmarkerLoader';

export const App: React.FC = () => {
  const [activeDelegate] = useState<LandmarkerDelegate>('GPU');
  const [fps] = useState<number>(30);
  const [lastSound, setLastSound] = useState<string>('None');

  const testAudio = async (level: RiskLevel, label: string, voiceText: string) => {
    setLastSound(label);
    await alertAudioPlayer.playAlert(level, {
      spokenText: voiceText,
      enableVoice: true,
    });
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-gray-100 p-6 flex flex-col items-center justify-center relative">
      {/* Dev Overlay: Active Delegate & FPS */}
      <aside aria-label="Dev Overlay" className="fixed top-4 right-4 z-50 flex items-center gap-3 px-3 py-1.5 rounded-lg bg-gray-900/90 border border-gray-700/60 backdrop-blur shadow-xl text-xs font-mono">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-gray-400">Delegate:</span>
          <span className="text-blue-300 font-semibold">{activeDelegate}</span>
        </div>
        <div className="h-3 w-px bg-gray-700" />
        <div className="flex items-center gap-1.5">
          <span className="text-gray-400">FPS:</span>
          <span className="text-emerald-400 font-semibold">{fps}</span>
        </div>
      </aside>

      <header className="max-w-4xl w-full flex items-center justify-between pb-6 border-b border-gray-800 mb-8">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              NeuroDrive AI
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                M0.5 Hardened
              </span>
            </h1>
            <p className="text-xs text-gray-400">Driver-Aware &amp; Vehicle-Aware Safety Co-Pilot</p>
          </div>
        </div>

        {/* Guardrail: On-device privacy badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
          <Shield className="w-3.5 h-3.5" />
          <span>On-device processing • No video leaves device</span>
        </div>
      </header>

      <main className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-5 rounded-xl bg-gray-900/60 border border-gray-800 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-300">
            <Activity className="w-4 h-4 text-blue-400" />
            Core Contracts Active
          </div>
          <p className="text-xs text-gray-400">
            Strict TypeScript contracts: DriverFeatures, VehicleFeatures, RiskAssessment, Alert.
          </p>
          <div className="text-[11px] font-mono text-gray-500 pt-2 border-t border-gray-800/80">
            Risk Levels: Normal({RISK_LEVELS.NORMAL}), Notice({RISK_LEVELS.NOTICE}), Warning({RISK_LEVELS.WARNING}), Critical({RISK_LEVELS.CRITICAL})
          </div>
        </div>

        <div className="p-5 rounded-xl bg-gray-900/60 border border-gray-800 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-300">
            <Sparkles className="w-4 h-4 text-yellow-400" />
            Cross-Platform Hardened
          </div>
          <p className="text-xs text-gray-400">
            Node LTS, exact pinned packages, Web Audio primary path, GPU with CPU auto-fallback.
          </p>
          <div className="text-[11px] font-mono text-gray-500 pt-2 border-t border-gray-800/80">
            Calibration: {CONFIG.calibration.demoDurationSec}s Demo / {CONFIG.calibration.fullDurationSec}s Full
          </div>
        </div>

        <div className="p-5 rounded-xl bg-gray-900/60 border border-gray-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-300">
              <Volume2 className="w-4 h-4 text-emerald-400" />
              Bundled Audio Clips
            </div>
            <span className="text-[10px] text-gray-500 font-mono">Last: {lastSound}</span>
          </div>
          <p className="text-xs text-gray-400">
            Offline WAV audio clips pre-buffered via Web Audio API.
          </p>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => testAudio(RISK_LEVELS.NOTICE, 'Notice', 'Caution')}
              className="px-2.5 py-1 text-xs rounded bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 transition-colors"
            >
              Notice
            </button>
            <button
              onClick={() => testAudio(RISK_LEVELS.WARNING, 'Warning', 'Warning, driver alert')}
              className="px-2.5 py-1 text-xs rounded bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30 transition-colors"
            >
              Warning
            </button>
            <button
              onClick={() => testAudio(RISK_LEVELS.CRITICAL, 'Critical', 'Pull over safely')}
              className="px-2.5 py-1 text-xs rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition-colors"
            >
              Critical
            </button>
          </div>
          <div className="text-[11px] font-mono text-emerald-400 pt-1 border-t border-gray-800/80">
            Profile: EAR {DEFAULT_BASELINE_PROFILE.earOpenBaseline}
          </div>
        </div>
      </main>

      <footer className="mt-8 text-center text-xs text-gray-500 max-w-xl">
        Prototype. Not a certified safety system. Estimates risk for educational and hackathon demonstration purposes.
      </footer>
    </div>
  );
};

export default App;
