import React from 'react';
import { Camera, Eye, AlertTriangle, Video, EyeOff, Play, Square, AlertOctagon } from 'lucide-react';
import { useNeuroDriveStore } from './store';
import { CONFIG } from '../core/config';
import { CameraStatus } from '../io/camera/cameraManager';

interface LivePanelProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  fps?: number;
  delegate?: 'GPU' | 'CPU';
  cameraStatus: CameraStatus;
  cameraError?: string;
  hideVideo: boolean;
  onToggleHideVideo: () => void;
  onStartCamera: () => void;
  onStopCamera: () => void;
}

export const LivePanel: React.FC<LivePanelProps> = ({
  videoRef,
  canvasRef,
  fps = 0,
  delegate = 'GPU',
  cameraStatus,
  cameraError,
  hideVideo,
  onToggleHideVideo,
  onStartCamera,
  onStopCamera,
}) => {
  const { driverFeatures, activeBaseline } = useNeuroDriveStore();

  const earThreshold = activeBaseline?.earThreshold ?? CONFIG.driver.earFallbackThreshold;
  const isEyeClosed = driverFeatures.faceDetected && driverFeatures.ear < earThreshold;
  const isStreaming = cameraStatus === 'active';

  return (
    <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-4 flex flex-col space-y-3">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Camera className={`w-4 h-4 ${isStreaming ? 'text-blue-400' : 'text-gray-500'}`} />
          <span className="text-sm font-semibold text-gray-200">Driver Attention Camera</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Hide Video Privacy Toggle */}
          <button
            onClick={onToggleHideVideo}
            disabled={!isStreaming}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] border transition-colors ${
              hideVideo
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                : 'bg-gray-800 border-gray-700 text-gray-300 hover:text-white'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
            title="Hide camera video for privacy while keeping landmark mesh tracking active"
          >
            {hideVideo ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{hideVideo ? 'Mesh Only' : 'Video Visible'}</span>
          </button>

          {/* Camera Start / Stop Button */}
          {isStreaming ? (
            <button
              onClick={onStopCamera}
              className="flex items-center gap-1 px-2 py-1 rounded bg-red-950/40 border border-red-500/40 text-red-300 hover:bg-red-900/50 text-[11px] font-medium transition-colors"
              title="Stop Camera Stream"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>Stop</span>
            </button>
          ) : (
            <button
              onClick={onStartCamera}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium shadow-sm transition-colors"
              title="Start Live Webcam Stream"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Start Camera</span>
            </button>
          )}

          {/* Delegate & FPS Indicators */}
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
              {delegate}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-300">
              {isStreaming ? `${fps} FPS` : 'OFF'}
            </span>
          </div>
        </div>
      </div>

      {/* Video & Mesh Overlay Container */}
      <div className="relative aspect-[4/3] w-full bg-black rounded-lg overflow-hidden border border-gray-800/80 flex items-center justify-center">
        {/* Real Mirrored Webcam Video Element */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`absolute inset-0 w-full h-full object-cover -scale-x-100 ${
            isStreaming && !hideVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        />

        {/* Real Mirrored Landmark Mesh Canvas */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-cover -scale-x-100"
        />

        {/* Camera Idle or Disconnected Display */}
        {!isStreaming && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center bg-gray-950/90 space-y-3">
            {cameraStatus === 'starting' ? (
              <>
                <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-blue-300 font-medium">
                  {cameraError || 'Requesting camera access & loading models...'}
                </p>
                <p className="text-[11px] text-gray-500">
                  Please click &ldquo;Allow&rdquo; if your browser prompts for camera permission.
                </p>
              </>
            ) : cameraStatus === 'denied' || cameraStatus === 'not-found' || cameraStatus === 'busy' || cameraStatus === 'error' ? (
              <>
                <div className="w-12 h-12 rounded-full bg-red-950/60 border border-red-500/40 flex items-center justify-center text-red-400">
                  <AlertOctagon className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-red-400">Camera not connected</h3>
                  <p className="text-xs text-gray-300 max-w-sm">
                    {cameraError || 'Unable to access webcam device (/dev/video0).'}
                  </p>
                </div>
                <button
                  onClick={onStartCamera}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow transition-colors"
                >
                  Retry Camera
                </button>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-gray-800/80 border border-gray-700 flex items-center justify-center text-gray-400">
                  <Video className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-gray-300">Webcam Inactive</h3>
                  <p className="text-xs text-gray-400 max-w-xs">
                    Click below to start live on-device driver attention and drowsiness tracking.
                  </p>
                </div>
                <button
                  onClick={onStartCamera}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md transition-colors flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Start Camera</span>
                </button>
              </>
            )}
          </div>
        )}

        {/* Live Tracking Badges (When Streaming) */}
        {isStreaming && (
          <div className="absolute top-2 left-2 flex flex-col gap-1.5 z-10 pointer-events-none">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-black/60 backdrop-blur border border-white/10 text-[11px] font-mono">
              <span
                className={`w-2 h-2 rounded-full ${
                  driverFeatures.faceDetected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'
                }`}
              />
              <span className={driverFeatures.faceDetected ? 'text-gray-200' : 'text-red-300'}>
                {driverFeatures.faceDetected ? `Live Face Tracking (${(driverFeatures.quality * 100).toFixed(0)}%)` : 'No Face Detected'}
              </span>
            </div>

            {/* Gaze / Attention badge with 3s distraction countdown */}
            <div
              className={`flex items-center gap-1.5 px-2 py-1 rounded backdrop-blur text-[11px] font-mono border ${
                driverFeatures.eyesOffRoadSec >= 3.0
                  ? 'bg-red-600/40 text-red-200 border-red-500 animate-pulse font-bold'
                  : driverFeatures.eyesOffRoadSec > 0
                  ? 'bg-amber-950/80 text-amber-300 border-amber-500/40'
                  : 'bg-black/60 text-emerald-300 border-white/10'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>
                {driverFeatures.eyesOffRoadSec >= 3.0
                  ? `🚨 Distracted: ${driverFeatures.eyesOffRoadSec.toFixed(1)}s (ALARM)`
                  : driverFeatures.eyesOffRoadSec > 0
                  ? `⚠️ Distraction: ${driverFeatures.eyesOffRoadSec.toFixed(1)}s / 3.0s`
                  : 'Gaze Forward'}
              </span>
            </div>

            {/* Eye Closed badge */}
            {isEyeClosed && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded backdrop-blur text-[11px] font-mono border bg-red-950/80 text-red-300 border-red-500/40 animate-pulse">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Eyes Closed ({driverFeatures.longClosureSec.toFixed(1)}s)</span>
              </div>
            )}
          </div>
        )}

        {/* Bottom Status Ribbon (Live Real-Time Data) */}
        {isStreaming && (
          <div className="absolute bottom-2 inset-x-2 flex items-center justify-between px-3 py-1.5 rounded bg-black/70 backdrop-blur border border-white/10 text-[11px] font-mono z-10 pointer-events-none">
            <div className="flex items-center gap-3 text-gray-200">
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
        )}
      </div>
    </div>
  );
};
