import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Cpu,
  RotateCcw,
  Sparkles,
  Camera,
  BellOff,
} from 'lucide-react';
import { useNeuroDriveStore } from './ui/store';
import { RISK_LEVELS } from './core/types';
import { CONFIG } from './core/config';
import { alertDispatcher } from './io/speech/alertDispatcher';
import { CameraManager, CameraStatus } from './io/camera/cameraManager';
import { FeatureExtractor } from './core/driver/featureExtractor';
import { evaluateRisk, createInitialRiskState, RiskEngineState } from './core/fusion/riskEngine';
import { VehicleManager } from './core/vehicle/vehicleManager';
import { renderFaceMesh } from './ui/meshRenderer';
import { FaceLandmarkerResult } from '@mediapipe/tasks-vision';

import { LivePanel } from './ui/LivePanel';
import { DriverGauges } from './ui/DriverGauges';
import { VehiclePanel } from './ui/VehiclePanel';
import { RiskTimeline } from './ui/RiskTimeline';
import { ExplainCard } from './ui/ExplainCard';
import { AlertLog } from './ui/AlertLog';
import { CalibrationWizard } from './ui/CalibrationWizard';
import { SimulatedFamilyNotification } from './ui/SimulatedFamilyNotification';
import { PrivacyBadge } from './ui/PrivacyBadge';
import { VolumeControl } from './ui/VolumeControl';

