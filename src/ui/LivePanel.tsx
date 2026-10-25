import React, { useRef, useEffect } from 'react';
import { Camera, Eye, AlertTriangle } from 'lucide-react';
import { useNeuroDriveStore } from './store';
import { CONFIG } from '../core/config';

interface LivePanelProps {
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
  fps?: number;
  delegate?: 'GPU' | 'CPU';
  isStreaming?: boolean;
}

export const LivePanel: React.FC<LivePanelProps> = ({
  videoRef: externalVideoRef,
  canvasRef: externalCanvasRef,
  fps = 30,
  delegate = 'GPU',
  isStreaming = false,
}) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = externalVideoRef || localVideoRef;
  const canvasRef = externalCanvasRef || localCanvasRef;

  const { driverFeatures, activeBaseline } = useNeuroDriveStore();

  const earThreshold = activeBaseline?.earThreshold ?? CONFIG.driver.earFallbackThreshold;
  const isEyeClosed = driverFeatures.ear < earThreshold;
  const isOffRoad = driverFeatures.eyesOffRoadSec >= CONFIG.driver.eyesOffRoadNoticeSec;

  // Render dummy overlay mesh when no camera stream or for simulation fallback
  useEffect(() => {
    if (!isStreaming && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = 480;
      canvas.height = 360;

      // Draw dark background & subtle grid
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      // Face Oval Mesh
      ctx.strokeStyle = driverFeatures.faceDetected ? 'rgba(56, 189, 248, 0.4)' : 'rgba(239, 68, 68, 0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 90, 120, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Landmarks dots (Eyes, Nose, Mouth)
      const leftEyeX = cx - 35;
      const rightEyeX = cx + 35;
      const eyeY = cy - 25;

      // Left eye iris
      ctx.fillStyle = isEyeClosed ? '#ef4444' : '#38bdf8';
      ctx.beginPath();
      ctx.arc(leftEyeX, eyeY, isEyeClosed ? 2 : 6, 0, Math.PI * 2);
      ctx.fill();

      // Right eye iris
      ctx.beginPath();
      ctx.arc(rightEyeX, eyeY, isEyeClosed ? 2 : 6, 0, Math.PI * 2);
      ctx.fill();

      // Eye contour mesh wireframe
      ctx.strokeStyle = isEyeClosed ? '#ef4444' : '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(leftEyeX - 14, eyeY - 8, 28, 16);
      ctx.strokeRect(rightEyeX - 14, eyeY - 8, 28, 16);

      // Nose bridge & tip
      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.arc(cx, cy + 10, 4, 0, Math.PI * 2);
      ctx.fill();

      // Mouth contour (yawn indicator)
      const mouthY = cy + 55;
      const mouthHeight = driverFeatures.yawning ? 26 : 10;
      ctx.strokeStyle = driverFeatures.yawning ? '#f59e0b' : '#38bdf8';
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - 24, mouthY - mouthHeight / 2, 48, mouthHeight);

      // Gaze vector line
      const yawAngle = (driverFeatures.headYaw * Math.PI) / 180;
      const gazeLength = 50;
      ctx.strokeStyle = isOffRoad ? '#ef4444' : '#10b981';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.sin(yawAngle) * gazeLength, cy - 20 + Math.cos(yawAngle) * 5);
      ctx.stroke();
    }
  }, [driverFeatures, isEyeClosed, isOffRoad, isStreaming, canvasRef]);

  return (
    <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-4 flex flex-col space-y-3">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold text-gray-200">Driver Attention Camera</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
            {delegate}
          </span>
          <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-300">
            {fps} FPS
          </span>
        </div>
      </div>

      {/* Video & Mesh Overlay Container */}
      <div className="relative aspect-[4/3] w-full bg-black rounded-lg overflow-hidden border border-gray-800/80 flex items-center justify-center">
        {/* Real video element (hidden or visible beneath canvas) */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`absolute inset-0 w-full h-full object-cover ${
            isStreaming ? 'block' : 'hidden'
          }`}
        />

        {/* Canvas for landmark mesh, iris tracking points, and gaze ray */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Live Badges Overlay */}
        <div className="absolute top-2 left-2 flex flex-col gap-1.5 z-10 pointer-events-none">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-black/60 backdrop-blur border border-white/10 text-[11px] font-mono">
            <span
              className={`w-2 h-2 rounded-full ${
                driverFeatures.faceDetected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'
              }`}
            />
            <span className={driverFeatures.faceDetected ? 'text-gray-200' : 'text-red-300'}>
              {driverFeatures.faceDetected ? 'Face Tracking Active' : 'No Face Detected'}
            </span>
          </div>

          {/* Gaze / Attention badge */}
          <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded backdrop-blur text-[11px] font-mono border ${
              isOffRoad
                ? 'bg-red-950/80 text-red-300 border-red-500/40'
                : 'bg-black/60 text-emerald-300 border-white/10'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>
              {isOffRoad ? `Eyes Off Road (${driverFeatures.eyesOffRoadSec.toFixed(1)}s)` : 'Gaze Forward'}
            </span>
          </div>
        </div>

        {/* Bottom Status Ribbon */}
        <div className="absolute bottom-2 inset-x-2 flex items-center justify-between px-3 py-1.5 rounded bg-black/70 backdrop-blur border border-white/10 text-[11px] font-mono z-10">
          <div className="flex items-center gap-3">
            <span>Pitch: {driverFeatures.headPitch.toFixed(1)}°</span>
            <span>Yaw: {driverFeatures.headYaw.toFixed(1)}°</span>
            <span>Roll: {driverFeatures.headRoll.toFixed(1)}°</span>
          </div>
          {driverFeatures.yawning && (
            <span className="flex items-center gap-1 text-amber-400 font-bold animate-pulse">
              <AlertTriangle className="w-3 h-3" /> Yawn Detected
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
