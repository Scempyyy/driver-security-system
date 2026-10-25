import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { useNeuroDriveStore } from './store';
import { CONFIG } from '../core/config';

export const RiskTimeline: React.FC = () => {
  const { riskHistory, riskAssessment } = useNeuroDriveStore();

  // Format data points for recharts
  const chartData = riskHistory.map((item) => {
    const elapsedSec = Math.round((item.t - (riskAssessment.t || Date.now())) / 1000);
    return {
      time: `${elapsedSec}s`,
      timestamp: item.t,
      fused: Math.round(item.fusedRisk * 100),
      driver: Math.round(item.driverRisk * 100),
      vehicle: Math.round(item.vehicleRisk * 100),
    };
  });

  const noticeScore = Math.round(CONFIG.fusion.riskLevels.notice * 100);
  const warningScore = Math.round(CONFIG.fusion.riskLevels.warning * 100);
  const criticalScore = Math.round(CONFIG.fusion.riskLevels.critical * 100);

  return (
    <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-4 flex flex-col space-y-3">
      <div className="flex items-center justify-between border-b border-gray-800 pb-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-gray-200">
            Fused Risk Timeline (Last {CONFIG.ui.riskTimelineWindowSec}s)
          </h3>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-gray-400">Current Risk:</span>
          <span
            className={`font-bold px-2 py-0.5 rounded ${
              riskAssessment.level === 3
                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                : riskAssessment.level === 2
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                : riskAssessment.level === 1
                ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            }`}
          >
            {Math.round(riskAssessment.fusedRisk * 100)}%
          </span>
        </div>
      </div>

      {/* Recharts Live Line Chart */}
      <div className="h-48 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <XAxis
              dataKey="time"
              stroke="#64748b"
              fontSize={10}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[0, 100]}
              stroke="#64748b"
              fontSize={10}
              tickLine={false}
              ticks={[0, noticeScore, warningScore, criticalScore, 100]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0f172a',
                borderColor: '#334155',
                borderRadius: '0.5rem',
                fontSize: '11px',
                color: '#f8fafc',
              }}
              formatter={(val: number) => [`${val}%`, '']}
            />
            <Legend
              verticalAlign="top"
              align="right"
              iconSize={8}
              wrapperStyle={{ fontSize: '11px', paddingBottom: '4px' }}
            />

            {/* Threshold Reference Lines */}
            <ReferenceLine
              y={noticeScore}
              stroke="#eab308"
              strokeDasharray="3 3"
              label={{ value: 'Notice', fill: '#eab308', fontSize: 9, position: 'right' }}
            />
            <ReferenceLine
              y={warningScore}
              stroke="#f97316"
              strokeDasharray="3 3"
              label={{ value: 'Warning', fill: '#f97316', fontSize: 9, position: 'right' }}
            />
            <ReferenceLine
              y={criticalScore}
              stroke="#ef4444"
              strokeDasharray="3 3"
              label={{ value: 'Critical', fill: '#ef4444', fontSize: 9, position: 'right' }}
            />

            {/* Driver Risk Line */}
            <Line
              type="monotone"
              dataKey="driver"
              name="Driver Risk"
              stroke="#38bdf8"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />

            {/* Vehicle Risk Line */}
            <Line
              type="monotone"
              dataKey="vehicle"
              name="Vehicle Risk"
              stroke="#a855f7"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />

            {/* Fused Risk Composite Line */}
            <Line
              type="monotone"
              dataKey="fused"
              name="Fused Risk"
              stroke="#22c55e"
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
