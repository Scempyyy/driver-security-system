/**
 * Head pose extraction from facial transformation matrix.
 *
 * MediaPipe Face Landmarker produces facialTransformationMatrixes:
 * 4x4 column-major matrices.
 * In MediaPipe Vision web tasks, `facialTransformationMatrixes[0].data` provides
 * a 16-element Float32Array representing a 4x4 column-major matrix:
 * [
 *   m00, m10, m20, m30,
 *   m01, m11, m21, m31,
 *   m02, m12, m22, m32,
 *   m03, m13, m23, m33
 * ]
 *
 * Target conventions:
 * - Pitch (+ down / nod, - up)
 * - Yaw (+ turn right, - turn left)
 * - Roll (+ tilt right, - tilt left)
 *
 * All angles returned in degrees.
 */

export interface HeadPose {
  pitch: number; // + down (nod), - up
  yaw: number;   // + turn right, - turn left
  roll: number;  // + tilt right, - tilt left
}

export type MatrixInput = number[] | Float32Array | number[][] | { data: Float32Array | number[] };

/**
 * Extracts 3x3 rotation matrix R[row][col] from a 16-element 4x4 matrix or 2D array.
 */
export function extractRotationMatrix(
  matrix: MatrixInput
): [
  [number, number, number],
  [number, number, number],
  [number, number, number]
] {
  // Unwrap MediaPipe Matrix object if needed
  const raw = (matrix && typeof matrix === 'object' && 'data' in matrix)
    ? (matrix as { data: Float32Array | number[] }).data
    : matrix;

  if (Array.isArray(raw) && Array.isArray(raw[0])) {
    const m = raw as number[][];
    return [
      [m[0][0], m[0][1], m[0][2]],
      [m[1][0], m[1][1], m[1][2]],
      [m[2][0], m[2][1], m[2][2]],
    ];
  }

  const flat = raw as number[] | Float32Array;
  if (!flat || flat.length < 16) {
    throw new Error(`Invalid transformation matrix length: ${flat?.length}. Expected 16 elements.`);
  }

  // Column-major 4x4 matrix:
  // column 0: flat[0] (R00), flat[1] (R10), flat[2] (R20), flat[3] (0)
  // column 1: flat[4] (R01), flat[5] (R11), flat[6] (R21), flat[7] (0)
  // column 2: flat[8] (R02), flat[9] (R12), flat[10] (R22), flat[11] (0)
  // column 3: flat[12] (tx), flat[13] (ty), flat[14] (tz), flat[15] (1)
  return [
    [flat[0], flat[4], flat[8]],
    [flat[1], flat[5], flat[9]],
    [flat[2], flat[6], flat[10]],
  ];
}

const RAD2DEG = 180 / Math.PI;

/**
 * Calculates Euler angles in degrees from a 3x3 rotation matrix or 4x4 transformation matrix.
 *
 * Rotation sequence: R = R_yaw * R_pitch * R_roll
 * Where:
 * - R_yaw rotates around Y axis (yaw > 0 = turn right)
 * - R_pitch rotates around X axis (pitch > 0 = tilt down / nod)
 * - R_roll rotates around Z axis (roll > 0 = tilt right)
 *
 * Analytical formulation of R = R_y(yaw) * R_x(pitch) * R_z(roll):
 * [
 *   [ cy*cr + sy*sp*sr,  -cy*sr + sy*sp*cr,  sy*cp ],
 *   [            cp*sr,              cp*cr,    -sp ],
 *   [-sy*cr + cy*sp*sr,   sy*sr + cy*sp*cr,  cy*cp ]
 * ]
 *
 * From this rotation matrix:
 * R[1][2] = -sp => pitch = asin(-R[1][2])
 * R[0][2] / R[2][2] = (sy*cp) / (cy*cp) = tan(yaw) => yaw = atan2(R[0][2], R[2][2])
 * R[1][0] / R[1][1] = (cp*sr) / (cp*cr) = tan(roll) => roll = atan2(R[1][0], R[1][1])
 */
export function calculateHeadPose(
  matrix: MatrixInput
): HeadPose {
  const R = extractRotationMatrix(matrix);

  // Clamp -R[1][2] to [-1, 1] for Math.asin numerical stability
  const sinPitch = Math.max(-1, Math.min(1, -R[1][2]));
  const pitchRad = Math.asin(sinPitch);

  let yawRad: number;
  let rollRad: number;

  const cosPitch = Math.cos(pitchRad);
  if (Math.abs(cosPitch) > 1e-6) {
    yawRad = Math.atan2(R[0][2], R[2][2]);
    rollRad = Math.atan2(R[1][0], R[1][1]);
  } else {
    // Gimbal lock case (pitch near +/- 90 degrees)
    yawRad = Math.atan2(-R[2][0], R[0][0]);
    rollRad = 0;
  }

  return {
    pitch: pitchRad * RAD2DEG,
    yaw: yawRad * RAD2DEG,
    roll: rollRad * RAD2DEG,
  };
}

/**
 * Creates a column-major 4x4 matrix from Euler angles (in degrees):
 * - pitch (+ down / nod)
 * - yaw (+ turn right)
 * - roll (+ tilt right)
 * Corresponding directly to R = R_y(yaw) * R_x(pitch) * R_z(roll).
 */
export function createPoseMatrix(pitchDeg: number, yawDeg: number, rollDeg: number): number[] {
  const p = (pitchDeg * Math.PI) / 180;
  const y = (yawDeg * Math.PI) / 180;
  const r = (rollDeg * Math.PI) / 180;

  const cp = Math.cos(p);
  const sp = Math.sin(p);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cr = Math.cos(r);
  const sr = Math.sin(r);

  const r00 = cy * cr + sy * sp * sr;
  const r01 = -cy * sr + sy * sp * cr;
  const r02 = sy * cp;

  const r10 = cp * sr;
  const r11 = cp * cr;
  const r12 = -sp;

  const r20 = -sy * cr + cy * sp * sr;
  const r21 = sy * sr + cy * sp * cr;
  const r22 = cy * cp;

  // Column-major order:
  return [
    r00, r10, r20, 0,
    r01, r11, r21, 0,
    r02, r12, r22, 0,
    0,   0,   0,   1,
  ];
}
