import React, { useState, useEffect, useRef } from 'react';
import { Send, PhoneCall, Check, MapPin, Clock } from 'lucide-react';
import { useNeuroDriveStore } from './store';
import { RISK_LEVELS } from '../core/types';

export interface DriverLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export const SimulatedFamilyNotification: React.FC = () => {
  const { riskAssessment, silencedLevel } = useNeuroDriveStore();
  const [notificationSent, setNotificationSent] = useState(false);
  const [lastSentTimestamp, setLastSentTimestamp] = useState<number | null>(null);
  const [countdownRemaining, setCountdownRemaining] = useState<number | null>(null);
  const [driverLocation, setDriverLocation] = useState<DriverLocation>({
    latitude: 37.7749,
    longitude: -122.4194,
    accuracy: 12,
    timestamp: Date.now(),
  });
  const [locationStatus, setLocationStatus] = useState<'pending' | 'acquired' | 'simulated'>('simulated');

  const alarmActive = riskAssessment.level >= RISK_LEVELS.WARNING;
  const isSilenced = silencedLevel !== null && silencedLevel >= riskAssessment.level;
  const alarmNotAcknowledged = alarmActive && !isSilenced;

  const alarmStartTimeRef = useRef<number | null>(null);

  // 1. Fetch real GPS coordinates via browser Geolocation API if available
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setDriverLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy),
            timestamp: pos.timestamp,
          });
          setLocationStatus('acquired');
        },
        () => {
          // If denied or error, keep simulated demo coordinates
          setLocationStatus('simulated');
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
  }, []);

  // 2. 3-Second Unacknowledged Alarm Escalation Timer
  // "If the alarm isn't set off (silenced/acknowledged) for 3 seconds, it sends the location and emergency message"
  useEffect(() => {
    if (alarmNotAcknowledged) {
      if (alarmStartTimeRef.current === null) {
        alarmStartTimeRef.current = Date.now();
      }

      const interval = setInterval(() => {
        if (!alarmStartTimeRef.current) return;
        const elapsedSec = (Date.now() - alarmStartTimeRef.current) / 1000;
        const remaining = Math.max(0, 3.0 - elapsedSec);
        setCountdownRemaining(Math.round(remaining * 10) / 10);

        if (elapsedSec >= 3.0 && !notificationSent) {
          // Automatically trigger emergency dispatch!
          setNotificationSent(true);
          setLastSentTimestamp(Date.now());
          setCountdownRemaining(0);
          clearInterval(interval);
        }
      }, 100);

      return () => clearInterval(interval);
    } else {
      // Alarm silenced or returned to normal
      alarmStartTimeRef.current = null;
      setCountdownRemaining(null);
    }
  }, [alarmNotAcknowledged, notificationSent]);

  const handleSimulateSend = () => {
    setNotificationSent(true);
    setLastSentTimestamp(Date.now());
  };

  const handleReset = () => {
    setNotificationSent(false);
    setLastSentTimestamp(null);
    alarmStartTimeRef.current = null;
    setCountdownRemaining(null);
  };

  const googleMapsUrl = `https://maps.google.com/?q=${driverLocation.latitude},${driverLocation.longitude}`;

  return (
    <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-4 flex flex-col space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 pb-2">
        <div className="flex items-center gap-2">
          <PhoneCall className="w-4 h-4 text-rose-400" />
          <h3 className="text-sm font-semibold text-gray-200">
            Emergency Helpline &amp; Family Dispatch
          </h3>
        </div>
        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 uppercase tracking-wider">
          [SIMULATED]
        </span>
      </div>

      {/* Unacknowledged Countdown Banner */}
      {countdownRemaining !== null && countdownRemaining > 0 && !notificationSent && (
        <div className="p-2.5 rounded-lg bg-red-600/20 border border-red-500/60 flex items-center justify-between text-xs text-red-200 animate-pulse font-mono">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-red-400 animate-spin" />
            <span>Unanswered Alarm Auto-Dispatch:</span>
          </div>
          <span className="font-bold text-red-100 bg-red-700/60 px-2 py-0.5 rounded">
            {countdownRemaining.toFixed(1)}s
          </span>
        </div>
      )}

      {/* Main Notification Card Content */}
      <div
        className={`p-3.5 rounded-lg border transition-all ${
          notificationSent
            ? 'bg-rose-950/30 border-rose-500/50 text-white'
            : alarmNotAcknowledged
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
                {notificationSent
                  ? '🚨 EMERGENCY DISPATCH SENT (Unanswered Alarm 3s)'
                  : 'Automatic Emergency Location & SMS'}
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
                  &ldquo;<strong>NeuroDrive SOS Alert:</strong> Driver unresponsive to alarm for &ge;3 seconds (
                  {riskAssessment.explanation || 'Driver distraction / drowsiness detected'}). Live GPS location: (
                  {driverLocation.latitude.toFixed(4)}, {driverLocation.longitude.toFixed(4)}). Emergency contacts &amp; helpline notified.&rdquo;
                </span>
              ) : (
                <span>
                  If an active alarm is not silenced/set off within 3 seconds, NeuroDrive automatically packages the driver&rsquo;s live GPS coordinates and emergency dispatch payload for family contacts.
                </span>
              )}
            </p>

            {/* GPS Location & Telemetry Badge */}
            <div className="mt-2.5 flex flex-wrap items-center gap-2 pt-2 border-t border-gray-800/60 text-[10px] font-mono">
              <span className="flex items-center gap-1 text-sky-400 bg-sky-950/40 px-2 py-0.5 rounded border border-sky-500/30">
                <MapPin className="w-3 h-3" />
                <span>
                  {driverLocation.latitude.toFixed(4)}, {driverLocation.longitude.toFixed(4)}
                </span>
              </span>
              <span className="text-gray-400">
                {locationStatus === 'acquired' ? '🛰️ Real GPS Locked' : '📍 Demo Coordinates'}
              </span>
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noreferrer"
                className="text-indigo-400 hover:text-indigo-300 underline ml-auto"
              >
                View Map
              </a>
            </div>
          </div>
        </div>

        {/* Buttons / Actions */}
        <div className="mt-3 pt-2 border-t border-gray-800/80 flex items-center justify-between">
          <span className="text-[10px] font-mono text-gray-500 italic">
            Automated 3-second fail-safe dispatch
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
                className="px-3 py-1 text-xs rounded-lg font-medium transition-colors flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300"
              >
                <Send className="w-3 h-3" />
                Test Send Now
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
