# NeuroDrive AI

> **One AI. Driver-Aware. Vehicle-Aware. Safety-Driven.**  
> *A hackathon MVP safety co-pilot.*

NeuroDrive AI continuously observes the driver (drowsiness, attention drift) and vehicle signals (vibration, cabin audio) together, fuses them into ONE explainable risk score, and provides adaptive, tiered alerts.

**The Pitch:** *"A drowsy driver in a vehicle with a developing fault is far riskier than either alone. NeuroDrive AI sees both, compound-escalates the alert, and explicitly tells you why."*

---

## Cross-Platform Setup & Installation

### Prerequisites
- **Node.js**: `v20.x` or `v22.x` (LTS recommended, see `.nvmrc`)
- **npm**: `v9.x` or higher
- **Webcam**: Standard USB or built-in webcam

### Quick Start (Arch Linux & Windows 10/11)

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

---

### Platform-Specific Instructions

#### 1. Arch Linux Setup
- **Camera Access & Permissions:**
  Ensure your user account is in the `video` group:
  ```bash
  sudo usermod -aG video $USER
  ```
  *(Log out and log back in for changes to take effect).*
  Verify the camera device node exists:
  ```bash
  ls -la /dev/video*
  ```
- **Optional Speech Synthesis Support:**
  Chromium/Brave/Firefox on Arch use `speech-dispatcher` for Web Speech API (`window.speechSynthesis`). If you want spoken voice alerts in addition to the built-in bundled Web Audio clips:
  ```bash
  sudo pacman -S speech-dispatcher espeak-ng
  spd-say "NeuroDrive audio test"
  ```
  *(Note: NeuroDrive AI bundles offline PCM WAV clips that play immediately via Web Audio without needing external speech engines).*

#### 2. Windows 10 / 11 Setup
- **Camera Privacy Settings:**
  1. Open **Windows Settings** (`Win + I`).
  2. Navigate to **Privacy & security** → **Camera**.
  3. Ensure **Camera access** is toggled **ON**, and **Let desktop apps access your camera** is enabled for your browser (Chrome/Edge/Brave).
- **WSL2 Note:**
  If developing inside WSL2, run the Vite dev server inside WSL2 and open the browser on Windows (`http://localhost:5173/`), or attach USB cameras to WSL2 using `usbipd-win`. Running directly in native Windows PowerShell/CMD works out-of-the-box.

---

### Mobile Phone Testing (Over HTTPS)

To test on an iPhone or Android phone connected to the same Wi-Fi network (enabling phone accelerometer `DeviceMotion` and microphone access):

```bash
npm run dev:https
```
1. Open the displayed HTTPS network address on your phone (e.g. `https://192.168.1.X:5173/`).
2. Accept the local self-signed development certificate.
3. Grant camera and motion sensor permissions.

---

## System Architecture

```
src/
  core/                     # Pure TS, NO DOM access, 100% unit-testable
    types.ts                # Shared contracts (DriverFeatures, VehicleFeatures, RiskAssessment, Alert)
    config.ts               # ALL thresholds, weights, and timings (no magic numbers)
    paths.ts                # Cross-platform asset URL resolver (import.meta.env.BASE_URL)
    driver/                 # EAR, MAR, PERCLOS, blink rate, 3D head pose, gaze
    vehicle/                # Audio RMS + band bars, accelerometer RMS, simulator
    baseline/               # 15s/60s calibration + bounded adaptation
    fusion/                 # Risk engine, compound escalation, explanation builder
  io/                       # Browser adapters
    camera/                 # MediaPipe FaceLandmarker loader (GPU with CPU auto-fallback)
    audio/                  # Web Audio input & simple 3-band energy
    motion/                 # DeviceMotion accelerometer listener
    speech/                 # Bundled Web Audio sound player + optional TTS
  ui/                       # Passenger dashboard & explainable UI
  tests/                    # Vitest unit & scenario tests
```

---

## Guardrails & Privacy Guarantee

- **100% On-Device:** Video frames are processed in-memory in the browser sandbox. No video or sensor data ever leaves your device or touches any cloud server.
- **Honesty & Safety:** Displays an explicit prototype notice: *"Prototype. Not a certified safety system. Estimates risk."*
- **Explainability:** Every alert produces a "Why" card citing the top 3 contributing signals with real numeric measurements.


---

## 90-Second Hackathon Demo Script

Follow this sequence for a reliable, judges-ready presentation:

1. **Launch & Privacy Guarantee (0–15s):**
   - Run `npm run dev` and navigate to `http://localhost:5173/`.
   - Grant webcam permissions and point out the persistent green badge: **"On-device processing • No video leaves device"**.
   - Select **"15s Quick Demo Calibration"** (or click **"Skip Calibration / Use Saved Profile"** for instant activation).
2. **Normal State (15–30s):**
   - Look straight ahead with eyes open.
   - Point out the green indicators: Driver Risk low, Vehicle Signals nominal (`NORMAL`), Fused Risk = `0 NORMAL`.
3. **Drowsiness & Alert Escalation (30–50s):**
   - Close eyes for ~2 seconds: Notice indicator lights up.
   - Repeat / hold closure: Watch it escalate to **`2 WARNING`**.
   - The browser speaks the alert via SpeechSynthesis accompanied by the warning chime.
   - Yawn (or click the quick simulation button): The **"Why" Explanation Card** immediately cites: *"Eyes closed 2.0s, Yawning detected"*.
4. **Compound Escalation (The Hackathon Winner!) (50–75s):**
   - While in the drowsy state, click **"Brake Judder"** in the Vehicle Signal Simulator.
   - The system immediately compound-escalates to **`3 CRITICAL`** (loud alarm + spoken instruction: *"Critical: pull over safely"*).
   - Point out the explanation card:  
     > *"Prolonged Eye Closure (2.1s) + Severe Vibration Anomaly (0.85 m/s²). Risk raised because both appear together."*
   - Highlight the clearly labeled **"[SIMULATED]"** badge and the simulated emergency family card.
5. **Explainability & Review (75–90s):**
   - Review the **Risk Timeline (Recharts)** showing the historical risk spike.
   - Click into the **Alert Log** to inspect the diagnostic snapshot and factors behind every past alert.
