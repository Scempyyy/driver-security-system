# AGENTS.md: NeuroDrive AI

Standing instructions for every agent working in this workspace. Read fully before doing any task.

## 1. What we are building

**NeuroDrive AI** is a driver-aware + vehicle-aware safety co-pilot (hackathon MVP).
Tagline: *One AI. Driver-Aware. Vehicle-Aware. Safety-Driven.*

It watches the driver (drowsiness, attention) and vehicle signals (vibration, engine/cabin audio) together, fuses them into ONE explainable risk score, and gives adaptive alerts. Its key idea is **context-aware fusion**: a drowsy driver plus a developing vehicle anomaly is riskier than either alone, and the system explains why.

The real-world problem: fatigue and distraction are major, under-reported causes of road crashes, and today's tools check one thing in isolation.

## 2. MVP scope (do NOT exceed)

Must-have:
1. **Drowsiness detection** from webcam: eye aspect ratio (EAR), PERCLOS over a 60 s window, long closures, blink rate, yawning (MAR), head nods (pitch).
2. **Attention monitoring** from webcam: head pose + approximate gaze, giving "eyes off road" duration. Call it *attention monitoring*, never "mind reading" or "brain" analysis.
3. **Vehicle anomaly flagging**: phone accelerometer (DeviceMotion) and microphone audio features, scored against a learned baseline. Plus a **Vehicle Signal Simulator** (sliders/buttons) so the demo is reliable. Simulated data must always be labelled "SIMULATED" in the UI.
4. **Transparent rule-based fusion engine** with confidence, persistence windows, and hysteresis.
5. **Adaptive alerts**, 4 levels, visual + sound + spoken voice.
6. **Explainable dashboard**: live state, risk timeline, alert history, a "why" card for every alert.
7. **Personal baseline**: ~60 s calibration at start, then bounded adaptation.

Stretch (ONLY after all must-haves work end-to-end): LLM-phrased explanations (template fallback must always work offline), trip report export (CSV/PDF), offline evaluation script on public datasets, multiple driver profiles.

Out of scope: medical diagnosis, mechanical fault diagnosis, cloud video upload, auth, payments, native mobile apps.

## 2a. Existing code: `techfestthing/` (REUSE THIS)

The workspace root already contains a folder named **`techfestthing/`**. It holds the **driver drowsiness detection system I built earlier**, and it is part of this project. It is the starting point for the driver-monitoring module, so **do not rebuild from scratch what already works.**

Rules:
- **Audit first.** Before planning, read the folder and report: language/framework, entry points, how to run it, which signals it already detects (eyes, yawning, head pose, etc.), models/dependencies, current accuracy/FPS if measurable, and anything broken or hard-coded.
- **Never assume its stack.** If it differs from Section 3 (e.g. Python + OpenCV/dlib/MediaPipe), do not silently rewrite it. Present the integration options below with a recommendation:
  - **A. Wrap:** keep the code as-is, run it as a local service that streams numeric features/events (via WebSocket or HTTP) to the new dashboard and fusion engine.
  - **B. Port:** re-implement its logic in TypeScript, in the browser.
  - **C. Hybrid:** keep its working detectors, port or replace only the parts that block integration.
  Prefer the option that gives the most reliable demo soonest while keeping the privacy promise (video is processed on this machine only).
- **Don't break it.** Do not delete or overwrite files in `techfestthing/`. Commit or copy a snapshot before any change, and keep it runnable on its own.
- Map what it already provides onto `DriverFeatures` in `core/types.ts`, and list what is **missing** (e.g. PERCLOS, personal baseline, attention/gaze, confidence). Only build the gaps.

## 3. Tech stack (ask before adding anything outside this)

