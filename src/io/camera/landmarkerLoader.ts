import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { getAssetUrl } from '../../core/paths';

export type LandmarkerDelegate = 'GPU' | 'CPU';

export interface LandmarkerInitResult {
  landmarker: FaceLandmarker;
  delegate: LandmarkerDelegate;
  fallbackOccurred: boolean;
  loadTimeMs: number;
}

/**
 * Initializes MediaPipe FaceLandmarker with GPU delegate first,
 * falling back automatically to CPU on failure.
 * All wasm and model files are loaded locally from public/ via getAssetUrl().
 */
export async function initializeFaceLandmarker(
  wasmPath = getAssetUrl('wasm'),
  modelPath = getAssetUrl('models/face_landmarker.task')
): Promise<LandmarkerInitResult> {
  const startTime = performance.now();
  const vision = await FilesetResolver.forVisionTasks(wasmPath);

  // 1. Attempt GPU delegate
  try {
    const gpuLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: modelPath,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numFaces: 1,
      minFaceDetectionConfidence: 0.35,
      minFacePresenceConfidence: 0.35,
      minTrackingConfidence: 0.35,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: true,
    });

    const loadTimeMs = Math.round(performance.now() - startTime);
    return {
      landmarker: gpuLandmarker,
      delegate: 'GPU',
      fallbackOccurred: false,
      loadTimeMs,
    };
  } catch (gpuError) {
    console.warn('[FaceLandmarker] GPU delegate failed or not supported in this environment, falling back to CPU:', gpuError);
  }

  // 2. Fallback to CPU delegate
  const cpuLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: modelPath,
      delegate: 'CPU',
    },
    runningMode: 'VIDEO',
    numFaces: 1,
    minFaceDetectionConfidence: 0.35,
    minFacePresenceConfidence: 0.35,
    minTrackingConfidence: 0.35,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: true,
  });

  const loadTimeMs = Math.round(performance.now() - startTime);
  return {
    landmarker: cpuLandmarker,
    delegate: 'CPU',
    fallbackOccurred: true,
    loadTimeMs,
  };
}