export const App: React.FC = () => {
  const {
    audioMuted,
    setAudioMuted,
    voiceEnabled,
    silencedLevel,
    silenceAlarm,
    unSilenceAlarm,
    riskAssessment,
    activeBaseline,
    addAlert,
    setRiskAssessment,
    updateDriverFeatures,
    updateVehicleFeatures,
    setSimulatorPreset,
  } = useNeuroDriveStore();

  const [isCalibrationOpen, setIsCalibrationOpen] = useState(false);
  const [activeDelegate, setActiveDelegate] = useState<'GPU' | 'CPU'>('GPU');
  const [fps, setFps] = useState<number>(0);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle');
  const [cameraError, setCameraError] = useState<string>('');
  const [hideVideo, setHideVideo] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const cameraManagerRef = useRef<CameraManager | null>(null);
  const featureExtractorRef = useRef<FeatureExtractor>(new FeatureExtractor(activeBaseline));
  const vehicleManagerRef = useRef<VehicleManager | null>(null);
  const riskEngineStateRef = useRef<RiskEngineState>(createInitialRiskState(Date.now()));

  // Keep feature extractor updated with calibrated baseline
  useEffect(() => {
    featureExtractorRef.current.updateBaseline(activeBaseline);
  }, [activeBaseline]);

  // Initialize and run VehicleManager for continuous vehicle signals
  useEffect(() => {
    const vehicleMgr = new VehicleManager({
      initialSource: 'simulated',
      initialPreset: 'NORMAL',
      baseline: activeBaseline,
    });
    vehicleManagerRef.current = vehicleMgr;

    vehicleMgr.subscribe((features) => {
      updateVehicleFeatures(features);
    });

    vehicleMgr.start(100); // 10 Hz telemetry loop

    return () => {
      vehicleMgr.stop();
    };
  }, [updateVehicleFeatures, activeBaseline]);

  // Handle incoming face landmarker frames from live webcam
  const handleFrameResult = useCallback(
    (result: FaceLandmarkerResult, timestampMs: number) => {
      const landmarks = result.faceLandmarks?.[0];
      const matrix = result.facialTransformationMatrixes?.[0];

      // 1. Extract live DriverFeatures strictly from real MediaPipe detections
      const features = featureExtractorRef.current.extract(
        {
          landmarks,
          matrix,
          timestampMs,
        },
        timestampMs
      );

      // Update store with live measured features
      updateDriverFeatures(features);

      // 2. Render live face mesh onto canvas overlay
      if (canvasRef.current) {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (video && video.videoWidth > 0) {
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }
        } else if (canvas.width !== 640) {
          canvas.width = 640;
          canvas.height = 480;
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          const earThreshold = activeBaseline.earThreshold;
          renderFaceMesh(ctx, landmarks, canvas.width, canvas.height, {
            isEyeClosed: features.faceDetected && features.ear < earThreshold,
            isYawning: features.yawning,
            isOffRoad: features.eyesOffRoadSec >= 2.0,
            hideVideo,
            headYawDeg: features.headYaw,
            headPitchDeg: features.headPitch,
          });
        }
      }

      // 3. Evaluate live risk through pure rule-based fusion engine
      const currentVehicle = useNeuroDriveStore.getState().vehicleFeatures;
      const evaluation = evaluateRisk(
        features,
        currentVehicle,
        activeBaseline,
        riskEngineStateRef.current
      );

      riskEngineStateRef.current = evaluation.state;
      setRiskAssessment(evaluation.assessment);

      const store = useNeuroDriveStore.getState();
      // Re-arm silenced alarm if risk level dropped to NORMAL or increased above previously silenced level
      if (store.silencedLevel !== null) {
        if (evaluation.assessment.level === RISK_LEVELS.NORMAL || evaluation.assessment.level > store.silencedLevel) {
          unSilenceAlarm();
        }
      }

      // Reset alertDispatcher when returning to NORMAL so alarms stop and cooldowns reset cleanly
      if (evaluation.assessment.level === RISK_LEVELS.NORMAL) {
        alertDispatcher.dispatch(RISK_LEVELS.NORMAL);
      }

      // 4. Dispatch alert if engine fired one
      if (evaluation.alert) {
        addAlert(evaluation.alert);
        const currentStore = useNeuroDriveStore.getState();

        // Check whether the alert is primarily due to distraction / eyes off road
        const isHeadTurnedAway = features.eyesOffRoadSec >= CONFIG.driver.headYawNoticeSec;
        const hasOffRoadFactor = evaluation.assessment.factors.some(
          (f) => f.id === 'attention_drift' || f.id === 'eyes_off_road'
        );
        const isOffRoadAlert =
          features.eyesOffRoadSec >= CONFIG.driver.headYawWarningSec ||
          (isHeadTurnedAway && features.longClosureSec < CONFIG.driver.longClosureNoticeSec) ||
          (hasOffRoadFactor && features.longClosureSec < CONFIG.driver.longClosureNoticeSec);

        let customMessage: string | undefined = undefined;
        if (evaluation.alert.level === RISK_LEVELS.WARNING) {
          if (isOffRoadAlert) {
            customMessage = CONFIG.voice.distractionSpokenText; // "Please keep your eyes on the road."
          } else {
            customMessage = CONFIG.voice.warningSpokenText; // "You seem drowsy. Please take a break soon."
          }
        }

        alertDispatcher.dispatch(evaluation.alert.level, {
          volumeSettings: currentStore.volumeSettings,
          silencedLevel: currentStore.silencedLevel,
          voiceEnabled: currentStore.voiceEnabled,
          customMessage,
        });
      }
    },
    [activeBaseline, hideVideo, updateDriverFeatures, setRiskAssessment, addAlert, unSilenceAlarm]
  );

  // Start live webcam stream and FaceLandmarker
  const startCamera = useCallback(async () => {
    try {
      setCameraError('');
      if (!cameraManagerRef.current) {
        cameraManagerRef.current = new CameraManager({
          width: 640,
          height: 480,
          onFrameResult: (res, t) => handleFrameResult(res, t),
          onFpsUpdate: (liveFps) => setFps(liveFps),
          onDelegateReady: (del) => setActiveDelegate(del),
          onStatusChange: (status, msg) => {
            setCameraStatus(status);
            if (msg) setCameraError(msg);
          },
          onError: (err, status) => {
            console.error('[CameraManager Error]', err);
            setCameraStatus(status);
            setCameraError(err.message);
          },
        });
      }

      const videoEl = videoRef.current;
      if (videoEl) {
        await cameraManagerRef.current.start(videoEl);
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.warn('[App] Camera startup halted:', error.message);
    }
  }, [handleFrameResult]);

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (cameraManagerRef.current) {
      cameraManagerRef.current.stop();
    }
    setCameraStatus('idle');
    setFps(0);

    // Clear canvas
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }

    // Reset driver features to safe zeroed state (no fake numbers)
    updateDriverFeatures({
      faceDetected: false,
      quality: 0.0,
      ear: 0.0,
      perclos60: 0.0,
      blinkRate: 0,
      longClosureSec: 0,
      mar: 0.0,
      yawning: false,
      headPitch: 0.0,
      headYaw: 0.0,
      headRoll: 0.0,
      eyesOffRoadSec: 0.0,
    });
  }, [updateDriverFeatures]);

  // Keyboard shortcuts: Space / Esc to silence active alarm, M to toggle mute
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept typing in inputs or sliders
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.code === 'Space' || e.key === 'Escape') {
        const store = useNeuroDriveStore.getState();
        if (store.riskAssessment.level >= RISK_LEVELS.WARNING && store.silencedLevel !== store.riskAssessment.level) {
          e.preventDefault();
          alertDispatcher.silence();
          silenceAlarm();
        }
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        const store = useNeuroDriveStore.getState();
        const nextMuted = !store.volumeSettings.muted;
        setAudioMuted(nextMuted);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [silenceAlarm, setAudioMuted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cameraManagerRef.current) {
        cameraManagerRef.current.dispose();
      }
    };
  }, []);

  // Quick Demo Scenario Trigger (for reliable demo fallback/presentation)
  const triggerSimulatedScenario = (scenario: 'normal' | 'drowsy' | 'compound' | 'distracted') => {
    const now = Date.now();
    switch (scenario) {
      case 'drowsy': {
        updateDriverFeatures({
          faceDetected: true,
          quality: 0.95,
          ear: 0.17,
          longClosureSec: 2.1,
          perclos60: 0.28,
          yawning: false,
          eyesOffRoadSec: 0.0,
        });
        const assessment = {
          t: now,
          driverRisk: 0.72,
          vehicleRisk: 0.05,
          fusedRisk: 0.68,
          level: RISK_LEVELS.WARNING,
          confidence: 0.94,
          factors: [
            {
              id: 'prolonged_closure',
              label: 'Prolonged Eye Closure',
              contribution: 0.55,
              evidence: 'Eyes closed 2.1 s (threshold 1.8 s)',
            },
            {
              id: 'perclos_high',
              label: 'Elevated PERCLOS Window',
              contribution: 0.35,
              evidence: '28% closure in last 60s (threshold 25%)',
            },
          ],
          explanation:
            'Driver eye closure exceeded 2.1s with 28% PERCLOS accumulation. Spoken warning and audible alert active.',
          compoundEscalation: false,
        };
        setRiskAssessment(assessment);
        addAlert({
          id: `alert_${now}`,
          t: now,
          level: RISK_LEVELS.WARNING,
          assessment,
          acknowledged: false,
        });
        alertDispatcher.dispatch(RISK_LEVELS.WARNING, {
          muted: audioMuted,
          voiceEnabled,
        });
        break;
      }
      case 'compound': {
        setSimulatorPreset('BRAKE_JUDDER');
        updateDriverFeatures({
          faceDetected: true,
          quality: 0.96,
          ear: 0.15,
          longClosureSec: 2.4,
          perclos60: 0.32,
          yawning: false,
          eyesOffRoadSec: 0.0,
        });
        const assessment = {
          t: now,
          driverRisk: 0.78,
          vehicleRisk: 0.62,
          fusedRisk: 0.88,
          level: RISK_LEVELS.CRITICAL,
          confidence: 0.96,
          factors: [
            {
              id: 'eyes_closed_microsleep',
              label: 'Severe Driver Microsleep',
              contribution: 0.45,
              evidence: 'Eyes closed 2.4 s',
            },
            {
              id: 'brake_judder_anomaly',
              label: 'Brake Judder Vibration',
              contribution: 0.35,
              evidence: 'Vibration 0.62 m/s² (threshold 0.45 m/s²)',
            },
            {
              id: 'compound_multiplier',
              label: 'Compound Risk Escalation',
              contribution: 0.20,
              evidence: 'Driver Warning + Active Vehicle Anomaly escalated to CRITICAL',
            },
          ],
          explanation:
            'Eyes closed 2.4s plus active Brake Judder vibration (0.62 m/s²). Risk raised to CRITICAL because both appear together.',
          compoundEscalation: true,
        };
        setRiskAssessment(assessment);
        addAlert({
          id: `alert_${now}`,
          t: now,
          level: RISK_LEVELS.CRITICAL,
          assessment,
          acknowledged: false,
        });
        alertDispatcher.dispatch(RISK_LEVELS.CRITICAL, {
          muted: audioMuted,
          voiceEnabled,
        });
        break;
      }
      case 'distracted': {
        updateDriverFeatures({
          faceDetected: true,
          quality: 0.92,
          ear: 0.28,
          longClosureSec: 0.0,
          headYaw: 32.0,
          eyesOffRoadSec: 3.2,
          yawning: false,
        });
        const assessment = {
          t: now,
          driverRisk: 0.65,
          vehicleRisk: 0.02,
          fusedRisk: 0.65,
          level: RISK_LEVELS.WARNING,
          confidence: 0.92,
          factors: [
            {
              id: 'attention_drift',
              label: 'Eyes Off Road (Head Turned)',
              contribution: 0.70,
              evidence: 'Head yaw 32.0° away for 3.2 s (threshold 3.0 s)',
            },
          ],
          explanation: 'Driver head turned 32.0° away from forward roadway for 3.2s.',
          compoundEscalation: false,
        };
        setRiskAssessment(assessment);
        addAlert({
          id: `alert_${now}`,
          t: now,
          level: RISK_LEVELS.WARNING,
          assessment,
          acknowledged: false,
        });
        alertDispatcher.dispatch(RISK_LEVELS.WARNING, {
          muted: audioMuted,
          voiceEnabled,
          customMessage: CONFIG.voice.distractionSpokenText,
        });
        break;
      }
      case 'normal':
      default: {
        setSimulatorPreset('NORMAL');
        updateDriverFeatures({
          faceDetected: true,
          quality: 0.95,
          ear: 0.28,
          longClosureSec: 0.0,
          perclos60: 0.04,
          headPitch: 0.0,
          headYaw: 0.0,
          headRoll: 0.0,
          yawning: false,
          eyesOffRoadSec: 0.0,
        });
        const assessment = {
          t: now,
          driverRisk: 0.05,
          vehicleRisk: 0.02,
          fusedRisk: 0.04,
          level: RISK_LEVELS.NORMAL,
          confidence: 0.95,
          factors: [
            {
              id: 'nominal_baseline',
              label: 'Driver Focused & Alert',
              contribution: 0.05,
              evidence: 'EAR 0.28 (Nominal baseline)',
            },
          ],
          explanation: 'Driver alert with eyes focused on the road. Vehicle telemetry normal.',
          compoundEscalation: false,
        };
        setRiskAssessment(assessment);
        break;
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-gray-100 p-4 md:p-6 flex flex-col items-center">
      {/* Dev Overlay: Delegate & FPS */}
      <aside
        aria-label="Dev Overlay"
        className="fixed top-4 right-4 z-40 flex items-center gap-3 px-3 py-1.5 rounded-lg bg-gray-900/90 border border-gray-700/60 backdrop-blur shadow-xl text-xs font-mono"
      >
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${cameraStatus === 'active' ? 'bg-blue-400 animate-pulse' : 'bg-gray-500'}`} />
          <span className="text-gray-400">Delegate:</span>
          <span className="text-blue-300 font-semibold">{activeDelegate}</span>
        </div>
        <div className="h-3 w-px bg-gray-700" />
        <div className="flex items-center gap-1.5">
          <span className="text-gray-400">FPS:</span>
          <span className="text-emerald-400 font-semibold">{fps}</span>
        </div>
      </aside>

      {/* Top Application Header */}
      <header className="max-w-7xl w-full flex flex-col md:flex-row items-start md:items-center justify-between pb-5 border-b border-gray-800 gap-4 mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 shadow-md">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white">NeuroDrive AI</h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                Co-Pilot MVP
              </span>
            </div>
            <p className="text-xs text-gray-400">Driver-Aware &amp; Vehicle-Aware Safety Co-Pilot</p>
          </div>
        </div>

        {/* Global Action & Guardrail Ribbon */}
        <div className="flex flex-wrap items-center gap-3">
          <PrivacyBadge />

          {/* Quick Start Camera if stopped */}
          {cameraStatus !== 'active' && (
            <button
              onClick={startCamera}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow transition-colors"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Start Camera</span>
            </button>
          )}

          {/* Calibration Trigger */}
          <button
            onClick={() => setIsCalibrationOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs font-medium text-gray-200 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-blue-400" />
            <span>Calibrate Baseline</span>
          </button>

          {/* Volume Settings Popup (replaces individual speaker/mic icons) */}
          <VolumeControl />
        </div>
      </header>

      {/* Prominent Active Alarm Silence Banner */}
      {riskAssessment.level >= RISK_LEVELS.WARNING && silencedLevel !== riskAssessment.level && (
        <div className="max-w-7xl w-full mb-6 p-4 rounded-xl bg-red-600/20 border-2 border-red-500/80 backdrop-blur shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-red-600 text-white shadow">
              <BellOff className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-red-100 uppercase tracking-wide">
                  {riskAssessment.level === RISK_LEVELS.CRITICAL ? 'Critical Danger Alert' : 'Driver Warning Alert'}
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-red-500/30 text-red-200 border border-red-400/40 font-mono">
                  ACTIVE
                </span>
              </div>
              <p className="text-xs text-red-200/90 mt-0.5">
                {riskAssessment.explanation || 'Audible alert and spoken warning are sounding.'}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              alertDispatcher.silence();
              silenceAlarm();
            }}
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-red-600 hover:bg-red-500 active:scale-95 text-white font-bold text-sm shadow-lg flex items-center justify-center gap-2 border border-red-300 transition-all cursor-pointer"
            title="Silence audio alarm (Shortcut: Space or Esc)"
          >
            <BellOff className="w-5 h-5" />
            <span>Silence Alarm</span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-red-700/80 border border-red-400 font-mono text-red-100 ml-1">
              Space / Esc
            </span>
          </button>
        </div>
      )}

      {/* Demo Scenario Quick-Jump Bar */}
      <div className="max-w-7xl w-full bg-gray-900/60 border border-gray-800 rounded-xl p-3 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-gray-300">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span className="font-semibold">Quick Demo Scenarios:</span>
          <span className="text-gray-500 hidden md:inline">Instant trigger for live presentation</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => triggerSimulatedScenario('normal')}
            className="px-2.5 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-colors"
          >
            Normal (Level 0)
          </button>
          <button
            onClick={() => triggerSimulatedScenario('distracted')}
            className="px-2.5 py-1 text-xs rounded bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 transition-colors"
          >
            Distracted / Off-Road (Notice)
          </button>
          <button
            onClick={() => triggerSimulatedScenario('drowsy')}
            className="px-2.5 py-1 text-xs rounded bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30 transition-colors"
          >
            Drowsy Microsleep (Warning)
          </button>
          <button
            onClick={() => triggerSimulatedScenario('compound')}
            className="px-2.5 py-1 text-xs rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition-colors font-bold"
          >
            ⚡ Compound Escalation (Critical)
          </button>
        </div>
      </div>

      {/* Main Grid Dashboard */}
      <main className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (5 cols): Live Vision Panel & Driver Gauges */}
        <section className="lg:col-span-5 flex flex-col space-y-6">
          <LivePanel
            videoRef={videoRef}
            canvasRef={canvasRef}
            fps={fps}
            delegate={activeDelegate}
            cameraStatus={cameraStatus}
            cameraError={cameraError}
            hideVideo={hideVideo}
            onToggleHideVideo={() => setHideVideo(!hideVideo)}
            onStartCamera={startCamera}
            onStopCamera={stopCamera}
          />
          <DriverGauges />
        </section>

        {/* Center / Right Column (7 cols): Risk Timeline, Explain Card, Vehicle Simulator, Alert History */}
        <section className="lg:col-span-7 flex flex-col space-y-6">
          <RiskTimeline />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ExplainCard />
            <VehiclePanel />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <AlertLog />
            <SimulatedFamilyNotification />
          </div>
        </section>
      </main>

      {/* Calibration Wizard Modal */}
      <CalibrationWizard
        isOpen={isCalibrationOpen}
        onClose={() => setIsCalibrationOpen(false)}
        isCameraActive={cameraStatus === 'active'}
        onStartCamera={startCamera}
      />

      {/* Footer Disclaimer */}
      <footer className="mt-8 text-center text-xs text-gray-500 max-w-xl pb-4">
        Prototype. Not a certified safety system. Estimates risk for educational and hackathon demonstration purposes.
      </footer>
    </div>
  );
};

export default App;
