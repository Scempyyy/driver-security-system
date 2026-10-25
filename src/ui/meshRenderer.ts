/**
 * Real-time Canvas Mesh Renderer for MediaPipe Face Landmarks
 * Mirrors coordinates 1:1 on top of mirrored webcam video.
 */

export interface LandmarkPoint {
  x: number;
  y: number;
  z?: number;
}

// MediaPipe landmark indices
const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152,
  148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10
];

const LEFT_EYE = [362, 385, 387, 263, 373, 380, 362];
const RIGHT_EYE = [33, 160, 158, 133, 153, 144, 33];

const LEFT_IRIS = [468, 469, 470, 471, 472];
const RIGHT_IRIS = [473, 474, 475, 476, 477];

const MOUTH_OUTLINE = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146, 61];
const NOSE_BRIDGE = [168, 6, 197, 195, 5, 4, 1];
const LEFT_EYEBROW = [70, 63, 105, 66, 107];
const RIGHT_EYEBROW = [336, 296, 334, 293, 300];

export function renderFaceMesh(
  ctx: CanvasRenderingContext2D,
  landmarks: LandmarkPoint[] | undefined,
  width: number,
  height: number,
  options: {
    isEyeClosed: boolean;
    isYawning: boolean;
    isOffRoad: boolean;
    hideVideo: boolean;
    headYawDeg?: number;
    headPitchDeg?: number;
  }
): void {
  // Clear or draw background
  if (options.hideVideo) {
    ctx.fillStyle = '#0b0f19';
    ctx.fillRect(0, 0, width, height);

    // Subtle privacy grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  } else {
    ctx.clearRect(0, 0, width, height);
  }

  if (!landmarks || landmarks.length < 468) {
    return;
  }

  const toPx = (lm: LandmarkPoint) => ({
    x: lm.x * width,
    y: lm.y * height,
  });

  const drawPath = (indices: number[], color: string, lineWidth: number, close = false) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    indices.forEach((idx, i) => {
      const pt = landmarks[idx];
      if (!pt) return;
      const { x, y } = toPx(pt);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    if (close) ctx.closePath();
    ctx.stroke();
  };

  // 1. Face Oval
  const ovalColor = options.isOffRoad ? 'rgba(239, 68, 68, 0.6)' : 'rgba(56, 189, 248, 0.45)';
  drawPath(FACE_OVAL, ovalColor, 2, true);

  // 2. Eyebrows & Nose
  drawPath(LEFT_EYEBROW, 'rgba(148, 163, 184, 0.6)', 1.5);
  drawPath(RIGHT_EYEBROW, 'rgba(148, 163, 184, 0.6)', 1.5);
  drawPath(NOSE_BRIDGE, 'rgba(148, 163, 184, 0.5)', 1.5);

  // 3. Eyes (Green = open, Red = closed)
  const eyeColor = options.isEyeClosed ? '#ef4444' : '#10b981';
  drawPath(LEFT_EYE, eyeColor, 2, true);
  drawPath(RIGHT_EYE, eyeColor, 2, true);

  // 4. Irises
  const irisColor = options.isEyeClosed ? '#ef4444' : '#38bdf8';
  [LEFT_IRIS, RIGHT_IRIS].forEach((irisIndices) => {
    const centerIdx = irisIndices[0];
    const pt = landmarks[centerIdx];
    if (pt) {
      const { x, y } = toPx(pt);
      ctx.fillStyle = irisColor;
      ctx.beginPath();
      ctx.arc(x, y, options.isEyeClosed ? 2 : 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // 5. Mouth (Amber = yawning, Emerald = normal)
  const mouthColor = options.isYawning ? '#f59e0b' : '#38bdf8';
  drawPath(MOUTH_OUTLINE, mouthColor, options.isYawning ? 3 : 1.5, true);

  // 6. Gaze ray vector from nose tip (landmark 1)
  const nosePt = landmarks[1];
  if (nosePt) {
    const nose = toPx(nosePt);
    const yaw = ((options.headYawDeg ?? 0) * Math.PI) / 180;
    const pitch = ((options.headPitchDeg ?? 0) * Math.PI) / 180;
    const rayLength = 65;

    const targetX = nose.x + Math.sin(yaw) * rayLength;
    const targetY = nose.y + Math.sin(pitch) * rayLength - 5;

    ctx.strokeStyle = options.isOffRoad ? '#ef4444' : '#10b981';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(nose.x, nose.y);
    ctx.lineTo(targetX, targetY);
    ctx.stroke();

    // Arrow head
    ctx.fillStyle = options.isOffRoad ? '#ef4444' : '#10b981';
    ctx.beginPath();
    ctx.arc(targetX, targetY, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}
