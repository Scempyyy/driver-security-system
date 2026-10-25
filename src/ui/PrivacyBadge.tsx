import React from 'react';
import { Shield, Lock } from 'lucide-react';

export const PrivacyBadge: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div
      aria-label="Privacy Guarantee"
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 text-xs font-medium backdrop-blur shadow-sm select-none ${className}`}
    >
      <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
      <span className="flex items-center gap-1.5 tracking-wide">
        <span>On-device processing</span>
        <span className="text-emerald-600">•</span>
        <span className="flex items-center gap-1">
          <Lock className="w-3 h-3 text-emerald-500" />
          No video leaves device
        </span>
      </span>
    </div>
  );
};
