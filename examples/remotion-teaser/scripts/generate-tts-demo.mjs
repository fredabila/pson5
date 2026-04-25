#!/usr/bin/env node
/**
 * Generate the chat-app demo's voiceover via Google Cloud TTS Chirp 3 HD.
 *
 * Separate from generate-tts-google.mjs (which does the 13-line teaser
 * narration). Lives in its own cache bucket so regenerating one doesn't
 * blow away the other.
 *
 * Auth: same ADC flow — `gcloud auth application-default login
 * --project=<PROJECT_ID>` and `gcloud services enable
 * texttospeech.googleapis.com --project=<PROJECT_ID>` first.
 */
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "..", "public", "audio");
const cacheDir = resolve(__dirname, "..", ".cache", "tts-demo");
mkdirSync(outDir, { recursive: true });
mkdirSync(cacheDir, { recursive: true });

const PROJECT_ID = process.env.PROJECT_ID ?? "eintercon-2160b";
const ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";

const VOICES = [
  { name: "en-US-Chirp3-HD-Charon", languageCode: "en-US", useSsml: false },
  { name: "en-US-Neural2-D", languageCode: "en-US", useSsml: true }
];

/**
 * Scripted as a developer giving a casual walkthrough to a colleague.
 * Contractions, "so", "now" etc. — reads like a human at a whiteboard,
 * not a corporate announcer.
 */
const LINES = [
  {
    id: "demo-01-hook",
    text:
      "Memory in AI agents today is a black box. Your name, a preference, a model-generated prediction — all stored as indistinguishable text, without a contract for which is which. PSON5 is an open-source personalization standard that treats user memory as infrastructure instead."
  },
  {
    id: "demo-02-layers",
    text:
      "Every user profile is split across three strictly-separated layers — observed, inferred, simulated. The separation is enforced in the TypeScript type system and at every engine boundary. It is not a convention you opt into. It is the architectural law of the codebase."
  },
  {
    id: "demo-03-observe",
    text:
      "Here is Claude running a chatbot backed by the PSON5 SDK. I introduce myself. The pson_observe_fact primitive fires, writing my name directly to the observed layer with agent-observation provenance — a new primitive shipped during this hackathon to bridge open conversation into structured memory without a pre-registered question."
  },
  {
    id: "demo-04-infer",
    text:
      "A few turns in, the inference engine runs on read. Three traits emerge — each carrying a confidence score, and evidence references back to the specific observed facts that support it. This is not summarization. It is a derivation trail you can audit."
  },
  {
    id: "demo-05-simulate",
    text:
      "Now the demonstration. Ask it to simulate a decision. pson_simulate returns more than a yes or no. Prediction, confidence, reasoning that cites the inferred traits by name, and caveats the engine is honest about. Every claim grounded in something measured."
  },
  {
    id: "demo-06-researcher",
    text:
      "Same infrastructure, a different shape. A Claude Managed Agent taking on the identity of a fictional Anthropic researcher. On turn one it seeds twenty persona facts. Ask how she would design Claude's reward model — she answers in character, reasoning through pson_simulate against her own profile."
  },
  {
    id: "demo-07-infra",
    text:
      "Underneath: fifteen MIT packages on npm. A TypeScript SDK, an Ink-based interactive CLI, a hand-rolled HTTP API with MCP support, Neo4j and Postgres storage adapters, a portable .pson file format. Merge at five-thousand-trait scale runs in three milliseconds."
  },
  {
    id: "demo-08-close",
    text:
      "Three layers, always separate. That is the hard rule. That is what makes agents built on PSON5 actually able to reason."
  }
];

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

async function synthesize(token, voice, line) {
  const body = {
    input: { text: line.text },
    voice: { languageCode: voice.languageCode, name: voice.name },
    audioConfig: {
      audioEncoding: "LINEAR16",
      sampleRateHertz: 48000,
      speakingRate: 1.02, // slightly brisker, demo-friendly
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

async function main() {
  const token = getAccessToken();
  console.log(`Generating ${LINES.length} demo voiceover lines → public/audio/`);

  const manifest = [];

  for (const line of LINES) {
    const cacheKey = createHash("sha256")
      .update(line.id + "|" + line.text)
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

    // Quick duration probe from the WAV header.
    const sampleRate = buf.readUInt32LE(24);
    const numChannels = buf.readUInt16LE(22);
    const bitsPerSample = buf.readUInt16LE(34);
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

  const manifestPath = resolve(outDir, "demo-vo-manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nwrote ${manifestPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
