/**
 * Gaze Ratio and Iris Center Deviation Calculation.
 *
 * Implements iris deviation tracking matching techfestthing/:
 * - Left iris ring: [469, 470, 471, 472]
 * - Right iris ring: [474, 475, 476, 477]
 * - Left eye corners: inner 362, outer 263
 * - Right eye corners: inner 133, outer 33
 *
 * Deviation ratio:
 * ratio = (iris_x - eye_center_x) / eye_width
 * (around 0.0 when looking straight ahead, >0.35 when looking far left/right)
 */

export const GAZE_LANDMARKS = {
  LEFT_IRIS: [469, 470, 471, 472] as const,
  RIGHT_IRIS: [474, 475, 476, 477] as const,
  LEFT_EYE_INNER: 362,
  LEFT_EYE_OUTER: 263,
  RIGHT_EYE_INNER: 133,
  RIGHT_EYE_OUTER: 33,
};

export interface GazeResult {
  leftRatio: number;      // horizontal offset ratio from center for left eye
  rightRatio: number;     // horizontal offset ratio from center for right eye
  meanDeviation: number;  // average magnitude of deviation from center |ratio|
  lookingAway: boolean;   // true if gaze deviation exceeds threshold
}

export function calculateGaze(
  landmarks: { x: number; y: number }[],
  width = 1.0,
  threshold = 0.35
): GazeResult {
  if (!landmarks || landmarks.length < 478) {
    return {
      leftRatio: 0,
      rightRatio: 0,
      meanDeviation: 0,
      lookingAway: false,
    };
  }

  const irisCentreX = (indices: readonly number[]): number => {
    let sum = 0;
    for (const idx of indices) {
      sum += (landmarks[idx]?.x ?? 0) * width;
    }
    return sum / indices.length;
  };

  try {
    const lx = irisCentreX(GAZE_LANDMARKS.LEFT_IRIS);
    const rx = irisCentreX(GAZE_LANDMARKS.RIGHT_IRIS);

    const lInnerX = (landmarks[GAZE_LANDMARKS.LEFT_EYE_INNER]?.x ?? 0) * width;
    const lOuterX = (landmarks[GAZE_LANDMARKS.LEFT_EYE_OUTER]?.x ?? 0) * width;
    const rInnerX = (landmarks[GAZE_LANDMARKS.RIGHT_EYE_INNER]?.x ?? 0) * width;
    const rOuterX = (landmarks[GAZE_LANDMARKS.RIGHT_EYE_OUTER]?.x ?? 0) * width;

    const lWidth = Math.abs(lOuterX - lInnerX);
    const rWidth = Math.abs(rOuterX - rInnerX);

    const lCenter = (lInnerX + lOuterX) / 2.0;
    const rCenter = (rInnerX + rOuterX) / 2.0;

    const leftRatio = lWidth > 1e-6 ? (lx - lCenter) / lWidth : 0;
    const rightRatio = rWidth > 1e-6 ? (rx - rCenter) / rWidth : 0;

    const meanDeviation = (Math.abs(leftRatio) + Math.abs(rightRatio)) / 2.0;
    const lookingAway = meanDeviation > threshold;

    return {
      leftRatio,
      rightRatio,
      meanDeviation,
      lookingAway,
    };
  } catch {
    return {
      leftRatio: 0,
      rightRatio: 0,
      meanDeviation: 0,
      lookingAway: false,
    };
  }
}
