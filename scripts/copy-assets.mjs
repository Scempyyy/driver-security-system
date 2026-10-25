import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const wasmSourceDir = path.join(rootDir, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const wasmTargetDir = path.join(rootDir, 'public', 'wasm');
const modelsTargetDir = path.join(rootDir, 'public', 'models');
const audioTargetDir = path.join(rootDir, 'public', 'audio');

// 1. Ensure target directories exist (cross-platform)
fs.mkdirSync(wasmTargetDir, { recursive: true });
fs.mkdirSync(modelsTargetDir, { recursive: true });
fs.mkdirSync(audioTargetDir, { recursive: true });

// 2. Copy MediaPipe WASM runtime files
if (fs.existsSync(wasmSourceDir)) {
  const wasmFiles = fs.readdirSync(wasmSourceDir);
  for (const file of wasmFiles) {
    const src = path.join(wasmSourceDir, file);
    const dest = path.join(wasmTargetDir, file);
    fs.copyFileSync(src, dest);
  }
  console.log(`[copy-assets] Copied ${wasmFiles.length} MediaPipe WASM assets to public/wasm`);
} else {
  console.warn(`[copy-assets] Warning: ${wasmSourceDir} does not exist yet. Run npm install first.`);
}

// 3. Copy FaceLandmarker model asset from techfestthing if available
const modelSource = path.join(rootDir, 'techfestthing', 'face_landmarker.task');
const modelDest = path.join(modelsTargetDir, 'face_landmarker.task');
if (fs.existsSync(modelSource) && !fs.existsSync(modelDest)) {
  fs.copyFileSync(modelSource, modelDest);
  console.log('[copy-assets] Copied face_landmarker.task to public/models');
}

// 4. Generate clean, cross-platform WAV sound clips for alerts
// Audio WAV generator (16-bit PCM, 44.1kHz mono)
function createWavBuffer(sampleRate, durationSec, frequencyGenerator) {
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataByteLength = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataByteLength);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataByteLength, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20);  // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(1, 22);  // NumChannels (1 mono)
  buffer.writeUInt32LE(sampleRate, 24); // SampleRate
  buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate
  buffer.writeUInt16LE(2, 32);  // BlockAlign
  buffer.writeUInt16LE(16, 34); // BitsPerSample

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataByteLength, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.max(-1, Math.min(1, frequencyGenerator(t, durationSec)));
    const intSample = Math.floor(sample * 32767);
    buffer.writeInt16LE(intSample, 44 + i * 2);
  }

  return buffer;
}

const sampleRate = 44100;

// Notice alert: Gentle 2-tone melodic chime (520Hz -> 659Hz)
const noticeDest = path.join(audioTargetDir, 'notice.wav');
if (!fs.existsSync(noticeDest)) {
  const noticeBuffer = createWavBuffer(sampleRate, 0.45, (t) => {
    const freq = t < 0.2 ? 523.25 : 659.25;
    const decay = Math.exp(-t * 4);
    return Math.sin(2 * Math.PI * freq * t) * decay * 0.5;
  });
  fs.writeFileSync(noticeDest, noticeBuffer);
  console.log('[copy-assets] Generated public/audio/notice.wav');
}

// Warning alert: Urgent 3-pulse beep (880Hz)
const warningDest = path.join(audioTargetDir, 'warning.wav');
if (!fs.existsSync(warningDest)) {
  const warningBuffer = createWavBuffer(sampleRate, 0.6, (t) => {
    const pulse = Math.floor(t * 5) % 2 === 0 ? 1 : 0;
    const freq = 880;
    return Math.sin(2 * Math.PI * freq * t) * pulse * 0.6;
  });
  fs.writeFileSync(warningDest, warningBuffer);
  console.log('[copy-assets] Generated public/audio/warning.wav');
}

// Critical alert: Alarm Siren (Alternating 950Hz - 1300Hz rapid warble)
const criticalDest = path.join(audioTargetDir, 'critical.wav');
if (!fs.existsSync(criticalDest)) {
  // If techfestthing/alarm.wav exists, copy or use alarm siren
  const techfestAlarm = path.join(rootDir, 'techfestthing', 'alarm.wav');
  if (fs.existsSync(techfestAlarm)) {
    fs.copyFileSync(techfestAlarm, criticalDest);
    console.log('[copy-assets] Copied techfestthing/alarm.wav to public/audio/critical.wav');
  } else {
    const criticalBuffer = createWavBuffer(sampleRate, 1.2, (t) => {
      const freq = 900 + 400 * Math.sin(2 * Math.PI * 6 * t);
      return Math.sin(2 * Math.PI * freq * t) * 0.7;
    });
    fs.writeFileSync(criticalDest, criticalBuffer);
    console.log('[copy-assets] Generated public/audio/critical.wav');
  }
}
