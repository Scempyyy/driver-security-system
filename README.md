# driver-security-system (NeuroDrive AI)

A computer-vision and sensor-fusion safety system for monitoring driver attention, drowsiness, and vehicle signals.

## Overview
Built around Python, MediaPipe, OpenCV, TypeScript, and Vite, the project explores facial landmarks, eye behavior (EAR/MAR/PERCLOS), and vehicle telemetry to estimate attention signals in real time with an explainable risk engine.

## Core Capabilities
- **Face & Landmark Detection**: 478 face landmarks in real-time using MediaPipe.
- **Attention & Drowsiness Metrics**: Eye Aspect Ratio (EAR), Mouth Aspect Ratio (MAR), PERCLOS, blink rate, and 3D head pose/gaze tracking.
- **Sensor Fusion**: Combines driver attention state with vehicle vibration and acoustic cues into an explainable risk score.
- **Tiered Alerts**: Adaptive visual notices, natural voice alerts, and silence controls.
- **Dual Runtimes**:
  - `techfestthing/`: Standalone Python prototype (`drowsiness.py`) using OpenCV and MediaPipe.
  - `src/`: Interactive TypeScript/React dashboard with webcam MediaPipe integration and simulation tools.

> This is an experimental prototype, not a certified automotive safety system.

---

## Cross-Platform Setup & Installation

### Prerequisites
- **Node.js**: `v20.x` or `v22.x` (LTS recommended, see `.nvmrc`)
- **npm**: `v9.x` or higher
- **Webcam**: Standard USB or built-in webcam
- **Python**: 3.10+ (for standalone `techfestthing` scripts)

### Quick Start (Web Dashboard)

```bash
# 1. Clean reproducible install (runs postinstall asset copier automatically)
npm ci

# 2. Run unit tests
npm test

# 3. Build production bundle
npm run build

# 4. Start local development server
npm run dev
```

The application will be accessible at: `http://localhost:5173/`

### Standalone Python Prototype (`techfestthing/`)

```bash
cd techfestthing
pip install -r requirements.txt
python drowsiness.py
```

---

## Platform-Specific Instructions

### 1. Arch Linux Setup
- **Camera Access & Permissions:**
  Ensure your user account is in the `video` group:
  ```bash
  sudo usermod -aG video $USER
  ```
  Verify the camera device node exists:
  ```bash
  ls -la /dev/video*
  ```
- **Optional Speech Synthesis Support:**
  If you want browser spoken voice alerts in addition to the bundled PCM Web Audio clips:
  ```bash
  sudo pacman -S speech-dispatcher espeak-ng
  spd-say "NeuroDrive audio test"
  ```

### 2. Windows 10 / 11 Setup
- **Camera Privacy Settings:**
  1. Open **Windows Settings** (`Win + I`).
  2. Navigate to **Privacy & security** → **Camera**.
  3. Ensure **Camera access** is toggled **ON**, and **Let desktop apps access your camera** is enabled for your browser.

---

## System Architecture

```
nuerodrive/
├── techfestthing/          # Original Python/OpenCV/MediaPipe standalone module
│   ├── drowsiness.py       # Core PERCLOS / EAR / MAR detection
│   ├── ad.py               # Attention detector
│   ├── face_landmarker.task
│   └── requirements.txt
├── src/
│   ├── core/               # TypeScript contracts, risk fusion engine, baseline
│   ├── io/                 # MediaPipe FaceLandmarker loader, Web Audio, camera
│   ├── ui/                 # Real-time passenger dashboard
│   └── tests/              # Vitest unit & scenario tests
```

---

## Guardrails & Privacy Guarantee
- **100% On-Device:** Video frames are processed in-memory in the browser/client sandbox. No video or sensor data leaves your device.
- **Explainability:** Alerts provide an itemized breakdown of contributing signals with real numeric measurements.