- Vite + React + TypeScript (strict mode), Tailwind CSS, Zustand, Recharts
- `@mediapipe/tasks-vision` Face Landmarker, running fully in-browser
- Web Audio API (audio features), DeviceMotion API (vibration), `speechSynthesis` (voice alerts)
- Vitest for unit tests
- No cloud backend for the MVP. Persist baseline and event log in localStorage/IndexedDB. **Exception:** if the audit of `techfestthing/` recommends Option A or C, a small local service (e.g. Python + FastAPI/WebSocket) running on the same machine is allowed. Cloud services are not.
- Camera and sensors need HTTPS or localhost. iOS requires an explicit motion-permission request. Always provide a simulator fallback.

## 4. Architecture

```
src/
  core/                     # pure TS, NO DOM access, fully unit-testable
    types.ts                # shared contracts (build this FIRST)
    config.ts               # ALL thresholds/weights live here, no magic numbers elsewhere
    driver/                 # EAR, MAR, PERCLOS, blink rate, head pose, gaze features
    vehicle/                # audio + motion features, anomaly scoring, simulator
    baseline/               # calibration + bounded adaptation
    fusion/                 # risk engine, alert state machine, explanation builder
  io/                       # browser adapters: camera/MediaPipe, mic, motion, speech/sound
  ui/                       # Dashboard, LivePanel, RiskTimeline, AlertLog, ExplainCard,
                            # CalibrationWizard, SimulatorPanel, PrivacyBadge
  tests/
```

Core contracts (refine in `types.ts`, but keep the shape):

```ts
DriverFeatures  { t, faceDetected, quality, ear, perclos60, blinkRate, longClosureSec,
                  mar, yawning, headPitch, headYaw, headRoll, eyesOffRoadSec }
VehicleFeatures { t, source: 'sensor' | 'simulated', vibrationRms, vibrationAnomaly, audioAnomaly }
Factor          { id, label, contribution, evidence }        // evidence = human-readable numbers
RiskAssessment  { t, driverRisk, vehicleRisk, fusedRisk, level, confidence, factors: Factor[], explanation }
Alert           { id, t, level, assessment, acknowledged }
```

## 5. Fusion & alert logic

- Each factor produces a 0-1 score from (a) deviation from the personal baseline (clipped z-score) and (b) absolute safety floors, so a "chronically tired" baseline can never make dangerous behaviour look normal.
- `driverRisk`: drowsiness dominates (PERCLOS, long closures, yawns, nods); distraction is secondary.
- `vehicleRisk`: anomaly scores that must persist for N seconds before counting.
- **Compounding rule:** if driver level >= NOTICE and a vehicle anomaly is active, escalate one level and say so in the explanation.
- `confidence` depends on face-detection quality, lighting, signal availability, and calibration completeness. **Low confidence caps the level at NOTICE** unless the signal persists, which prevents false-alarm spam.
- Levels: `0 NORMAL`, `1 NOTICE` (visual), `2 WARNING` (chime + voice), `3 CRITICAL` (loud alarm + "pull over safely").
- Hysteresis (must stay below threshold for X s before downgrading) and per-level cooldowns to prevent flapping.
- Every alert gets an explanation: top 3 factors with real numbers, in plain language. Example: "Eyes closed 1.8 s, 4th long closure in 5 min, plus unusual vibration for 12 s. Risk raised because both appear together."

Initial thresholds, **starting guesses only. Put them in `config.ts` and tune by testing**:
eye closed when EAR < 0.75 x personal baseline (fallback 0.21); long closure >= 1.0 s; PERCLOS(60 s) >= 0.15 notice / 0.25 warning; yawn = MAR > 0.6 for >= 1.5 s; head pitch drop > 15 degrees for >= 1.5 s; eyes off road = yaw > 25 degrees for >= 2 s (notice) / 3 s (warning).

## 6. Coding rules

- TypeScript strict; no `any`. Pure functions in `core/`. Browser APIs only in `io/`.
- Fusion engine must be deterministic and covered by scenario tests: drowsy only; vehicle only; compound escalation; low-confidence cap; hysteresis/cooldown; calibration-incomplete behaviour.
- Target >= 15 FPS face processing; throttle UI updates to 5-10 Hz.
- Dashboard is for a passenger or post-trip review. **In-drive feedback is audio-first** (short spoken alerts); never require the driver to read the screen.
- Keep `README.md` current with run instructions and the demo script.

