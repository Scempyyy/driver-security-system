import React from 'react';
import { Gauge, Radio, Volume2, Activity } from 'lucide-react';
import { useNeuroDriveStore } from './store';
import { VehicleScenarioPreset } from '../core/types';
import { CONFIG } from '../core/config';

export const VehiclePanel: React.FC = () => {
  const {
    vehicleFeatures,
    simulatorPreset,
    setSimulatorPreset,
    setManualSimulatedSignals,
  } = useNeuroDriveStore();

  const presets: { id: VehicleScenarioPreset; label: string; desc: string }[] = [
    { id: 'NORMAL', label: 'Normal Driving', desc: 'Smooth highway, no anomalies' },
    { id: 'BRAKE_JUDDER', label: 'Brake Judder', desc: 'Pulsing brake shudder (0.62 m/s²)' },
    { id: 'ENGINE_KNOCK', label: 'Engine Knock', desc: 'Acoustic knocking & vibration' },
    { id: 'RUMBLE_STRIP', label: 'Rumble Strip', desc: 'Severe lane departure vibration (0.88 m/s²)' },
  ];

  const vibPct = Math.min(100, Math.round((vehicleFeatures.vibrationRms / 1.0) * 100));
  const vibAnomalyThresholdPct = Math.round((CONFIG.vehicle.vibrationAnomalyThreshold / 1.0) * 100);
  const isVibAnomaly = vehicleFeatures.vibrationRms >= CONFIG.vehicle.vibrationAnomalyThreshold;

  return (
    <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-4 flex flex-col space-y-4">
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-gray-800 pb-2">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-gray-200">Vehicle Signals &amp; Simulator</h3>
        </div>

        {/* Mandatory SIMULATED Badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono font-bold tracking-wider">
          <Radio className="w-3 h-3 animate-pulse" />
          <span>[SIMULATED]</span>
        </div>
      </div>

      {/* Vibration RMS & Audio Anomaly Gauges */}
      <div className="grid grid-cols-2 gap-3">
        {/* Vibration Gauge */}
        <div className="bg-gray-950/60 p-3 rounded-lg border border-gray-800/80">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-400 font-medium flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              Vibration RMS
            </span>
            <span
              className={`font-mono font-semibold text-xs ${
                isVibAnomaly ? 'text-amber-400 font-bold' : 'text-gray-200'
              }`}
            >
              {vehicleFeatures.vibrationRms.toFixed(2)} <span className="text-[10px] text-gray-500 font-normal">m/s²</span>
            </span>
          </div>

          <div className="relative w-full h-2.5 bg-gray-800 rounded-full overflow-hidden my-2">
            <div
              className={`h-full transition-all duration-150 ${
                isVibAnomaly ? 'bg-amber-500' : 'bg-cyan-500'
              }`}
              style={{ width: `${vibPct}%` }}
            />
            {/* Anomaly Threshold tick */}
            <div
              className="absolute top-0 bottom-0 w-1 bg-red-400 shadow-sm"
              style={{ left: `${vibAnomalyThresholdPct}%` }}
              title={`Anomaly Threshold: ${CONFIG.vehicle.vibrationAnomalyThreshold} m/s²`}
            />
          </div>
          <div className="flex justify-between text-[10px] text-gray-500 font-mono">
            <span>0.00</span>
            <span className="text-red-400/90 font-medium">Thresh: {CONFIG.vehicle.vibrationAnomalyThreshold}</span>
            <span>1.00</span>
          </div>
        </div>

        {/* 3-Band Audio Spectrum */}
        <div className="bg-gray-950/60 p-3 rounded-lg border border-gray-800/80">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-400 font-medium flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
              Cabin Audio Bands
            </span>
            <span
              className={`font-mono font-semibold text-xs ${
                vehicleFeatures.audioAnomaly > CONFIG.vehicle.audioAnomalyThreshold ? 'text-amber-400' : 'text-gray-200'
              }`}
            >
              Anomaly: {Math.round(vehicleFeatures.audioAnomaly * 100)}%
            </span>
          </div>

          <div className="flex items-end justify-around h-7 gap-2 bg-gray-900/80 px-3 py-1 rounded">
            {vehicleFeatures.audioBands.map((band, idx) => {
              const bandPct = Math.min(100, Math.round(band * 100));
              const bandLabel = ['Low (Bass/Engine)', 'Mid (Cabin)', 'High (Rattle)'][idx];
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full bg-gray-800 h-5 rounded-t overflow-hidden flex items-end">
                    <div
                      className={`w-full transition-all duration-150 ${
                        bandPct > 60 ? 'bg-amber-400' : 'bg-indigo-400'
                      }`}
                      style={{ height: `${bandPct}%` }}
                      title={`${bandLabel}: ${bandPct}%`}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-gray-500 uppercase">
                    {['L', 'M', 'H'][idx]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Simulator Preset Buttons */}
      <div className="space-y-2 pt-1">
        <div className="text-xs font-medium text-gray-400 flex items-center justify-between">
          <span>Vehicle Anomaly Simulator Presets:</span>
          <span className="text-[10px] text-gray-500 font-mono">Instant injection for demo</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {presets.map((p) => {
            const isActive = simulatorPreset === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setSimulatorPreset(p.id)}
                className={`flex flex-col p-2.5 rounded-lg border text-left transition-all ${
                  isActive
                    ? 'bg-blue-600/20 border-blue-500 text-white shadow-md'
                    : 'bg-gray-950/40 border-gray-800 text-gray-400 hover:bg-gray-800/40 hover:text-gray-200'
                }`}
              >
                <span className="text-xs font-semibold leading-tight">{p.label}</span>
                <span className="text-[10px] text-gray-500 leading-normal mt-1 line-clamp-1">
                  {p.desc}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Manual Fine-Tuning Sliders */}
      <div className="bg-gray-950/40 p-3 rounded-lg border border-gray-800/60 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400">Manual Vibration Slider (m/s²):</span>
          <span className="font-mono text-cyan-300 font-semibold">
            {vehicleFeatures.vibrationRms.toFixed(2)}
          </span>
        </div>
        <input
          type="range"
          min="0.05"
          max="1.20"
          step="0.02"
          value={vehicleFeatures.vibrationRms}
          onChange={(e) =>
            setManualSimulatedSignals(parseFloat(e.target.value), vehicleFeatures.audioAnomaly)
          }
          className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-gray-800 rounded-lg"
        />
      </div>
    </div>
  );
};
