import React, { useState } from 'react';
import { Send, PhoneCall, Check } from 'lucide-react';
import { useNeuroDriveStore } from './store';
import { RISK_LEVELS } from '../core/types';

export const SimulatedFamilyNotification: React.FC = () => {
  const { riskAssessment } = useNeuroDriveStore();
  const [notificationSent, setNotificationSent] = useState(false);
  const [lastSentTimestamp, setLastSentTimestamp] = useState<number | null>(null);

  const isCritical = riskAssessment.level === RISK_LEVELS.CRITICAL;

  const handleSimulateSend = () => {
    setNotificationSent(true);
    setLastSentTimestamp(Date.now());
  };

  const handleReset = () => {
    setNotificationSent(false);
    setLastSentTimestamp(null);
  };

  return (
    <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-4 flex flex-col space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 pb-2">
        <div className="flex items-center gap-2">
          <PhoneCall className="w-4 h-4 text-rose-400" />
          <h3 className="text-sm font-semibold text-gray-200">
            Emergency Family Notification
          </h3>
        </div>
        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 uppercase tracking-wider">
          [SIMULATED]
        </span>
      </div>

      {/* Main Notification Card Content */}
      <div
        className={`p-3.5 rounded-lg border transition-all ${
          notificationSent
            ? 'bg-rose-950/30 border-rose-500/50 text-white'
            : isCritical
            ? 'bg-red-950/20 border-red-500/40 text-gray-200'
            : 'bg-gray-950/50 border-gray-800 text-gray-400'
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
              notificationSent
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                : 'bg-gray-800 text-gray-500'
            }`}
          >
            {notificationSent ? <Check className="w-5 h-5 text-emerald-400" /> : <Send className="w-4 h-4" />}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-200">
                {notificationSent ? 'SIMULATED SMS Dispatched to Emergency Contacts' : 'Automatic Emergency Dispatch'}
              </span>
              {lastSentTimestamp && (
                <span className="text-[10px] font-mono text-gray-400">
                  {new Date(lastSentTimestamp).toLocaleTimeString()}
                </span>
              )}
            </div>

            <p className="text-[11px] text-gray-300 mt-1 leading-relaxed">
              {notificationSent ? (
                <span>
                  &ldquo;NeuroDrive Alert: Driver experiencing prolonged eye closure &amp; severe vehicle judder at current GPS coordinates. Driver prompted to pull over.&rdquo;
                </span>
              ) : (
                <span>
                  When Critical Risk persists, NeuroDrive prepares an emergency alert for trusted family contacts with GPS coordinates and sensor snapshots.
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Buttons / Actions */}
        <div className="mt-3 pt-2 border-t border-gray-800/80 flex items-center justify-between">
          <span className="text-[10px] font-mono text-gray-500 italic">
            No external SMS API invoked • Pure simulated UI demo
          </span>

          <div className="flex items-center gap-2">
            {notificationSent ? (
              <button
                onClick={handleReset}
                className="px-2.5 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
              >
                Reset Demo
              </button>
            ) : (
              <button
                onClick={handleSimulateSend}
                className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
                  isCritical
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                }`}
              >
                <Send className="w-3 h-3" />
                Simulate Family Alert
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
