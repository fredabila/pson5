import type { ProfileSnapshot } from "../api";

interface Props {
  profile: ProfileSnapshot | null;
}

interface LayerEntry {
  domain: string;
  key: string;
  value: string;
  confidence?: number;
}

function valueToString(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

/**
 * Flatten whatever shape is in `layers.observed` / `layers.inferred` into
 * a list of { domain, key, value } rows. PSON5 writes these as nested
 * per-domain objects, but during zero-registry AI modeling the engine may
 * put entries under arbitrary shapes — this visitor is lenient.
 */
function flattenLayer(layer: Record<string, unknown>): LayerEntry[] {
  const out: LayerEntry[] = [];

  for (const [domain, domainValue] of Object.entries(layer ?? {})) {
    if (!domainValue || typeof domainValue !== "object") {
      out.push({ domain: "_", key: domain, value: valueToString(domainValue) });
      continue;
    }
    const record = domainValue as Record<string, unknown>;
    // `facts: [{ name, value, ... }]` is the common observed shape.
    if (Array.isArray((record as { facts?: unknown }).facts)) {
      for (const fact of (record as { facts: Array<Record<string, unknown>> }).facts) {
        out.push({
          domain,
          key: String(fact.name ?? fact.key ?? "?"),
          value: valueToString(fact.value),
          confidence:
            typeof fact.confidence === "number"
              ? fact.confidence
              : typeof (fact.confidence as { score?: number })?.score === "number"
                ? (fact.confidence as { score: number }).score
                : undefined
        });
      }
      continue;
    }
    // `traits: [{ key, value, confidence: { score } }]` is the common inferred shape.
    if (Array.isArray((record as { traits?: unknown }).traits)) {
      for (const trait of (record as { traits: Array<Record<string, unknown>> }).traits) {
        out.push({
          domain,
          key: String(trait.key ?? "?"),
          value: valueToString(trait.value),
          confidence:
            typeof (trait.confidence as { score?: number })?.score === "number"
              ? (trait.confidence as { score: number }).score
              : undefined
        });
      }
      continue;
    }
    // Plain key-value object.
    for (const [key, value] of Object.entries(record)) {
      out.push({ domain, key, value: valueToString(value) });
    }
  }

  return out;
}

function Lane({
  index,
  label,
  sublabel,
  accent,
  entries
}: {
  index: string;
  label: string;
  sublabel: string;
  accent: "observed" | "inferred" | "simulated";
  entries: LayerEntry[];
}) {
  return (
    <section className={`lane lane--${accent}`} aria-label={label}>
      <header className="lane__head">
        <span className="lane__index">{index}</span>
        <span className="lane__label">{label}</span>
        <span className="lane__count">{entries.length}</span>
      </header>
      <p className="lane__sub">{sublabel}</p>
      {entries.length === 0 ? (
        <div className="lane__empty">nothing yet</div>
      ) : (
        <ul className="lane__list">
          {entries.slice(0, 40).map((e, i) => (
            <li key={`${e.domain}/${e.key}/${i}`} className="lane__entry">
              <div className="lane__entry-key">
                <span className="lane__domain">{e.domain}</span>
                <span className="lane__sep">·</span>
                <span className="lane__fact">{e.key}</span>
              </div>
              <div className="lane__entry-value">
                <code>{e.value}</code>
                {e.confidence != null ? (
                  <span className="lane__confidence">{e.confidence.toFixed(2)}</span>
                ) : null}
              </div>
            </li>
          ))}
          {entries.length > 40 ? (
            <li className="lane__entry lane__entry--overflow">
              + {entries.length - 40} more
            </li>
          ) : null}
        </ul>
      )}
    </section>
  );
}

export function ProfilePanel({ profile }: Props) {
  if (!profile) {
    return (
      <div className="profile profile--empty">
        <div className="profile__empty-message">
          <span className="profile__empty-eyebrow">PROFILE</span>
          <h2>Your layered profile will appear here.</h2>
          <p>
            Send a message and the assistant will start populating the three
            layers: <strong>observed</strong> (what you said),
            <strong>inferred</strong> (what it deduced), and
            <strong>simulated</strong> (its predictions).
          </p>
        </div>
      </div>
    );
  }

  const observed = flattenLayer(profile.layers.observed);
  const inferred = flattenLayer(profile.layers.inferred);
  const simulated = flattenLayer(profile.layers.simulated);

  return (
    <div className="profile">
      <header className="profile__head">
        <span className="profile__eyebrow">PROFILE · LIVE</span>
        <h2 className="profile__title">What I know about you</h2>
      </header>

      <Lane
        index="01"
        label="OBSERVED"
        sublabel="facts you've told me directly"
        accent="observed"
        entries={observed}
      />
      <Lane
        index="02"
        label="INFERRED"
        sublabel="traits I've derived with confidence"
        accent="inferred"
        entries={inferred}
      />
      <Lane
        index="03"
        label="SIMULATED"
        sublabel="predictions I've generated in context"
        accent="simulated"
        entries={simulated}
      />
    </div>
  );
}
