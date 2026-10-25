import React, { useEffect, useRef } from 'react';
import { Target, CheckCircle2, RotateCcw, X, Sparkles } from 'lucide-react';
import { useNeuroDriveStore } from './store';
import { PersonalBaseline } from '../core/types';
import { CONFIG } from '../core/config';

interface CalibrationWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CalibrationWizard: React.FC<CalibrationWizardProps> = ({ isOpen, onClose }) => {
  const {
    calibrationStatus,
    calibrationMode,
    calibrationProgress,
    calibrationCountdownSec,
    activeBaseline,
    startCalibration,
    tickCalibration,
    completeCalibration,
    cancelCalibration,
    loadSavedBaseline,
  } = useNeuroDriveStore();

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (calibrationStatus === 'calibrating') {
      const totalSec =
        calibrationMode === 'demo_15s'
          ? CONFIG.calibration.demoDurationSec
          : CONFIG.calibration.fullDurationSec;

      let remaining = calibrationCountdownSec;

      timerRef.current = setInterval(() => {
        remaining -= 1;
        const progress = Math.min(100, Math.round(((totalSec - remaining) / totalSec) * 100));

        if (remaining <= 0) {
          if (timerRef.current) clearInterval(timerRef.current);

          // Build calibrated baseline
          const baseline: PersonalBaseline = {
            id: `baseline_${Date.now()}`,
            calibratedAt: Date.now(),
            mode: calibrationMode,
            earOpenBaseline: 0.30,
            earThreshold: Number((0.30 * CONFIG.calibration.earMultiplier).toFixed(3)),
            marClosedBaseline: 0.20,
            headPitchOffset: 0.0,
            headYawOffset: 0.0,
            normalBlinkRate: 18,
            vibrationBaselineRms: CONFIG.vehicle.normalVibrationRms,
            audioBaselineRms: CONFIG.vehicle.normalAudioRms,
            isComplete: true,
          };

          completeCalibration(baseline);
        } else {
          tickCalibration(remaining, progress);
        }
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [calibrationStatus, calibrationMode, completeCalibration, tickCalibration]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-5">
        {/* Close Button */}
        <button
          onClick={() => {
            if (calibrationStatus === 'calibrating') cancelCalibration();
            onClose();
          }}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Driver Baseline Calibration</h2>
            <p className="text-xs text-gray-400">
              Calibrates neutral eye aperture, resting head pose, and cabin ambient profile.
            </p>
          </div>
        </div>

        {/* Calibration Content State */}
        {calibrationStatus === 'idle' && (
          <div className="space-y-4">
            <p className="text-xs text-gray-300 leading-relaxed">
              Sit in your natural driving posture and look forward at the road. Select a calibration mode to begin:
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => startCalibration('demo_15s')}
                className="p-3.5 rounded-xl border border-blue-500/40 bg-blue-950/30 hover:bg-blue-900/40 text-left transition-all group"
              >
                <div className="flex items-center gap-2 text-sm font-semibold text-blue-300 group-hover:text-blue-200">
                  <Sparkles className="w-4 h-4 text-blue-400" />
                  15s Demo Mode
                </div>
                <div className="text-[11px] text-gray-400 mt-1">
                  Fast calibration for quick demonstration and testing.
                </div>
              </button>

              <button
                onClick={() => startCalibration('full_60s')}
                className="p-3.5 rounded-xl border border-gray-700 bg-gray-800/40 hover:bg-gray-800/80 text-left transition-all group"
              >
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-200 group-hover:text-white">
                  <RotateCcw className="w-4 h-4 text-purple-400" />
                  60s Full Mode
                </div>
                <div className="text-[11px] text-gray-400 mt-1">
                  Thorough personal baseline over a standard 60-second window.
                </div>
              </button>
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-gray-800">
              <span className="text-xs text-gray-500 font-mono">
                Current: {activeBaseline.mode} (EAR {activeBaseline.earThreshold})
              </span>
              <button
                onClick={() => {
                  loadSavedBaseline();
                  onClose();
                }}
                className="px-3 py-1.5 rounded-lg text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-colors"
              >
                Skip / Load Saved Profile
              </button>
            </div>
          </div>
        )}

        {calibrationStatus === 'calibrating' && (
          <div className="space-y-4 py-2">
            <div className="text-center space-y-1">
              <div className="text-3xl font-bold font-mono text-blue-400">
                {calibrationCountdownSec}s
              </div>
              <div className="text-xs text-gray-300 font-medium">
                Hold normal driving pose and look straight ahead...
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1">
              <div className="w-full bg-gray-800 h-3 rounded-full overflow-hidden">
                <div
                  className="bg-blue-500 h-full transition-all duration-300"
                  style={{ width: `${calibrationProgress}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-mono text-gray-500">
                <span>Mode: {calibrationMode}</span>
                <span>{calibrationProgress}%</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={cancelCalibration}
                className="px-3 py-1 text-xs text-gray-400 hover:text-white bg-gray-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {calibrationStatus === 'complete' && (
          <div className="space-y-4 text-center py-2">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Calibration Complete!</h3>
              <p className="text-xs text-gray-400 mt-1">
                Personalized thresholds bound to your eye shape and posture.
              </p>
            </div>

            <div className="bg-gray-950/60 p-3 rounded-xl border border-gray-800 grid grid-cols-2 gap-2 text-left text-xs font-mono">
              <div>
                <span className="text-gray-500">Open EAR:</span>{' '}
                <span className="text-emerald-400 font-bold">{activeBaseline.earOpenBaseline}</span>
              </div>
              <div>
                <span className="text-gray-500">Closure Threshold:</span>{' '}
                <span className="text-yellow-400 font-bold">{activeBaseline.earThreshold}</span>
              </div>
              <div>
                <span className="text-gray-500">Resting MAR:</span>{' '}
                <span className="text-cyan-400 font-bold">{activeBaseline.marClosedBaseline}</span>
              </div>
              <div>
                <span className="text-gray-500">Neutral Blinks:</span>{' '}
                <span className="text-purple-400 font-bold">{activeBaseline.normalBlinkRate}/min</span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition-colors shadow-lg shadow-blue-600/20"
            >
              Start Monitoring with Baseline
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
