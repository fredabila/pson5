#!/usr/bin/env node
/**
 * Generate the teaser's voiceover lines via Google Cloud Text-to-Speech.
 *
 * Auth: same ADC flow as the Lyria script —
 *   gcloud auth application-default login --project=<PROJECT_ID>
 *   gcloud services enable texttospeech.googleapis.com --project=<PROJECT_ID>
 *
 * One short line per key visual beat, cinematic restraint — we don't
 * narrate every scene. Output: public/audio/vo-<id>.wav plus a
 * vo-manifest.json Remotion can read if we ever want to drive timing
 * from data instead of the Teaser.tsx source.
 */
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "..", "public", "audio");
const cacheDir = resolve(__dirname, "..", ".cache", "tts");
mkdirSync(outDir, { recursive: true });
mkdirSync(cacheDir, { recursive: true });

const PROJECT_ID = process.env.PROJECT_ID ?? "eintercon-2160b";
const ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";

// Preferred voice list in order — we try Chirp 3 HD first (most natural),
// then Neural2 as fallback. SSA prosody is kept simple; Chirp 3 voices
// don't support SSML but they handle plain text with natural phrasing.
const VOICES = [
  { name: "en-US-Chirp3-HD-Charon", languageCode: "en-US", useSsml: false },
  { name: "en-US-Neural2-D", languageCode: "en-US", useSsml: true }
];

/**
 * Voiceover script — one line per beat, denser narration across every
 * scene. Timing anchored in Teaser.tsx. The manifest is the audio
 * payload; durations guide the sequence lengths.
 */
const LINES = [
  // HOOK (0:00 – 0:06)
  {
    id: "vo-01-hook-a",
    text: "Your agent doesn't know you.",
    ssml: "<speak>Your agent doesn't know you.</speak>"
  },
  {
    id: "vo-01-hook-b",
    text: "Every conversation starts from scratch.",
    ssml: "<speak>Every conversation <break time='100ms'/>starts from scratch.</speak>"
  },

  // GENERIC WOUND (0:06 – 0:16)
  {
    id: "vo-02-wound-a",
    text: "Same question. Two assistants. One gives you a generic checklist.",
    ssml:
      "<speak>Same question. <break time='180ms'/>Two assistants. <break time='180ms'/>One gives you a generic checklist.</speak>"
  },
  {
    id: "vo-02-wound-b",
    text:
      "The other knows you already turned down two FAANG offers for exactly this pattern.",
    ssml:
      "<speak>The other knows <break time='120ms'/>you already turned down two FAANG offers <break time='140ms'/>for exactly this pattern.</speak>"
  },

  // THREE LAYERS (0:16 – 0:28)
  {
    id: "vo-03-layers-a",
    text: "PSON separates three things agents routinely confuse.",
    ssml: "<speak>PSON separates three things <break time='140ms'/>agents routinely confuse.</speak>"
  },
  {
    id: "vo-03-layers-b",
    text: "What you said. What it inferred. What it predicts.",
    ssml:
      "<speak>What you said. <break time='220ms'/>What it inferred. <break time='220ms'/>What it predicts.</speak>"
  },

  // GRAPH (0:28 – 0:35)
  {
    id: "vo-04-graph",
    text:
      "Every inference is grounded in evidence. Every trait traces back to something real.",
    ssml:
      "<speak>Every inference <break time='140ms'/>is grounded in evidence. <break time='220ms'/>Every trait traces back to something real.</speak>"
  },

  // LOOP IN ACTION (0:35 – 0:45)
  {
    id: "vo-05-loop-a",
    text: "Your profile compounds silently.",
    ssml: "<speak>Your profile <break time='120ms'/>compounds silently.</speak>"
  },
  {
    id: "vo-05-loop-b",
    text:
      "In thirty days, the agent has built a working map of how you think.",
    ssml:
      "<speak>In thirty days, <break time='180ms'/>the agent has built a working map <break time='140ms'/>of how you think.</speak>"
  },

  // DECISION (0:45 – 0:55)
  {
    id: "vo-06-decision",
    text:
      "Three months in, when the question finally matters, the agent earns its keep.",
    ssml:
      "<speak>Three months in, <break time='200ms'/>when the question finally matters, <break time='180ms'/>the agent earns its keep.</speak>"
  },

  // BENCHMARKS (0:55 – 1:02)
  {
    id: "vo-07-bench",
    text:
      "Fast enough to not matter. The profile round-trips in under two milliseconds.",
    ssml:
      "<speak>Fast enough to not matter. <break time='240ms'/>The profile round-trips <break time='120ms'/>in under two milliseconds.</speak>"
  },

  // TAGLINE (1:02 – 1:08)
  {
    id: "vo-08-tagline",
    text: "Personalization your agents can actually reason about.",
    ssml:
      "<speak>Personalization <break time='180ms'/>your agents can <emphasis level='moderate'>actually</emphasis> reason about.</speak>"
  },

  // OUTRO (1:08 – 1:14)
  {
    id: "vo-09-outro",
    text: "PSON5. An open standard.",
    ssml: "<speak>PSON5. <break time='220ms'/>An open standard.</speak>"
  }
];

