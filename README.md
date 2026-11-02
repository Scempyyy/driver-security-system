<div align="center">

# NeuroDrive AI
### Driver attention & drowsiness monitoring

An experimental computer-vision and sensor-fusion safety project.

</div>

---

## Overview
NeuroDrive explores real-time driver attention signals using facial landmarks, eye and mouth behavior, and vehicle-related inputs. The system presents an explainable risk estimate and tiered alerts.

## Core capabilities
- **Face landmarks:** MediaPipe facial landmark detection
- **Attention signals:** EAR, MAR, PERCLOS, blink rate, and head-pose/gaze signals
- **Sensor fusion:** attention state combined with vibration and acoustic cues
- **Alerts:** visual notices, voice alerts, and silence controls
- **Two runtimes:** standalone Python prototype and interactive TypeScript dashboard

## Quick start — web dashboard
Prerequisites: Node.js 20.x or 22.x, npm 9+, and a webcam.

```bash
npm ci
npm test
npm run build
npm run dev
```

Open `http://localhost:5173/`.

## Python prototype
```bash
cd techfestthing
pip install -r requirements.txt
python drowsiness.py
```

## Privacy & limitations
Video is processed in-memory on the client; the project is designed not to send video or sensor data off-device. This is an experimental prototype—not a certified automotive safety system. Do not rely on it as a substitute for safe driving or certified safety equipment.

## Stack
Python · OpenCV · MediaPipe · TypeScript · Vite