## 7. Guardrails (non-negotiable)

- **Privacy:** video frames never leave the user's device (browser or local process on the same machine) and are never stored. Only numeric features and events are kept locally. Show an always-visible "On-device" badge.
- **Honesty:** UI copy says "estimates risk", never "detects with certainty". Show: "Prototype. Not a certified safety system."
- No claims about reading brain activity or mental state. No hard-coded or fake metrics presented as real.
- Vehicle output is anomaly flagging, not fault diagnosis.

## 8. How agents should work

1. Start in **Planning mode**: first audit `techfestthing/` (Section 2a), then produce an implementation plan and task list, and wait for approval.
2. Land `core/types.ts` and `core/config.ts` before parallel work begins. They are the shared contract.
3. Small, focused changes. Run `npm run test` and `npm run build` before reporting done.
4. Produce a walkthrough artifact with screenshots of the dashboard for each milestone.
5. Ask before adding any dependency outside Section 3.

## 9. Definition of done (MVP)

- Calibration, live drowsiness + attention detection, and the vehicle simulator all work in the browser.
- Compound scenario (drowsy + vehicle anomaly) visibly escalates and is explained.
- Alert log shows the "why" for every alert.
- Tests and build pass; README has setup and demo steps.
- A 90-second demo runs reliably three times in a row.

## 10. Cross-platform rules (Arch Linux & Windows 10/11)

All agents working on NeuroDrive AI must follow these cross-platform rules:
1. **Pinned Dependencies & Clean Install:**
   - All dependencies in `package.json` must be pinned with exact versions (no `^` or `~`).
   - Standard installation command for all contributors and agents is `npm ci`.
   - Node.js LTS engine constraint is specified in `.nvmrc` and `package.json` (`"engines": { "node": ">=20.0.0", "npm": ">=9.0.0" }`).
2. **Cross-Platform npm Scripts:**
   - Do NOT use shell-specific syntax in `package.json` scripts (no `cp`, `mkdir -p`, `rm`, `export`, or `VAR=x`).
   - All asset management and file manipulations must be implemented in Node.js scripts using `node:fs` and `node:path` (e.g. `scripts/copy-assets.mjs`), triggered via `postinstall` or node invocation.
3. **Paths & Filesystem:**
   - Never hardcode absolute paths or root `/` assumptions in source files. Use `import.meta.env.BASE_URL` (or the helper `src/core/paths.ts: getAssetUrl()`) for public assets.
   - Maintain LF line endings across all files via `.gitattributes` (`* text=auto eol=lf`).
   - Maintain `"forceConsistentCasingInFileNames": true` in `tsconfig.json`.
4. **MediaPipe Delegate Robustness:**
   - Always attempt GPU delegate first and automatically fall back to CPU on failure without crashing.
   - Display the active delegate (`GPU` | `CPU`) and live FPS in the dev overlay.
5. **Audio & Voice Alerts:**
   - Bundle offline audio clips (`public/audio/notice.wav`, `warning.wav`, `critical.wav`) played via Web Audio API (`AudioContext`).
   - Treat `speechSynthesis` only as an optional extra, never the single point of failure.
6. **Mobile Testing:**
   - Use `npm run dev:https` (configured with `@vitejs/plugin-basic-ssl`) for cross-device mobile testing of DeviceMotion and audio sensors.
7. **Module Boundaries:**
   - During parallel milestones (M1–M4), each agent works strictly inside its assigned folders (`core/driver` + `io/camera`, `core/fusion` + `core/baseline`, `core/vehicle` + `io/audio` + `io/motion`, `ui`).
   - Shared contract files (`src/core/types.ts` and `src/core/config.ts`) are **append-only**. Agents must never mutate or delete existing contract definitions without user approval.