// --- auth --------------------------------------------------------------

function getAccessToken() {
  try {
    return execSync("gcloud auth application-default print-access-token", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch (err) {
    console.error(
      "Failed to get ADC token. Run `gcloud auth application-default login` first.\n",
      err.message
    );
    process.exit(1);
  }
}

// --- TTS call ----------------------------------------------------------

async function synthesize(token, voice, line) {
  const body = {
    input: voice.useSsml && line.ssml ? { ssml: line.ssml } : { text: line.text },
    voice: { languageCode: voice.languageCode, name: voice.name },
    audioConfig: {
      audioEncoding: "LINEAR16",
      sampleRateHertz: 48000,
      speakingRate: 1.06,
      pitch: 0
    }
  };

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Goog-User-Project": PROJECT_ID
    },
    body: JSON.stringify(body)
  });

  const raw = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, body: raw };
  }
  const json = JSON.parse(raw);
  if (!json.audioContent) {
    return { ok: false, status: 500, body: "no audioContent in response" };
  }
  return { ok: true, audioContent: json.audioContent };
}

async function synthesizeWithFallback(token, line) {
  for (const voice of VOICES) {
    const result = await synthesize(token, voice, line);
    if (result.ok) {
      return { ...result, voice: voice.name };
    }
    console.warn(
      `  × voice ${voice.name} failed (HTTP ${result.status}): ${String(
        result.body
      ).slice(0, 180)}`
    );
  }
  throw new Error(`all voices failed for "${line.id}"`);
}

// --- main --------------------------------------------------------------

async function main() {
  const token = getAccessToken();
  console.log(`Generating ${LINES.length} voiceover lines → public/audio/`);

  const manifest = [];

  for (const line of LINES) {
    const cacheKey = createHash("sha256")
      .update(line.id + "|" + line.text + "|" + (line.ssml ?? ""))
      .digest("hex")
      .slice(0, 16);
    const cachePath = resolve(cacheDir, `${cacheKey}.json`);

    let audioContent;
    let voice;
    if (existsSync(cachePath) && !process.env.REFRESH) {
      const cached = JSON.parse(readFileSync(cachePath, "utf8"));
      audioContent = cached.audioContent;
      voice = cached.voice;
      console.log(`  ${line.id}   cache hit (${voice})`);
    } else {
      const result = await synthesizeWithFallback(token, line);
      audioContent = result.audioContent;
      voice = result.voice;
      writeFileSync(cachePath, JSON.stringify({ audioContent, voice }));
      console.log(`  ${line.id}   ✓ ${voice}`);
    }

    const buf = Buffer.from(audioContent, "base64");
    const outPath = resolve(outDir, `${line.id}.wav`);
    writeFileSync(outPath, buf);

    // quick WAV inspect for duration
    const sampleRate = buf.readUInt32LE(24);
    const numChannels = buf.readUInt16LE(22);
    const bitsPerSample = buf.readUInt16LE(34);
    // scan for data chunk
    let p = 12;
    let dataSize = 0;
    while (p < buf.length - 8) {
      const id = buf.slice(p, p + 4).toString();
      const size = buf.readUInt32LE(p + 4);
      if (id === "data") {
        dataSize = Math.min(size, buf.length - (p + 8));
        break;
      }
      p += 8 + size + (size % 2);
    }
    const frames = dataSize / (numChannels * (bitsPerSample / 8));
    const seconds = frames / sampleRate;

    manifest.push({
      id: line.id,
      file: `${line.id}.wav`,
      text: line.text,
      voice,
      durationSeconds: Number(seconds.toFixed(3)),
      sampleRate
    });
    console.log(`               ${seconds.toFixed(2)}s · ${sampleRate}Hz`);
  }

  const manifestPath = resolve(outDir, "vo-manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nwrote ${manifestPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
