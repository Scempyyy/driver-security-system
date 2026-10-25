import React from 'react';
import { History, CheckCircle, AlertTriangle, AlertOctagon, Info, Eye } from 'lucide-react';
import { useNeuroDriveStore } from './store';
import { Alert, RISK_LEVELS } from '../core/types';

export const AlertLog: React.FC = () => {
  const {
    alertHistory,
    selectedAlertForInspection,
    setSelectedAlertForInspection,
    acknowledgeAlert,
    clearAlerts,
  } = useNeuroDriveStore();

  const getAlertIcon = (level: number) => {
    switch (level) {
      case RISK_LEVELS.CRITICAL:
        return <AlertOctagon className="w-4 h-4 text-red-400 shrink-0" />;
      case RISK_LEVELS.WARNING:
        return <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" />;
      case RISK_LEVELS.NOTICE:
      default:
        return <Info className="w-4 h-4 text-yellow-400 shrink-0" />;
    }
  };

  const formatTime = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-4 flex flex-col space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 pb-2">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-orange-400" />
          <h3 className="text-sm font-semibold text-gray-200">Alert History &amp; Audit Log</h3>
        </div>
        <div className="flex items-center gap-2">
          {alertHistory.length > 0 && (
            <button
              onClick={clearAlerts}
              className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
            >
              Clear Log
            </button>
          )}
          <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">
            {alertHistory.length} Events
          </span>
        </div>
      </div>

      {/* Alert Item List */}
      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
        {alertHistory.length === 0 ? (
          <div className="text-center py-6 text-gray-500 text-xs italic">
            No safety alerts triggered yet. Driving conditions safe.
          </div>
        ) : (
          alertHistory.map((alert: Alert) => {
            const isSelected = selectedAlertForInspection?.id === alert.id;
            return (
              <div
                key={alert.id}
                onClick={() => setSelectedAlertForInspection(isSelected ? null : alert)}
                className={`p-2.5 rounded-lg border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                  isSelected
                    ? 'bg-blue-950/40 border-blue-500 text-white'
                    : alert.acknowledged
                    ? 'bg-gray-950/30 border-gray-800/60 text-gray-400'
                    : 'bg-gray-950/70 border-gray-700/80 text-gray-200 hover:bg-gray-900'
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="mt-0.5">{getAlertIcon(alert.level)}</div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-semibold">
                        {formatTime(alert.t)}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold uppercase ${
                          alert.level === 3
                            ? 'text-red-400 bg-red-500/10'
                            : alert.level === 2
                            ? 'text-orange-400 bg-orange-500/10'
                            : 'text-yellow-400 bg-yellow-500/10'
                        }`}
                      >
                        {alert.level === 3 ? 'CRITICAL' : alert.level === 2 ? 'WARNING' : 'NOTICE'}
                      </span>
                      {alert.assessment.compoundEscalation && (
                        <span className="text-[10px] bg-red-500/20 text-red-300 px-1 rounded font-mono font-bold">
                          COMPOUND
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-300 truncate mt-0.5">
                      {alert.assessment.explanation}
                    </p>
                  </div>
                </div>

                {/* Inspection & Acknowledgment Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAlertForInspection(isSelected ? null : alert);
                    }}
                    className={`p-1 rounded text-xs transition-colors ${
                      isSelected ? 'text-blue-400 bg-blue-500/20' : 'text-gray-400 hover:text-white'
                    }`}
                    title="Inspect why card snapshot"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>

                  {!alert.acknowledged && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        acknowledgeAlert(alert.id);
                      }}
                      className="p-1 rounded text-gray-400 hover:text-emerald-400 transition-colors"
                      title="Mark Acknowledged"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
