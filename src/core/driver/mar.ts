/**
 * Mouth Aspect Ratio (MAR) Calculation.
 *
 * Implements the 8-landmark MAR algorithm matching techfestthing/:
 * Landmarks: [61, 291, 39, 181, 0, 17, 269, 405]
 *
 * In techfestthing/drowsiness.py:
 * pts = [landmarks[idx] for idx in mouth_indices]
 * Vertical 1: ||pts[2] - pts[6]|| (landmarks[39] to landmarks[269])
 * Vertical 2: ||pts[3] - pts[7]|| (landmarks[181] to landmarks[405])
 * Horizontal: ||pts[0] - pts[1]|| (landmarks[61] to landmarks[291])
 * MAR = (v1 + v2) / (2.0 * h)
 */

import { Point2D, euclideanDist2D } from './ear';

export const MOUTH_INDICES = [61, 291, 39, 181, 0, 17, 269, 405] as const;

/**
 * Calculates Mouth Aspect Ratio from facial landmarks.
 */
export function calculateMAR(
  landmarks: { x: number; y: number }[],
  width = 1.0,
  height = 1.0
): number {
  if (!landmarks || landmarks.length === 0) return 0.0;

  const pts: Point2D[] = [];
  for (let i = 0; i < MOUTH_INDICES.length; i++) {
    const lm = landmarks[MOUTH_INDICES[i]];
    if (!lm) return 0.0;
    pts.push({ x: lm.x * width, y: lm.y * height });
  }

  // Vertical distances: pts[2]-pts[6] and pts[3]-pts[7]
  const v1 = euclideanDist2D(pts[2], pts[6]);
  const v2 = euclideanDist2D(pts[3], pts[7]);

  // Horizontal distance: pts[0]-pts[1]
  const h = euclideanDist2D(pts[0], pts[1]);

  if (h <= 1e-6) {
    return 0.0;
  }

  return (v1 + v2) / (2.0 * h);
}
