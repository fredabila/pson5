#!/usr/bin/env node
/**
 * Procedurally generate the teaser's SFX layer. The ambient music bed
 * is produced separately by `generate-music-lyria.mjs` (Google Lyria 2
 * via Vertex AI) — this file only handles the short one-shots.
 *
 * Produces:
 *   public/audio/whoosh.wav    — 0.6s filtered-noise sweep for scene wipes
 *   public/audio/tick.wav      — 120ms muted tick for card reveals
 *   public/audio/chime.wav     — 900ms two-voice bell for the outro
 *   public/audio/impact.wav    — 400ms low sub + click for the title reveal
 *
 * All assets are mono 22.05kHz 16-bit PCM; the directory is gitignored.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "..", "public", "audio");
mkdirSync(outDir, { recursive: true });

const SAMPLE_RATE = 22050;

function encodeWav(samples) {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  let p = 0;
  buffer.write("RIFF", p); p += 4;
  buffer.writeUInt32LE(36 + dataSize, p); p += 4;
  buffer.write("WAVE", p); p += 4;
  buffer.write("fmt ", p); p += 4;
  buffer.writeUInt32LE(16, p); p += 4;
  buffer.writeUInt16LE(1, p); p += 2;      // PCM
  buffer.writeUInt16LE(1, p); p += 2;      // mono
  buffer.writeUInt32LE(SAMPLE_RATE, p); p += 4;
  buffer.writeUInt32LE(SAMPLE_RATE * 2, p); p += 4;
  buffer.writeUInt16LE(2, p); p += 2;      // block align
  buffer.writeUInt16LE(16, p); p += 2;     // bits per sample
  buffer.write("data", p); p += 4;
  buffer.writeUInt32LE(dataSize, p); p += 4;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), p);
    p += 2;
  }
  return buffer;
}

function write(name, samples) {
  const path = resolve(outDir, name);
  writeFileSync(path, encodeWav(samples));
  const seconds = (samples.length / SAMPLE_RATE).toFixed(2);
  const kb = (samples.length * 2 / 1024).toFixed(1);
  console.log(`  ${name.padEnd(14)} ${seconds}s · ${kb}KB`);
}

// --- helpers -----------------------------------------------------------

function sine(freq, t, phase = 0) {
  return Math.sin(2 * Math.PI * freq * t + phase);
}

// biquad-ish one-pole lowpass for cheap noise shaping
function onepole(samples, cutoff) {
  const dt = 1 / SAMPLE_RATE;
  const rc = 1 / (2 * Math.PI * cutoff);
  const alpha = dt / (rc + dt);
  const out = new Float32Array(samples.length);
  let prev = 0;
  for (let i = 0; i < samples.length; i++) {
    prev = prev + alpha * (samples[i] - prev);
    out[i] = prev;
  }
  return out;
}

function onepoleHighpass(samples, cutoff) {
  const lp = onepole(samples, cutoff);
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] - lp[i];
  return out;
}

// Deterministic PRNG so renders are reproducible
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- ambient bed -------------------------------------------------------

function makeAmbient(seconds) {
  const n = Math.floor(seconds * SAMPLE_RATE);
  const out = new Float32Array(n);
  const rnd = mulberry32(1337);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    // Slow LFO on each voice — 0.07Hz / 0.11Hz
    const lfo1 = 0.5 + 0.5 * sine(0.07, t);
    const lfo2 = 0.5 + 0.5 * sine(0.11, t, 1.2);
    const lfo3 = 0.5 + 0.5 * sine(0.05, t, 2.1);

    // Drone: A1, E2, A2 — tonal bed
    const drone =
      sine(55.0, t) * 0.38 * lfo1 +
      sine(82.4, t) * 0.22 * lfo2 +
      sine(110.0, t) * 0.16 * lfo3;

    // Soft detuned pad around A3 that drifts
    const pad =
      sine(220.0, t) * 0.05 * lfo1 +
      sine(220.0 * 1.003, t, 0.7) * 0.05 * lfo2;

    // Distant shimmer — barely audible, pulses slow
    const shimmerGate = Math.max(0, sine(0.09, t, 0.4));
    const shimmer = sine(1760.0, t) * 0.015 * shimmerGate;

    // Sparse tactile dust (random quiet clicks) — only every few seconds
    let dust = 0;
    if (rnd() > 0.99986) {
      dust = (rnd() * 2 - 1) * 0.06;
    }

    out[i] = drone + pad + shimmer + dust;
  }
  // Shape the bed with a one-pole LP to round off any edges
  const shaped = onepole(out, 3200);
  // Fade in/out over 2s each
  const fadeSamples = 2 * SAMPLE_RATE;
  for (let i = 0; i < fadeSamples; i++) {
    const k = i / fadeSamples;
    shaped[i] *= k;
    shaped[n - 1 - i] *= k;
  }
  // Headroom
  for (let i = 0; i < n; i++) shaped[i] *= 0.52;
  return shaped;
}

// --- whoosh for scene wipes --------------------------------------------

function makeWhoosh(seconds = 0.6) {
  const n = Math.floor(seconds * SAMPLE_RATE);
  const rnd = mulberry32(2402);
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) raw[i] = rnd() * 2 - 1;

  // Sweep the cutoff from 2500Hz down to 300Hz (whoosh tail)
  const swept = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const progress = i / n;
    const cutoff = 2500 - (2500 - 300) * progress;
    const rc = 1 / (2 * Math.PI * cutoff);
    const alpha = (1 / SAMPLE_RATE) / (rc + (1 / SAMPLE_RATE));
    swept[i] = (i > 0 ? swept[i - 1] : 0) + alpha * (raw[i] - (i > 0 ? swept[i - 1] : 0));
  }
  // Bandpass-ish by removing low-end rumble
  const hp = onepoleHighpass(swept, 140);

  // Envelope: fast attack, exponential decay
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const attack = Math.min(1, t / 0.08);
    const decay = Math.exp(-t * 3.2);
    hp[i] *= attack * decay * 0.75;
  }
  return hp;
}

// --- tick (UI reveal) --------------------------------------------------

function makeTick(seconds = 0.12) {
  const n = Math.floor(seconds * SAMPLE_RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 55);
    out[i] = (sine(820, t) * 0.5 + sine(1240, t, 1.1) * 0.3) * env * 0.35;
  }
  return out;
}

// --- impact (title reveal) ---------------------------------------------

function makeImpact(seconds = 0.4) {
  const n = Math.floor(seconds * SAMPLE_RATE);
  const out = new Float32Array(n);
  const rnd = mulberry32(773);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    // Sub — fast downward pitch envelope from 90Hz to 42Hz
    const subFreq = 90 - (90 - 42) * Math.min(1, t / 0.18);
    const subEnv = Math.exp(-t * 7);
    const sub = sine(subFreq, t) * 0.6 * subEnv;

    // Click — short burst of filtered noise
    const noise = (rnd() * 2 - 1);
    const clickEnv = Math.exp(-t * 80);
    const click = noise * 0.18 * clickEnv;

    out[i] = sub + click;
  }
  return onepole(out, 4000);
}

// --- chime (outro bell) ------------------------------------------------

function makeChime(seconds = 0.9) {
  const n = Math.floor(seconds * SAMPLE_RATE);
  const out = new Float32Array(n);
  // Two-voice bell — A5 + E6 with gentle partials
  const partials = [
    { f: 880, a: 0.55, d: 2.2 },
    { f: 1318.5, a: 0.3, d: 2.6 },
    { f: 1760, a: 0.18, d: 3.0 },
    { f: 2637, a: 0.08, d: 4.0 }
  ];
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    let s = 0;
    for (const p of partials) {
      s += sine(p.f, t) * p.a * Math.exp(-t * p.d);
    }
    const attack = Math.min(1, t / 0.01);
    out[i] = s * attack * 0.3;
  }
  return out;
}

// --- run ----------------------------------------------------------------

console.log("Generating PSON5 teaser SFX → public/audio/");
write("whoosh.wav", makeWhoosh());
write("tick.wav", makeTick());
write("impact.wav", makeImpact());
write("chime.wav", makeChime());
console.log("Done. (Ambient bed is generated by generate-music-lyria.mjs)");
