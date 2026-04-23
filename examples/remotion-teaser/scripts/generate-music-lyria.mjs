#!/usr/bin/env node
/**
 * Generate the teaser's ambient music bed with Google DeepMind's Lyria 2
 * (via Vertex AI) and stitch three 30-second clips into one ~74s bed with
 * crossfades + a gentle head/tail fade.
 *
 * Auth is handled by Application Default Credentials — run:
 *   gcloud auth application-default login --project=<PROJECT_ID>
 * before invoking this script.
 *
 * Output: public/audio/ambient.wav  (48kHz, 16-bit, mono — matches SFX).
 *
 * Usage:
 *   PROJECT_ID=... LOCATION=us-central1 node scripts/generate-music-lyria.mjs
 */
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "..", "public", "audio");
const cacheDir = resolve(__dirname, "..", ".cache", "lyria");
mkdirSync(outDir, { recursive: true });
mkdirSync(cacheDir, { recursive: true });

const PROJECT_ID = process.env.PROJECT_ID ?? "eintercon-2160b";
const LOCATION = process.env.LOCATION ?? "us-central1";
const MODEL = "lyria-002";
const ENDPOINT = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:predict`;

// --- prompt ------------------------------------------------------------

const PROMPT = [
  "Modern tech documentary underscore with forward motion",
  "Warm analog synthesizer pad in a major key",
  "Subtle rhythmic pulse in the mid register, felt not heard",
  "Bright optimistic bell tones sparkle occasionally",
  "Confident, hopeful, modern, propulsive but restrained",
  "Approximately 95 bpm with a gentle steady pulse",
  "Electronic minimalism with warm textural analog character",
  "Feels like a product launch video, not a requiem"
].join(". ");

const NEGATIVE_PROMPT = [
  "minor key",
  "funeral",
  "melancholic",
  "dark",
  "sad",
  "somber",
  "drums",
  "heavy percussion",
  "vocals",
  "singing",
  "lyrics",
  "distortion",
  "horror"
].join(", ");

const SAMPLE_COUNT = 3; // three variations to crossfade

// --- auth --------------------------------------------------------------

function getAccessToken() {
  try {
    const token = execSync("gcloud auth application-default print-access-token", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
    if (!token.startsWith("ya29.") && !token.startsWith("eya")) {
      throw new Error(`Unexpected token format: ${token.slice(0, 12)}...`);
    }
    return token;
  } catch (err) {
    console.error(
      "Failed to get ADC token. Run `gcloud auth application-default login` first.\n",
      err.message
    );
    process.exit(1);
  }
}

// --- Lyria call ---------------------------------------------------------

async function callLyria(token) {
  const body = {
    instances: [
      {
        prompt: PROMPT,
        negative_prompt: NEGATIVE_PROMPT,
        sample_count: SAMPLE_COUNT
      }
    ]
  };

  console.log(`POST ${ENDPOINT}`);
  console.log(`  prompt: "${PROMPT.slice(0, 80)}..."`);
  console.log(`  samples: ${SAMPLE_COUNT}`);

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const raw = await res.text();
  if (!res.ok) {
    console.error(`\nHTTP ${res.status} ${res.statusText}`);
    console.error(raw.slice(0, 2000));
    process.exit(1);
  }

  const json = JSON.parse(raw);
  if (!json.predictions || !Array.isArray(json.predictions)) {
    console.error("Unexpected response shape:", JSON.stringify(json).slice(0, 800));
    process.exit(1);
  }
  console.log(`  ← got ${json.predictions.length} predictions`);
  return json.predictions;
}

// --- WAV parsing + mixing ----------------------------------------------

function parseWav(buf) {
  // Locate "fmt " and "data" chunks — Lyria output is a well-formed WAV
  if (buf.slice(0, 4).toString() !== "RIFF") throw new Error("not a RIFF");
  if (buf.slice(8, 12).toString() !== "WAVE") throw new Error("not a WAVE");

  let p = 12;
  let fmt = null;
  let dataOffset = -1;
  let dataSize = 0;
  while (p < buf.length - 8) {
    const chunkId = buf.slice(p, p + 4).toString();
    const chunkSize = buf.readUInt32LE(p + 4);
    if (chunkId === "fmt ") {
      fmt = {
        audioFormat: buf.readUInt16LE(p + 8),
        numChannels: buf.readUInt16LE(p + 10),
        sampleRate: buf.readUInt32LE(p + 12),
        byteRate: buf.readUInt32LE(p + 16),
        blockAlign: buf.readUInt16LE(p + 20),
        bitsPerSample: buf.readUInt16LE(p + 22)
      };
    } else if (chunkId === "data") {
      dataOffset = p + 8;
      // Lyria's header occasionally advertises a larger data region than
      // what's actually in the buffer — clamp to what we've really got.
      dataSize = Math.min(chunkSize, buf.length - dataOffset);
      break;
    }
    p += 8 + chunkSize + (chunkSize % 2);
  }
  if (!fmt || dataOffset < 0) throw new Error("missing fmt/data chunk");

  // Convert PCM to Float32, downmix stereo → mono if needed
  const bits = fmt.bitsPerSample;
  const channels = fmt.numChannels;
  const sampleBytes = bits / 8;
  const frameBytes = sampleBytes * channels;
  const frames = Math.floor(dataSize / frameBytes);
  const out = new Float32Array(frames);

  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      const off = dataOffset + i * frameBytes + c * sampleBytes;
      let v;
      if (bits === 16) v = buf.readInt16LE(off) / 32768;
      else if (bits === 24) {
        const lo = buf.readUInt16LE(off);
        const hi = buf.readInt8(off + 2);
        v = ((hi << 16) | lo) / 8388608;
      } else if (bits === 32) v = buf.readInt32LE(off) / 2147483648;
      else throw new Error(`unsupported bit depth ${bits}`);
      sum += v;
    }
    out[i] = sum / channels;
  }

  return { samples: out, sampleRate: fmt.sampleRate };
}

function encodeWav16(samples, sampleRate) {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  let p = 0;
  buffer.write("RIFF", p); p += 4;
  buffer.writeUInt32LE(36 + dataSize, p); p += 4;
  buffer.write("WAVE", p); p += 4;
  buffer.write("fmt ", p); p += 4;
  buffer.writeUInt32LE(16, p); p += 4;
  buffer.writeUInt16LE(1, p); p += 2;
  buffer.writeUInt16LE(1, p); p += 2;
  buffer.writeUInt32LE(sampleRate, p); p += 4;
  buffer.writeUInt32LE(sampleRate * 2, p); p += 4;
  buffer.writeUInt16LE(2, p); p += 2;
  buffer.writeUInt16LE(16, p); p += 2;
  buffer.write("data", p); p += 4;
  buffer.writeUInt32LE(dataSize, p); p += 4;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), p);
    p += 2;
  }
  return buffer;
}

function stitch(clips, sampleRate, crossfadeSeconds = 4) {
  const xfade = Math.floor(crossfadeSeconds * sampleRate);
  // Total length = sum(clip lengths) - xfade * (clips-1)
  const total = clips.reduce((a, c) => a + c.length, 0) - xfade * (clips.length - 1);
  const out = new Float32Array(total);

  let cursor = 0;
  clips.forEach((clip, idx) => {
    const start = cursor;
    if (idx === 0) {
      // Simple copy; last xfade frames will be overwritten during next blend
      for (let i = 0; i < clip.length; i++) out[start + i] = clip[i];
      cursor += clip.length - xfade;
    } else {
      // Crossfade first xfade frames with existing data
      for (let i = 0; i < xfade; i++) {
        const t = i / xfade;
        const fadeOut = Math.cos((t * Math.PI) / 2); // equal-power
        const fadeIn = Math.sin((t * Math.PI) / 2);
        out[start + i] = out[start + i] * fadeOut + clip[i] * fadeIn;
      }
      // Rest of this clip — just copy
      for (let i = xfade; i < clip.length; i++) {
        out[start + i] = clip[i];
      }
      cursor += clip.length - xfade;
    }
  });

  return out;
}

function fadeHeadTail(samples, sampleRate, headSec = 1.5, tailSec = 2.5) {
  const head = Math.floor(headSec * sampleRate);
  const tail = Math.floor(tailSec * sampleRate);
  for (let i = 0; i < head; i++) samples[i] *= i / head;
  for (let i = 0; i < tail; i++) samples[samples.length - 1 - i] *= i / tail;
}

// --- main --------------------------------------------------------------

async function main() {
  const cacheKey = createHash("sha256")
    .update(PROMPT + "|" + NEGATIVE_PROMPT + "|" + SAMPLE_COUNT)
    .digest("hex")
    .slice(0, 16);
  const cachePath = resolve(cacheDir, `${cacheKey}.json`);

  let predictions;
  if (existsSync(cachePath) && !process.env.REFRESH) {
    console.log(`cache hit → ${cachePath}`);
    predictions = JSON.parse(readFileSync(cachePath, "utf8"));
  } else {
    const token = getAccessToken();
    predictions = await callLyria(token);
    writeFileSync(cachePath, JSON.stringify(predictions));
    console.log(`cached → ${cachePath}`);
  }

  // Each prediction has `{ bytesBase64Encoded, mimeType }`
  const clips = predictions.map((pred, i) => {
    const b64 =
      pred.bytesBase64Encoded ??
      pred.audioContent ??
      pred.audio ??
      (typeof pred === "string" ? pred : null);
    if (!b64) {
      console.error(`prediction[${i}] has no audio bytes. Keys:`, Object.keys(pred ?? {}));
      process.exit(1);
    }
    const wavBuf = Buffer.from(b64, "base64");
    const { samples, sampleRate } = parseWav(wavBuf);
    const seconds = samples.length / sampleRate;
    console.log(`  clip[${i}]: ${seconds.toFixed(2)}s · ${sampleRate}Hz`);
    return { samples, sampleRate };
  });

  const sampleRate = clips[0].sampleRate;
  for (const c of clips) {
    if (c.sampleRate !== sampleRate) {
      console.error("sample rate mismatch across clips");
      process.exit(1);
    }
  }

  const stitched = stitch(
    clips.map((c) => c.samples),
    sampleRate,
    4 /* seconds crossfade */
  );
  fadeHeadTail(stitched, sampleRate);

  // Overall headroom so the bed sits well under voice/SFX
  for (let i = 0; i < stitched.length; i++) stitched[i] *= 0.82;

  const outPath = resolve(outDir, "ambient.wav");
  writeFileSync(outPath, encodeWav16(stitched, sampleRate));
  const seconds = stitched.length / sampleRate;
  const kb = (stitched.length * 2) / 1024;
  console.log(`\nwrote ${outPath}`);
  console.log(`  ${seconds.toFixed(2)}s · ${sampleRate}Hz · mono · ${kb.toFixed(1)}KB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
