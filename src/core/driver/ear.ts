/**
 * Eye Aspect Ratio (EAR) Calculation.
 *
 * Implements the 12-landmark EAR algorithm matching techfestthing/:
 * Left eye:  [362, 385, 387, 263, 373, 380]
 * Right eye: [33, 160, 158, 133, 153, 144]
 *
 * Point ordering for each eye: [p1, p2, p3, p4, p5, p6]
 * - Horizontal: p1 (corner), p4 (corner)
 * - Vertical 1: p2, p6
 * - Vertical 2: p3, p5
 *
 * Formula:
 * EAR = (||p2 - p6|| + ||p3 - p5||) / (2.0 * ||p1 - p4||)
 * (Reference: Soukupova & Cech, 2016)
 */

export interface Point2D {
  x: number;
  y: number;
  z?: number;
}

export const LEFT_EYE_INDICES = [362, 385, 387, 263, 373, 380] as const;
export const RIGHT_EYE_INDICES = [33, 160, 158, 133, 153, 144] as const;

/**
 * Calculates Euclidean distance between two 2D points.
 */
export function euclideanDist2D(p1: Point2D, p2: Point2D): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Computes EAR for a single eye given landmarks and indices.
 * Width/height scaling is optional if points are normalized coordinates (aspect ratio preserved
 * if image dimensions provided, or default to normalized/aspect-scaled coordinates).
 */
export function calculateSingleEyeEAR(
  landmarks: { x: number; y: number }[],
  indices: readonly number[] | number[],
  width = 1.0,
  height = 1.0
): number {
  if (!landmarks || landmarks.length === 0) return 0.0;
  if (indices.length < 6) return 0.0;

  const pts: Point2D[] = [];
  for (let i = 0; i < 6; i++) {
    const lm = landmarks[indices[i]];
    if (!lm) return 0.0;
    pts.push({ x: lm.x * width, y: lm.y * height });
  }

  // Vertical distances: p2-p6 (index 1 to 5), p3-p5 (index 2 to 4)
  const v1 = euclideanDist2D(pts[1], pts[5]);
  const v2 = euclideanDist2D(pts[2], pts[4]);

  // Horizontal distance: p1-p4 (index 0 to 3)
  const h = euclideanDist2D(pts[0], pts[3]);

  if (h <= 1e-6) {
    return 0.0;
  }

  return (v1 + v2) / (2.0 * h);
}

/**
 * Computes the average EAR of left and right eyes.
 */
export function calculateEAR(
  landmarks: { x: number; y: number }[],
  width = 1.0,
  height = 1.0
): { ear: number; leftEar: number; rightEar: number } {
  const leftEar = calculateSingleEyeEAR(landmarks, LEFT_EYE_INDICES, width, height);
  const rightEar = calculateSingleEyeEAR(landmarks, RIGHT_EYE_INDICES, width, height);
  const ear = (leftEar + rightEar) / 2.0;

  return { ear, leftEar, rightEar };
}
