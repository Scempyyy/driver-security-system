import React, { useEffect, useRef } from 'react';
import { Target, CheckCircle2, RotateCcw, X, Sparkles, Camera } from 'lucide-react';
import { useNeuroDriveStore } from './store';
import { CalibrationMode } from '../core/types';
import { CONFIG } from '../core/config';
import {
  createCalibrationSession,
  addCalibrationSample,
  saveBaselineToStorage,
  CalibrationSession,
} from '../core/baseline/calibration';

interface CalibrationWizardProps {
  isOpen: boolean;
  onClose: () => void;
  isCameraActive?: boolean;
  onStartCamera?: () => Promise<void> | void;
}

export const CalibrationWizard: React.FC<CalibrationWizardProps> = ({
  isOpen,
  onClose,
  isCameraActive = false,
  onStartCamera,
}) => {
  const {
    calibrationStatus,
    calibrationMode,
    calibrationProgress,
    calibrationCountdownSec,
    activeBaseline,
    driverFeatures,
    startCalibration,
    tickCalibration,
    completeCalibration,
    cancelCalibration,
    loadSavedBaseline,
  } = useNeuroDriveStore();

  const sessionRef = useRef<CalibrationSession | null>(null);
  const sampleTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleStartCalibration = async (mode: CalibrationMode) => {
    if (!isCameraActive && onStartCamera) {
      try {
        await onStartCamera();
      } catch (err) {
        console.warn('[CalibrationWizard] Could not auto-start camera for calibration:', err);
      }
    }
    sessionRef.current = createCalibrationSession(mode, Date.now());
    startCalibration(mode);
  };

  useEffect(() => {
    if (calibrationStatus === 'calibrating') {
      const totalSec =
        calibrationMode === 'demo_15s'
          ? CONFIG.calibration.demoDurationSec
          : CONFIG.calibration.fullDurationSec;

      if (!sessionRef.current) {
        sessionRef.current = createCalibrationSession(calibrationMode, Date.now());
      }

      // Sample every 100ms from live driver features
      sampleTimerRef.current = setInterval(() => {
        const currentDriver = useNeuroDriveStore.getState().driverFeatures;
        if (sessionRef.current) {
          const progressResult = addCalibrationSample(sessionRef.current, {
            ear: currentDriver.ear,
            mar: currentDriver.mar,
            headPitch: currentDriver.headPitch,
            headYaw: currentDriver.headYaw,
            quality: currentDriver.quality,
            blinkRate: currentDriver.blinkRate,
            timestamp: Date.now(),
          });

          const remaining = Math.max(0, Math.ceil(totalSec - progressResult.elapsedSec));
          const pct = Math.min(100, Math.round(progressResult.progress * 100));

          if (progressResult.isComplete && progressResult.session.result) {
            if (sampleTimerRef.current) clearInterval(sampleTimerRef.current);
            const baseline = progressResult.session.result;
            saveBaselineToStorage(baseline);
            completeCalibration(baseline);
          } else {
            tickCalibration(remaining, pct);
          }
        }
      }, 100);
    }

    return () => {
      if (sampleTimerRef.current) clearInterval(sampleTimerRef.current);
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
              Calibrates neutral eye aperture, resting head pose, and personal safety thresholds.
            </p>
          </div>
        </div>

        {/* Camera Warning If Inactive */}
        {!isCameraActive && calibrationStatus === 'idle' && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-950/40 border border-amber-500/40 text-amber-300 text-xs">
            <Camera className="w-4 h-4 shrink-0" />
            <span>Webcam is currently off. Starting calibration will automatically request camera access.</span>
          </div>
        )}

        {/* Calibration Content State */}
        {calibrationStatus === 'idle' && (
          <div className="space-y-4">
            <p className="text-xs text-gray-300 leading-relaxed">
              Sit in your natural driving posture and look forward at the screen. Select a calibration mode to begin:
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleStartCalibration('demo_15s')}
                className="p-3.5 rounded-xl border border-blue-500/40 bg-blue-950/30 hover:bg-blue-900/40 text-left transition-all group"
              >
                <div className="flex items-center gap-2 text-sm font-semibold text-blue-300 group-hover:text-blue-200">
                  <Sparkles className="w-4 h-4 text-blue-400" />
                  15s Demo Mode
                </div>
                <div className="text-[11px] text-gray-400 mt-1">
                  Fast live calibration for quick demonstration and testing.
                </div>
              </button>

              <button
                onClick={() => handleStartCalibration('full_60s')}
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
                Current Threshold: EAR {activeBaseline.earThreshold.toFixed(3)}
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
          <div className="space-y-5 py-2">
            <div className="text-center space-y-1">
              <div className="text-4xl font-extrabold text-white font-mono tracking-tight">
                {calibrationCountdownSec}s
              </div>
              <p className="text-xs text-gray-300">
                Please look straight ahead naturally. Sampling eye aperture and head pose...
              </p>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] font-mono text-gray-400">
                <span>Calibrating ({calibrationMode === 'demo_15s' ? '15s Demo' : '60s Full'})</span>
                <span className="text-blue-400">{calibrationProgress}%</span>
              </div>
              <div className="h-2.5 w-full bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-200"
                  style={{ width: `${calibrationProgress}%` }}
                />
              </div>
            </div>

            {/* Real-Time Live Feed Sample Readout */}
            <div className="p-3 rounded-xl bg-gray-950/80 border border-gray-800 text-[11px] font-mono grid grid-cols-2 gap-2 text-gray-400">
              <div>Live EAR: <span className="text-white font-semibold">{driverFeatures.ear.toFixed(3)}</span></div>
              <div>Live Pitch: <span className="text-white font-semibold">{driverFeatures.headPitch.toFixed(1)}°</span></div>
              <div>Face Quality: <span className="text-white font-semibold">{(driverFeatures.quality * 100).toFixed(0)}%</span></div>
              <div>Live Yaw: <span className="text-white font-semibold">{driverFeatures.headYaw.toFixed(1)}°</span></div>
            </div>

            <button
              onClick={() => cancelCalibration()}
              className="w-full py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium transition-colors"
            >
              Cancel Calibration
            </button>
          </div>
        )}

        {calibrationStatus === 'complete' && (
          <div className="space-y-5 text-center py-2">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-white">Calibration Successful!</h3>
              <p className="text-xs text-gray-400">
                Your personal baseline profile has been saved and applied to all risk thresholds.
              </p>
            </div>

            {/* Calibrated Values Summary */}
            <div className="p-3.5 rounded-xl bg-gray-950/60 border border-gray-800/80 text-left font-mono text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-gray-400">Baseline Open-Eye EAR:</span>
                <span className="text-emerald-400 font-semibold">{activeBaseline.earOpenBaseline.toFixed(3)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Derived Closure Threshold:</span>
                <span className="text-blue-400 font-semibold">{activeBaseline.earThreshold.toFixed(3)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Neutral Head Pitch Offset:</span>
                <span className="text-gray-200">{activeBaseline.headPitchOffset.toFixed(1)}°</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Neutral Head Yaw Offset:</span>
                <span className="text-gray-200">{activeBaseline.headYawOffset.toFixed(1)}°</span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow transition-colors"
            >
              Done &amp; Resume Driving
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
