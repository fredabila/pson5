/**
 * Browser ↔ backend contract. The backend streams Server-Sent Events on
 * /api/chat; we parse them here and surface a typed event stream to the UI.
 */

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

    // SSE frames are separated by \n\n. Flush every complete frame.
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
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
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
  layers: {
    observed: Record<string, unknown>;
    inferred: Record<string, unknown>;
    simulated: Record<string, unknown>;
  };
  behavioral_model?: Record<string, unknown>;
  knowledge_graph?: Record<string, unknown>;
}

export async function fetchProfileSnapshot(sessionId: string): Promise<ProfileSnapshot | null> {
  const response = await fetch(`/api/profile?session_id=${encodeURIComponent(sessionId)}`);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`profile fetch failed: ${response.status}`);
  }
  return (await response.json()) as ProfileSnapshot;
}
