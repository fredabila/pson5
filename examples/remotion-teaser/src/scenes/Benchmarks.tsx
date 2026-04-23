import React from "react";
import {
  AbsoluteFill,
  continueRender,
  delayRender,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig
} from "remotion";
import { COLORS, FONT, SPRING_SOFT } from "../style/tokens";
import { Eyebrow } from "../components/Eyebrow";
import { BenchmarkBar } from "../components/BenchmarkBar";
import { FALLBACK_BENCHMARKS, BenchmarkResult } from "../data/benchmarks";

/**
 * 0:50 – 0:56 · Three measured workloads animate in.
 *
 * Pulled from public/benchmarks.json if present (re-run `npm run bench`
 * in your environment to refresh). Falls back to conservative reference
 * numbers so the render never breaks.
 */
export const Benchmarks: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const [data, setData] = React.useState<BenchmarkResult>(FALLBACK_BENCHMARKS);

  React.useEffect(() => {
    const handle = delayRender("load-benchmarks");
    fetch(staticFile("benchmarks.json"))
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: BenchmarkResult) => {
        setData(json);
        continueRender(handle);
      })
      .catch(() => {
        // File missing — fallback is already in state.
        continueRender(handle);
      });
  }, []);

  const arrival = spring({ frame, fps, config: SPRING_SOFT });
  const titleOpacity = interpolate(arrival, [0, 1], [0, 1]);
  const titleY = interpolate(arrival, [0, 1], [18, 0]);

  const exit = interpolate(frame, [180, 210], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const workloads = [
    data.workloads.merge,
    data.workloads.simulate,
    data.workloads.serialize
  ];

  const colorMap: Record<string, string> = {
    observed: COLORS.observed,
    inferred: COLORS.inferred,
    simulated: COLORS.simulated
  };

  const measured = data.measuredAt === "reference"
    ? "reference workload · run `npm run bench` in your env"
    : `measured ${new Date(data.measuredAt).toLocaleDateString()} · ${data.platform}`;

  return (
    <AbsoluteFill
      style={{
        opacity: exit,
        padding: "90px 200px",
        display: "flex",
        flexDirection: "column",
        gap: 52
      }}
    >
      <div
        style={{
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`
        }}
      >
        <Eyebrow label="Benchmarks · reference workloads" accent={COLORS.accent} />
        <div
          style={{
            fontFamily: FONT.display,
            fontSize: 72,
            color: COLORS.ink0,
            letterSpacing: "-0.03em",
            marginTop: 18,
            lineHeight: 1.02
          }}
        >
          Fast enough to{" "}
          <span
            style={{
              fontStyle: "italic",
              color: COLORS.accent,
              fontVariationSettings: "'SOFT' 100"
            }}
          >
            not matter.
          </span>
        </div>
        <div
          style={{
            marginTop: 10,
            fontFamily: FONT.mono,
            fontSize: 13,
            color: COLORS.ink3,
            letterSpacing: "0.18em",
            textTransform: "uppercase"
          }}
        >
          {measured}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 34, maxWidth: 1420 }}>
        {workloads.map((w, i) => (
          <BenchmarkBar
            key={w.label}
            label={w.label}
            medianMs={w.medianMs}
            goalMs={w.goalMs}
            color={colorMap[w.color] ?? COLORS.accent}
            appearAt={28 + i * 22}
            index={i}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};
