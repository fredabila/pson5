#!/usr/bin/env node
/**
 * Measure a few indicative workloads for the teaser's Benchmarks scene.
 *
 * We deliberately keep this self-contained rather than importing the live
 * PSON5 engine — the goal is a reproducible, directional signal that
 * runs in any environment, not a substitute for a full benchmark suite.
 * Results are clearly labeled "reference" in the scene itself.
 *
 *  mergeTraits       — merge-and-dedupe over 5000 trait candidates
 *  serialize         — serialize + parse a 1000-fact profile (round trip)
 *  simulateDecision  — synthetic cold-sim over a cached state (1000 iters)
 *
 * Output lands at public/benchmarks.json which the Benchmarks scene
 * reads at render time (fallback defaults live in data/benchmarks.ts).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, "..", "public", "benchmarks.json");
mkdirSync(dirname(outPath), { recursive: true });

function ns(label, fn, warmups = 2, iters = 6) {
  for (let i = 0; i < warmups; i++) fn();
  const samples = [];
  for (let i = 0; i < iters; i++) {
    const t0 = performance.now();
    fn();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  const min = samples[0];
  const max = samples[samples.length - 1];
  console.log(
    `${label.padEnd(22)} median=${median.toFixed(2)}ms  min=${min.toFixed(2)}ms  max=${max.toFixed(2)}ms`
  );
  return { label, median, min, max, samples };
}

// --- merge: 5000 trait candidates deduped by (domain,name) ------------

function benchMerge() {
  const existing = [];
  for (let i = 0; i < 2500; i++) {
    existing.push({
      domain: `d${i % 10}`,
      name: `trait_${i}`,
      value: i,
      confidence: 0.6 + (i % 100) / 1000,
      sources: ["seed"]
    });
  }
  const incoming = [];
  for (let i = 0; i < 2500; i++) {
    incoming.push({
      domain: `d${i % 10}`,
      name: `trait_${i}`,
      value: i * 2,
      confidence: 0.7,
      sources: ["merge_run"]
    });
  }
  return () => {
    const index = new Map();
    for (const t of existing) index.set(`${t.domain}/${t.name}`, { ...t });
    for (const t of incoming) {
      const key = `${t.domain}/${t.name}`;
      const prev = index.get(key);
      if (!prev) {
        index.set(key, { ...t });
      } else {
        const mergedConfidence = Math.min(0.98, prev.confidence * 0.6 + t.confidence * 0.4);
        index.set(key, {
          ...prev,
          value: t.value,
          confidence: mergedConfidence,
          sources: Array.from(new Set([...prev.sources, ...t.sources]))
        });
      }
    }
    return index.size;
  };
}

// --- serialize: 1000-fact profile round-trip -------------------------

function benchSerialize() {
  const profile = {
    id: "josh",
    layers: {
      observed: {},
      inferred: {},
      simulated: {}
    }
  };
  for (let i = 0; i < 1000; i++) {
    const domain = `d${i % 12}`;
    const obs = (profile.layers.observed[domain] = profile.layers.observed[domain] ?? { facts: [] });
    obs.facts.push({
      name: `fact_${i}`,
      value: `value_${i}`,
      confidence: 0.8,
      observedAt: "2026-04-23T00:00:00Z"
    });
  }
  const json = JSON.stringify(profile);
  return () => {
    const parsed = JSON.parse(json);
    return JSON.stringify(parsed).length;
  };
}

// --- simulate: 1000 decision simulations over cached state -----------

function benchSimulate() {
  const traits = [];
  for (let i = 0; i < 40; i++) {
    traits.push({
      name: `trait_${i}`,
      weight: 0.3 + (i % 10) * 0.05,
      activationThreshold: 0.5
    });
  }
  const scenarios = [];
  for (let i = 0; i < 1000; i++) {
    scenarios.push({
      id: `s_${i}`,
      weights: Object.fromEntries(
        traits.map((t) => [t.name, 0.1 + ((i + t.name.length) % 7) * 0.1])
      )
    });
  }
  return () => {
    let accept = 0;
    for (const sc of scenarios) {
      let score = 0;
      for (const t of traits) {
        const w = sc.weights[t.name] ?? 0;
        score += w * t.weight;
      }
      if (score / traits.length > 0.25) accept++;
    }
    return accept;
  };
}

console.log("PSON5 teaser · reference workloads");
console.log("--------------------------------------------------------");

const merge = ns("mergeTraits (5000)", benchMerge());
const serialize = ns("serialize (1000 facts)", benchSerialize());
const simulate = ns("simulateDecision (1k)", benchSimulate());

const result = {
  measuredAt: new Date().toISOString(),
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  workloads: {
    merge: {
      label: "Merge 5000 traits",
      medianMs: Number(merge.median.toFixed(2)),
      goalMs: 50,
      color: "inferred"
    },
    simulate: {
      label: "Simulate 1000 decisions",
      medianMs: Number(simulate.median.toFixed(2)),
      goalMs: 40,
      color: "simulated"
    },
    serialize: {
      label: "Round-trip 1000 facts",
      medianMs: Number(serialize.median.toFixed(2)),
      goalMs: 20,
      color: "observed"
    }
  }
};

writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log("--------------------------------------------------------");
console.log(`wrote ${outPath}`);
