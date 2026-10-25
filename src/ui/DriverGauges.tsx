import React from 'react';
import { Eye, Clock, Activity, AlertCircle } from 'lucide-react';
import { useNeuroDriveStore } from './store';
import { CONFIG } from '../core/config';

export const DriverGauges: React.FC = () => {
  const { driverFeatures, activeBaseline } = useNeuroDriveStore();

  const earThreshold = activeBaseline?.earThreshold ?? CONFIG.driver.earFallbackThreshold;
  const isEyeClosed = driverFeatures.ear < earThreshold;
  const earPct = Math.min(100, Math.max(0, (driverFeatures.ear / 0.4) * 100));
  const earThresholdPct = Math.min(100, Math.max(0, (earThreshold / 0.4) * 100));

  const isYawning = driverFeatures.mar > CONFIG.driver.marYawnThreshold || driverFeatures.yawning;
  const marPct = Math.min(100, Math.max(0, (driverFeatures.mar / 1.0) * 100));
  const marThresholdPct = (CONFIG.driver.marYawnThreshold / 1.0) * 100;

  const perclosPct = Math.min(100, Math.round(driverFeatures.perclos60 * 100));
  const perclosNoticePct = Math.round(CONFIG.perclos.noticeThreshold * 100);
  const perclosWarningPct = Math.round(CONFIG.perclos.warningThreshold * 100);

  return (
    <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-4 flex flex-col justify-between space-y-4">
      <div className="flex items-center justify-between border-b border-gray-800 pb-2">
        <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-400" />
          Driver Biometrics &amp; Gauges
        </h3>
        <span
          className={`text-[11px] font-mono px-2 py-0.5 rounded-full border ${
            driverFeatures.quality >= CONFIG.driver.minQualityConfidence
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
          }`}
        >
          Quality: {Math.round(driverFeatures.quality * 100)}%
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* EAR Gauge */}
        <div className="bg-gray-950/60 p-3 rounded-lg border border-gray-800/80">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-400 font-medium flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-blue-400" />
              EAR
            </span>
            <span
              className={`font-mono font-semibold text-xs ${
                isEyeClosed ? 'text-red-400 font-bold' : 'text-gray-200'
              }`}
            >
              {driverFeatures.ear.toFixed(2)}
            </span>
          </div>

          {/* Bar with threshold marker tick */}
          <div className="relative w-full h-2.5 bg-gray-800 rounded-full overflow-hidden my-2">
            <div
              className={`h-full transition-all duration-150 ${
                isEyeClosed ? 'bg-red-500' : 'bg-blue-500'
              }`}
              style={{ width: `${earPct}%` }}
            />
            {/* Threshold tick */}
            <div
              className="absolute top-0 bottom-0 w-1 bg-yellow-400 shadow-sm"
              style={{ left: `${earThresholdPct}%` }}
              title={`Calibrated Threshold: ${earThreshold.toFixed(2)}`}
            />
          </div>
          <div className="flex justify-between text-[10px] text-gray-500 font-mono">
            <span>0.00</span>
            <span className="text-yellow-400/90 font-medium">Thresh: {earThreshold.toFixed(2)}</span>
            <span>0.40</span>
          </div>
        </div>

        {/* MAR / Yawn Gauge */}
        <div className="bg-gray-950/60 p-3 rounded-lg border border-gray-800/80">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-400 font-medium">MAR (Mouth)</span>
            <span
              className={`font-mono font-semibold text-xs ${
                isYawning ? 'text-amber-400 font-bold' : 'text-gray-200'
              }`}
            >
              {driverFeatures.mar.toFixed(2)}
              {isYawning && ' [YAWN]'}
            </span>
          </div>

          <div className="relative w-full h-2.5 bg-gray-800 rounded-full overflow-hidden my-2">
            <div
              className={`h-full transition-all duration-150 ${
                isYawning ? 'bg-amber-500' : 'bg-cyan-500'
              }`}
              style={{ width: `${marPct}%` }}
            />
            {/* Yawn threshold marker */}
            <div
              className="absolute top-0 bottom-0 w-1 bg-amber-400 shadow-sm"
              style={{ left: `${marThresholdPct}%` }}
              title={`Yawn Threshold: ${CONFIG.driver.marYawnThreshold}`}
            />
          </div>
          <div className="flex justify-between text-[10px] text-gray-500 font-mono">
            <span>0.00</span>
            <span className="text-amber-400/90 font-medium">Yawn &gt; {CONFIG.driver.marYawnThreshold}</span>
            <span>1.00</span>
          </div>
        </div>

        {/* PERCLOS (60s Window Bar) */}
        <div className="bg-gray-950/60 p-3 rounded-lg border border-gray-800/80">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-400 font-medium flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-purple-400" />
              PERCLOS
            </span>
            <span
              className={`font-mono font-semibold text-xs ${
                perclosPct >= perclosWarningPct
                  ? 'text-red-400'
                  : perclosPct >= perclosNoticePct
                  ? 'text-yellow-400'
                  : 'text-gray-200'
              }`}
            >
              {perclosPct}%
            </span>
          </div>

          <div className="relative w-full h-2.5 bg-gray-800 rounded-full overflow-hidden my-2">
            <div
              className={`h-full transition-all duration-150 ${
                perclosPct >= perclosWarningPct
                  ? 'bg-red-500'
                  : perclosPct >= perclosNoticePct
                  ? 'bg-yellow-500'
                  : 'bg-purple-500'
              }`}
              style={{ width: `${perclosPct}%` }}
            />
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-yellow-400"
              style={{ left: `${perclosNoticePct}%` }}
              title="Notice 15%"
            />
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-red-400"
              style={{ left: `${perclosWarningPct}%` }}
              title="Warning 25%"
            />
          </div>
          <div className="flex justify-between text-[10px] text-gray-500 font-mono">
            <span>0%</span>
            <span>Notice {perclosNoticePct}%</span>
            <span>Warn {perclosWarningPct}%</span>
          </div>
        </div>

        {/* Blink Rate & Long Closure */}
        <div className="bg-gray-950/60 p-3 rounded-lg border border-gray-800/80">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-400 font-medium">Blink Rate</span>
            <span className="font-mono font-semibold text-xs text-gray-200">
              {driverFeatures.blinkRate} <span className="text-[10px] text-gray-500 font-normal">/min</span>
            </span>
          </div>
          <div className="mt-2.5 flex items-center justify-between text-[11px] font-mono border-t border-gray-800/80 pt-1.5">
            <span className="text-gray-400">Eye Closure:</span>
            <span
              className={`font-semibold ${
                driverFeatures.longClosureSec >= CONFIG.driver.longClosureWarningSec
                  ? 'text-red-400'
                  : driverFeatures.longClosureSec >= CONFIG.driver.longClosureNoticeSec
                  ? 'text-yellow-400'
                  : 'text-gray-300'
              }`}
            >
              {driverFeatures.longClosureSec.toFixed(1)}s
            </span>
          </div>
          {driverFeatures.eyesOffRoadSec > 0 && (
            <div className="flex items-center justify-between text-[11px] font-mono text-amber-400 pt-1">
              <span className="flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Off Road:
              </span>
              <span>{driverFeatures.eyesOffRoadSec.toFixed(1)}s</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
