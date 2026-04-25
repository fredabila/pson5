export type ChatStreamEvent =
  | { type: "ready"; profile_id: string }
  | { type: "assistant-delta"; text: string }
  | { type: "tool-start"; id: string; name: string; arguments: Record<string, unknown> }
  | {
      type: "tool-end";
      id: string;
      name: string;
      duration_ms?: number;
      result_preview?: string;
      error?: string;
    }
  | { type: "assistant-end"; stop_reason: string | null }
  | { type: "error"; message: string }
  | { type: "done" };

export async function* streamChat(
  input: { session_id: string; user_id: string; message: string },
  signal?: AbortSignal
): AsyncGenerator<ChatStreamEvent, void, void> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify(input),
    signal
  });
  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    throw new Error(`chat request failed: ${response.status} ${text.slice(0, 300)}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let frameBreak: number;
    while ((frameBreak = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, frameBreak);
      buffer = buffer.slice(frameBreak + 2);
      const parsed = parseSseFrame(frame);
      if (parsed) yield parsed;
    }
  }
}

function parseSseFrame(frame: string): ChatStreamEvent | null {
  let eventName: string | undefined;
  const dataLines: string[] = [];
  for (const rawLine of frame.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (!eventName) return null;
  let data: unknown = {};
  if (dataLines.length > 0) {
    try {
      data = JSON.parse(dataLines.join("\n"));
    } catch {
      return null;
    }
  }
  return { type: eventName, ...(data as object) } as ChatStreamEvent;
}

// ─── Profile snapshot ───────────────────────────────────────────────────

export interface ProfileSnapshot {
  profile_id: string;
  user_id: string;
  revision: number;
  confidence: number;
  source_count: number;
  layers: {
    observed: Record<string, unknown>;
    inferred: Record<string, unknown>;
    simulated: Record<string, unknown>;
  };
}

export async function fetchProfileSnapshot(sessionId: string): Promise<ProfileSnapshot | null> {
  const res = await fetch(`/api/profile?session_id=${encodeURIComponent(sessionId)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`profile fetch failed: ${res.status}`);
  return (await res.json()) as ProfileSnapshot;
}

// ─── Graph ──────────────────────────────────────────────────────────────

export type GraphNodeKind = "observed" | "inferred" | "simulated" | "root";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  domain: string;
  label: string;
  value: string;
  confidence?: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: "evidence" | "derivation" | "has_node";
}

export interface ProfileGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export async function fetchGraph(sessionId: string): Promise<ProfileGraph | null> {
  const res = await fetch(`/api/graph?session_id=${encodeURIComponent(sessionId)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`graph fetch failed: ${res.status}`);
  return (await res.json()) as ProfileGraph;
}
