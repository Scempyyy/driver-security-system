import React, { useState } from 'react';
import {
  Cpu,
  Volume2,
  VolumeX,
  Mic,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { useNeuroDriveStore } from './ui/store';
import { RISK_LEVELS } from './core/types';
import { alertDispatcher } from './io/speech/alertDispatcher';

import { LivePanel } from './ui/LivePanel';
import { DriverGauges } from './ui/DriverGauges';
import { VehiclePanel } from './ui/VehiclePanel';
import { RiskTimeline } from './ui/RiskTimeline';
import { ExplainCard } from './ui/ExplainCard';
import { AlertLog } from './ui/AlertLog';
import { CalibrationWizard } from './ui/CalibrationWizard';
import { SimulatedFamilyNotification } from './ui/SimulatedFamilyNotification';
import { PrivacyBadge } from './ui/PrivacyBadge';

export const App: React.FC = () => {
  const {
    audioMuted,
    setAudioMuted,
    voiceEnabled,
    setVoiceEnabled,
    addAlert,
    setRiskAssessment,
    updateDriverFeatures,
    setSimulatorPreset,
  } = useNeuroDriveStore();

  const [isCalibrationOpen, setIsCalibrationOpen] = useState(false);
  const [activeDelegate] = useState<'GPU' | 'CPU'>('GPU');
  const [fps] = useState<number>(30);

  // Trigger alert dispatcher whenever risk level shifts upwards or creates an alert
  const triggerSimulatedScenario = (scenario: 'normal' | 'drowsy' | 'compound' | 'distracted') => {
    const now = Date.now();
    switch (scenario) {
      case 'drowsy': {
        updateDriverFeatures({
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
            'Driver eye closure exceeded 2.1s with 28% PERCLOS accumulation. Audible chime and verbal alert activated.',
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
          ear: 0.28,
          longClosureSec: 0.0,
          headYaw: 32.0,
          eyesOffRoadSec: 2.5,
        });
        const assessment = {
          t: now,
          driverRisk: 0.35,
          vehicleRisk: 0.04,
          fusedRisk: 0.32,
          level: RISK_LEVELS.NOTICE,
          confidence: 0.90,
          factors: [
            {
              id: 'eyes_off_road',
              label: 'Driver Inattention / Off-Road',
              contribution: 0.80,
              evidence: 'Gaze off road 2.5 s (Yaw +32°)',
            },
          ],
          explanation: 'Driver looking away from the roadway for >2.0s. Soft visual notice active.',
          compoundEscalation: false,
        };
        setRiskAssessment(assessment);
        addAlert({
          id: `alert_${now}`,
          t: now,
          level: RISK_LEVELS.NOTICE,
          assessment,
          acknowledged: false,
        });
        alertDispatcher.dispatch(RISK_LEVELS.NOTICE, {
          muted: audioMuted,
          voiceEnabled,
        });
        break;
      }
      case 'normal':
      default: {
        setSimulatorPreset('NORMAL');
        updateDriverFeatures({
          ear: 0.28,
          longClosureSec: 0.0,
          perclos60: 0.04,
          yawning: false,
          headYaw: 0.0,
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
            <p className="text-xs text-gray-400">
              One AI. Driver-Aware. Vehicle-Aware. Safety-Driven.
            </p>
          </div>
        </div>

        {/* Global Controls & Privacy Badge */}
        <div className="flex flex-wrap items-center gap-3">
          <PrivacyBadge />

          <button
            onClick={() => setIsCalibrationOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs text-gray-200 border border-gray-700 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-blue-400" />
            <span>Calibrate Baseline</span>
          </button>

          {/* Sound Mute Toggle */}
          <button
            onClick={() => setAudioMuted(!audioMuted)}
            className={`p-2 rounded-lg border text-xs transition-colors ${
              audioMuted
                ? 'bg-red-950/40 border-red-500/40 text-red-400'
                : 'bg-gray-800 border-gray-700 text-gray-300 hover:text-white'
            }`}
            title={audioMuted ? 'Audio Alerts Muted' : 'Audio Alerts Active'}
          >
            {audioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* Voice Alerts Toggle */}
          <button
            onClick={() => setVoiceEnabled(!voiceEnabled)}
            className={`p-2 rounded-lg border text-xs transition-colors ${
              voiceEnabled
                ? 'bg-blue-950/40 border-blue-500/40 text-blue-400'
                : 'bg-gray-800 border-gray-700 text-gray-500'
            }`}
            title={voiceEnabled ? 'Spoken Voice Alerts Enabled' : 'Spoken Voice Alerts Disabled'}
          >
            <Mic className="w-4 h-4" />
          </button>
        </div>
      </header>

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
          <LivePanel fps={fps} delegate={activeDelegate} />
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
      />

      {/* Footer Disclaimer */}
      <footer className="mt-8 text-center text-xs text-gray-500 max-w-xl pb-4">
        Prototype. Not a certified safety system. Estimates risk for educational and hackathon demonstration purposes.
      </footer>
    </div>
  );
};

export default App;
