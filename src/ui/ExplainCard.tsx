import React from 'react';
import { HelpCircle, Zap, ShieldCheck } from 'lucide-react';
import { useNeuroDriveStore } from './store';
import { RISK_LEVELS } from '../core/types';

export const ExplainCard: React.FC = () => {
  const { riskAssessment, selectedAlertForInspection } = useNeuroDriveStore();

  // If user selected an alert from history, show its snapshot, otherwise show live assessment
  const activeData = selectedAlertForInspection
    ? selectedAlertForInspection.assessment
    : riskAssessment;

  const getLevelBadge = (level: number) => {
    switch (level) {
      case RISK_LEVELS.CRITICAL:
        return { label: 'CRITICAL', color: 'bg-red-500/20 text-red-400 border-red-500/40' };
      case RISK_LEVELS.WARNING:
        return { label: 'WARNING', color: 'bg-orange-500/20 text-orange-400 border-orange-500/40' };
      case RISK_LEVELS.NOTICE:
        return { label: 'NOTICE', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' };
      case RISK_LEVELS.NORMAL:
      default:
        return { label: 'NORMAL', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' };
    }
  };

  const badge = getLevelBadge(activeData.level);

  return (
    <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-4 flex flex-col space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 pb-2">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-gray-200">
            Explainability: Why Was Risk Assessed?
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {selectedAlertForInspection && (
            <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
              Viewing Historical Snapshot
            </span>
          )}
          <span
            className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full border ${badge.color}`}
          >
            {badge.label}
          </span>
        </div>
      </div>

      {/* Compound Escalation Highlight Box */}
      {activeData.compoundEscalation && (
        <div className="bg-red-950/40 border border-red-500/50 rounded-lg p-3 flex items-start gap-2.5">
          <Zap className="w-4 h-4 text-red-400 shrink-0 mt-0.5 animate-bounce" />
          <div>
            <div className="text-xs font-semibold text-red-300">
              Compound Risk Escalation Triggered!
            </div>
            <p className="text-[11px] text-red-200/90 mt-0.5">
              Simultaneous driver impairment (drowsiness/inattention) AND vehicle telemetry anomaly detected. Risk level escalated automatically due to compounding multi-modal danger.
            </p>
          </div>
        </div>
      )}

      {/* Plain Language Explanation Text */}
      <div className="bg-gray-950/60 p-3 rounded-lg border border-gray-800/80">
        <div className="text-xs font-semibold text-gray-400 mb-1 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
          System Explanation Summary:
        </div>
        <p className="text-xs text-gray-200 leading-relaxed font-sans">
          {activeData.explanation || 'Driver monitoring active. No critical impairment factors detected.'}
        </p>
      </div>

      {/* Top 3 Risk Factors with Real Numeric Evidence */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-gray-400">
          Top Contributing Factors (Evidence-Based):
        </div>

        {activeData.factors && activeData.factors.length > 0 ? (
          <div className="space-y-1.5">
            {activeData.factors.slice(0, 3).map((factor, idx) => {
              const weightPct = Math.round(factor.contribution * 100);
              return (
                <div
                  key={factor.id || idx}
                  className="bg-gray-950/40 p-2.5 rounded-lg border border-gray-800/60 flex items-center justify-between"
                >
                  <div className="space-y-0.5">
                    <div className="text-xs font-medium text-gray-200 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                      {factor.label}
                    </div>
                    <div className="text-[11px] font-mono text-cyan-300">
                      {factor.evidence}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-mono font-bold text-gray-300">
                      {weightPct}%
                    </span>
                    <div className="text-[9px] text-gray-500 uppercase tracking-wider">
                      Weight
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-xs text-gray-500 italic p-3 text-center bg-gray-950/30 rounded-lg">
            No active threat factors. Driving telemetry nominal.
          </div>
        )}
      </div>

      {/* Transparency & Confidence */}
      <div className="flex items-center justify-between text-[11px] font-mono text-gray-500 pt-1 border-t border-gray-800/60">
        <span>Confidence Score: {Math.round(activeData.confidence * 100)}%</span>
        <span>Driver: {Math.round(activeData.driverRisk * 100)}% | Vehicle: {Math.round(activeData.vehicleRisk * 100)}%</span>
      </div>
    </div>
  );
};
