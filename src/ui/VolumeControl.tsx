import React, { useState, useRef, useEffect } from 'react';
import { Volume2, Volume1, VolumeX, Sliders, Play } from 'lucide-react';
import { useNeuroDriveStore } from './store';
import { alertAudioPlayer } from '../io/speech/audioPlayer';

export const VolumeControl: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isPlayingTest, setIsPlayingTest] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  const { volumeSettings, setVolumeSettings, setAudioMuted } = useNeuroDriveStore();
  const { masterVolume, soundVolume, voiceVolume, muted } = volumeSettings;

  // Sync AudioPlayer with initial settings
  useEffect(() => {
    alertAudioPlayer.setVolume(volumeSettings);
  }, [volumeSettings]);

  // Close popup when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleTestSound = async () => {
    if (isPlayingTest) return;
    setIsPlayingTest(true);
    await alertAudioPlayer.playTestSound();
    setTimeout(() => setIsPlayingTest(false), 2000);
  };

  const isZero = masterVolume === 0 || muted;
  const isLow = masterVolume > 0 && masterVolume <= 50 && !muted;

  return (
    <div className="relative inline-block text-left" ref={popupRef}>
      {/* Header Volume Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
          muted || masterVolume === 0
            ? 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
            : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700/60'
        }`}
        title="Volume & Audio Settings (Press M to Mute)"
        aria-label="Volume settings"
      >
        {isZero ? (
          <VolumeX className="w-4 h-4 text-red-400" />
        ) : isLow ? (
          <Volume1 className="w-4 h-4 text-amber-400" />
        ) : (
          <Volume2 className="w-4 h-4 text-emerald-400" />
        )}
        <span className="font-mono">{muted ? 'MUTED' : `${masterVolume}%`}</span>
      </button>

      {/* Volume Popup Modal */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl p-4 z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-400" />
              <span className="text-sm font-semibold text-slate-200">Volume Settings</span>
            </div>
            <button
              onClick={() => {
                const nextMuted = !muted;
                setAudioMuted(nextMuted);
                setVolumeSettings({ muted: nextMuted });
              }}
              className={`px-2.5 py-1 rounded text-xs font-semibold uppercase tracking-wider transition ${
                muted
                  ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
              }`}
            >
              {muted ? 'Unmute' : 'Mute (M)'}
            </button>
          </div>

          <div className="mt-4 space-y-4">
            {/* Master Volume */}
            <div>
              <div className="flex justify-between text-xs font-medium text-slate-300 mb-1">
                <span>Master Volume</span>
                <span className="font-mono text-indigo-400">{masterVolume}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={masterVolume}
                onChange={(e) => setVolumeSettings({ masterVolume: Number(e.target.value) })}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>

            {/* Alarm Sounds Slider */}
            <div>
              <div className="flex justify-between text-xs font-medium text-slate-300 mb-1">
                <span>Alarm Sounds (Chimes / Beeps)</span>
                <span className="font-mono text-cyan-400">{soundVolume}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={soundVolume}
                onChange={(e) => setVolumeSettings({ soundVolume: Number(e.target.value) })}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
            </div>

            {/* Spoken Voice Slider */}
            <div>
              <div className="flex justify-between text-xs font-medium text-slate-300 mb-1">
                <span>Spoken Voice Alerts</span>
                <span className="font-mono text-emerald-400">{voiceVolume}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={voiceVolume}
                onChange={(e) => setVolumeSettings({ voiceVolume: Number(e.target.value) })}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
            </div>
          </div>

          {/* Test Sound Button */}
          <div className="mt-5 pt-3 border-t border-slate-800">
            <button
              onClick={handleTestSound}
              disabled={isPlayingTest}
              className="w-full py-2 px-3 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200 text-xs font-medium flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 text-indigo-300 fill-current" />
              <span>{isPlayingTest ? 'Playing Test...' : 'Test Sound & Voice'}</span>
            </button>
            <p className="text-[10px] text-slate-400 mt-2 text-center">
              Plays chime and speaks sample prompt at set volume
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
