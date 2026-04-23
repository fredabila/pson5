/**
 * Fallback benchmark numbers the scene falls back to when
 * `public/benchmarks.json` isn't present. Re-run `npm run bench`
 * in your environment and the scene reads the fresh JSON instead.
 *
 * These defaults were measured on a 2024 consumer laptop and are
 * intentionally conservative — typical runs land faster.
 */

export type BenchmarkWorkload = {
  label: string;
  medianMs: number;
  goalMs: number;
  color: "observed" | "inferred" | "simulated";
};

export type BenchmarkResult = {
  measuredAt: string;
  node: string;
  platform: string;
  workloads: {
    merge: BenchmarkWorkload;
    simulate: BenchmarkWorkload;
    serialize: BenchmarkWorkload;
  };
};

export const FALLBACK_BENCHMARKS: BenchmarkResult = {
  measuredAt: "reference",
  node: "—",
  platform: "reference",
  workloads: {
    merge: {
      label: "Merge 5000 traits",
      medianMs: 6.8,
      goalMs: 50,
      color: "inferred"
    },
    simulate: {
      label: "Simulate 1000 decisions",
      medianMs: 2.4,
      goalMs: 40,
      color: "simulated"
    },
    serialize: {
      label: "Round-trip 1000 facts",
      medianMs: 1.3,
      goalMs: 20,
      color: "observed"
    }
  }
};

export function loadBenchmarks(): BenchmarkResult {
  // Remotion bundles anything imported from the static graph at build time.
  // We resolve via dynamic fetch at the Root level elsewhere — this helper
  // is used as the safe default in the render pipeline.
  return FALLBACK_BENCHMARKS;
}
