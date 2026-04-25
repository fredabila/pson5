import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  streamChat,
  fetchProfileSnapshot,
  fetchGraph,
  type ProfileSnapshot,
  type ProfileGraph
} from "./api";
import { Composer } from "./components/Composer";
import { Message, type MessageState } from "./components/Message";
import { ProfilePanel } from "./components/ProfilePanel";
import { GraphPanel } from "./components/GraphPanel";
import { TopBar } from "./components/TopBar";

function getOrCreate(key: string, make: () => string): string {
  if (typeof window === "undefined") return "ssr";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const fresh = make();
  window.localStorage.setItem(key, fresh);
  return fresh;
}

type SidePanelMode = "profile" | "graph";

export function App() {
  const sessionId = useMemo(
    () => getOrCreate("pson5-pro-session-id", () => `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`),
    []
  );
  const userId = useMemo(
    () => getOrCreate("pson5-pro-user-id", () => `user_${Math.random().toString(36).slice(2, 10)}`),
    []
  );

  const [messages, setMessages] = useState<MessageState[]>([
    {
      id: "seed",
      role: "assistant",
      kind: "text",
      text:
        "Hi. This is the cloud edition — your profile lives in Postgres, so it survives browser reloads and process restarts. Tell me something about yourself, or pick a topic you want to think through in a structured way (wedding, career move, marathon training). Flip the panel on the right between the profile view and the live graph any time."
    }
  ]);
  const [profile, setProfile] = useState<ProfileSnapshot | null>(null);
  const [graph, setGraph] = useState<ProfileGraph | null>(null);
  const [sidePanel, setSidePanel] = useState<SidePanelMode>("profile");
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [snap, gr] = await Promise.all([fetchProfileSnapshot(sessionId), fetchGraph(sessionId)]);
      setProfile(snap);
      setGraph(gr);
    } catch {
      /* non-fatal — panels just won't refresh */
    }
  }, [sessionId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const resetSession = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    window.localStorage.removeItem("pson5-pro-session-id");
    window.localStorage.removeItem("pson5-pro-user-id");
    window.location.reload();
  }, []);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;

      const userMessage: MessageState = {
        id: `u_${Date.now()}`,
        role: "user",
        kind: "text",
        text: text.trim()
      };
      const assistantId = `a_${Date.now()}`;
      const pendingAssistant: MessageState = {
        id: assistantId,
        role: "assistant",
        kind: "text",
        text: "",
        streaming: true,
        toolCalls: []
      };
      setMessages((prev) => [...prev, userMessage, pendingAssistant]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        for await (const event of streamChat(
          { session_id: sessionId, user_id: userId, message: text.trim() },
          controller.signal
        )) {
          switch (event.type) {
            case "assistant-delta":
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, text: m.text + event.text } : m))
              );
              break;
            case "tool-start":
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        toolCalls: [
                          ...(m.toolCalls ?? []),
                          { id: event.id, name: event.name, arguments: event.arguments, state: "running" }
                        ]
                      }
                    : m
                )
              );
              break;
            case "tool-end":
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        toolCalls: (m.toolCalls ?? []).map((t) =>
                          t.id === event.id
                            ? {
                                ...t,
                                state: event.error ? "error" : "done",
                                durationMs: event.duration_ms,
                                resultPreview: event.result_preview,
                                error: event.error
                              }
                            : t
                        )
                      }
                    : m
                )
              );
              // Opportunistically refresh the side panel mid-turn so the
              // user can watch facts land as tools complete.
              refresh();
              break;
            case "assistant-end":
              setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m)));
              break;
            case "error":
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, streaming: false, text: m.text + `\n\n[error: ${event.message}]` }
                    : m
                )
              );
              break;
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error.";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, streaming: false, text: m.text + `\n\n[error: ${message}]` } : m
          )
        );
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
        refresh();
      }
    },
    [isStreaming, refresh, sessionId, userId]
  );

  return (
    <div className="app">
      <TopBar
        profileId={profile?.profile_id ?? null}
        userId={userId}
        revision={profile?.revision ?? null}
        confidence={profile?.confidence ?? null}
        sourceCount={profile?.source_count ?? null}
        sidePanel={sidePanel}
        onSidePanelChange={setSidePanel}
        onReset={resetSession}
      />

      <div className="layout">
        <main className="chat" aria-label="Conversation">
          <div className="chat__scroll">
            {messages.map((m) => (
              <Message key={m.id} message={m} />
            ))}
          </div>
          <Composer onSend={send} disabled={isStreaming} />
        </main>

        <aside className="side" aria-label={sidePanel === "profile" ? "Profile" : "Knowledge graph"}>
          {sidePanel === "profile" ? (
            <ProfilePanel profile={profile} />
          ) : (
            <GraphPanel graph={graph} />
          )}
        </aside>
      </div>
    </div>
  );
}
